-- ---------------------------------------------------------------------------
-- S2: adaptive challenge gate, provider pools/caps, and the service principal.
--
-- Additive and reversible: no existing row is deleted. `challenge_mobile_enforce`
-- stays false until the Play Integrity service account (plan prerequisite H2)
-- exists; web/Turnstile verification works independently.
-- ---------------------------------------------------------------------------

-- Per-user challenge state. New users start at the configured threshold so the
-- first provider-bound request needs a verification.
create table if not exists public.ai_challenge_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calls_since_verified integer not null default 3 check (calls_since_verified >= 0),
  verified_at timestamptz,
  last_kind text check (last_kind is null or last_kind in ('turnstile', 'play_integrity')),
  updated_at timestamptz not null default now()
);

alter table public.ai_challenge_state enable row level security;
revoke all on public.ai_challenge_state from public, anon, authenticated;
grant select, insert, update, delete on public.ai_challenge_state to service_role;

comment on table public.ai_challenge_state is
  'Per-user adaptive challenge counter. Service role only; clients go through consume_ai_challenge().';

-- Single-use nonces that bind a Play Integrity token to a server request.
create table if not exists public.ai_challenge_nonces (
  nonce text primary key check (char_length(nonce) between 32 and 128),
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_challenge_nonces_user_idx
  on public.ai_challenge_nonces (user_id, expires_at);

alter table public.ai_challenge_nonces enable row level security;
revoke all on public.ai_challenge_nonces from public, anon, authenticated;
grant select, insert, update, delete on public.ai_challenge_nonces to service_role;

-- Request pools of the provider day. The gateway passes the provider and the
-- precomputed pool limit (a share of the 95 % guard) so the check is atomic.
create table if not exists public.ai_pool_daily (
  day date not null,
  pool text not null check (pool in ('anonymous', 'registered', 'service')),
  provider text not null default 'unknown',
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, pool, provider)
);

alter table public.ai_pool_daily enable row level security;
revoke all on public.ai_pool_daily from public, anon, authenticated;
grant select, insert, update, delete on public.ai_pool_daily to service_role;

comment on table public.ai_pool_daily is
  'Daily request pools (anonymous/registered/service) per provider. Service role only.';

-- Provider safety margin: every counted attempt (including model fallbacks and
-- retries) increments this row. The gateway stops at 95 % of AI_RPD_LIMIT.
create table if not exists public.ai_provider_attempts (
  day date not null,
  provider text not null,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, provider)
);

alter table public.ai_provider_attempts enable row level security;
revoke all on public.ai_provider_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_attempts to service_role;

-- The service principal records usage without an auth.users row. Allow a null
-- user_id only when a service principal is present, and keep the idempotency
-- contract per principal.
alter table public.ai_usage_events
  add column if not exists service_principal text;

alter table public.ai_usage_events
  alter column user_id drop not null;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_principal_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_principal_check
  check (user_id is not null or service_principal is not null);

create unique index if not exists ai_usage_events_service_request_key
  on public.ai_usage_events (service_principal, request_id)
  where service_principal is not null;

-- ---------------------------------------------------------------------------
-- Config knobs (all data, no code).
-- ---------------------------------------------------------------------------
alter table public.app_config
  add column if not exists challenge_every_n_calls integer not null default 3
    check (challenge_every_n_calls >= 1);

alter table public.app_config
  add column if not exists challenge_mobile_enforce boolean not null default false;

alter table public.app_config
  add column if not exists challenge_turnstile_action text not null default 'ai_gate';

alter table public.app_config
  add column if not exists anonymous_unattested_daily_cap integer not null default 10
    check (anonymous_unattested_daily_cap >= 0);

alter table public.app_config
  add column if not exists pool_anonymous_pct integer not null default 60
    check (pool_anonymous_pct between 0 and 100);

alter table public.app_config
  add column if not exists pool_registered_pct integer not null default 40
    check (pool_registered_pct between 0 and 100);

comment on column public.app_config.challenge_mobile_enforce is
  'false until the Play Integrity service account exists (plan H2); web Turnstile is always enforced.';

-- Plan caps from the plan defaults: anonymous 20 AI + 5 scans, registered 60 + 15.
update public.plans
set features = features || '{"suggestions":20,"recipe":20,"chat":20,"stream":20,"scan":5}'::jsonb
where id = 'anonymous';

update public.plans
set features = features || '{"suggestions":60,"recipe":60,"chat":60,"stream":60,"scan":15}'::jsonb
where id = 'free';

-- ---------------------------------------------------------------------------
-- Challenge RPCs
-- ---------------------------------------------------------------------------
create or replace function public.consume_ai_challenge(
  p_user_id uuid,
  p_every_n integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.ai_challenge_state%rowtype;
begin
  if p_user_id is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_every_n is null or p_every_n < 1 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':challenge', 0));

  insert into public.ai_challenge_state (user_id, calls_since_verified)
  values (p_user_id, p_every_n)
  on conflict (user_id) do nothing;

  select * into v_state
  from public.ai_challenge_state
  where user_id = p_user_id
  for update;

  if v_state.calls_since_verified >= p_every_n then
    return jsonb_build_object(
      'allowed', false,
      'calls_since_verified', v_state.calls_since_verified,
      'verified_at', v_state.verified_at
    );
  end if;

  update public.ai_challenge_state
  set calls_since_verified = calls_since_verified + 1,
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'allowed', true,
    'calls_since_verified', v_state.calls_since_verified + 1,
    'verified_at', v_state.verified_at
  );
end;
$$;

create or replace function public.reset_ai_challenge(
  p_user_id uuid,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_kind not in ('turnstile', 'play_integrity') then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  insert into public.ai_challenge_state as s (user_id, calls_since_verified, verified_at, last_kind, updated_at)
  values (p_user_id, 0, now(), p_kind, now())
  on conflict (user_id) do update
    set calls_since_verified = 0,
        verified_at = now(),
        last_kind = excluded.last_kind,
        updated_at = now();
end;
$$;

create or replace function public.create_ai_challenge_nonce(
  p_user_id uuid,
  p_ttl_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nonce text;
  v_expires timestamptz;
begin
  if p_user_id is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 30 or p_ttl_seconds > 900 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  v_nonce := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(secs => p_ttl_seconds);

  delete from public.ai_challenge_nonces
  where user_id = p_user_id and (used_at is not null or expires_at < now());

  insert into public.ai_challenge_nonces (nonce, user_id, expires_at)
  values (v_nonce, p_user_id, v_expires);

  return jsonb_build_object('nonce', v_nonce, 'expires_at', v_expires);
end;
$$;

-- Consumes a nonce exactly once. Returns true when it was valid.
create or replace function public.consume_ai_challenge_nonce(
  p_user_id uuid,
  p_nonce text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_user_id is null or p_nonce is null or char_length(p_nonce) < 32 then
    return false;
  end if;

  update public.ai_challenge_nonces
  set used_at = now()
  where nonce = p_nonce
    and user_id = p_user_id
    and used_at is null
    and expires_at >= now();
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provider guard: count every attempt before the HTTP request is made.
-- ---------------------------------------------------------------------------
create or replace function public.record_provider_attempt(
  p_provider text,
  p_guard_limit integer default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
begin
  if p_provider is null or char_length(p_provider) = 0 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  insert into public.ai_provider_attempts as a (day, provider, attempts, updated_at)
  values (current_date, left(p_provider, 64), 1, now())
  on conflict (day, provider) do update
    set attempts = a.attempts + 1,
        updated_at = now()
  returning attempts into v_attempts;

  if p_guard_limit is not null and p_guard_limit >= 0 and v_attempts > p_guard_limit then
    raise exception 'provider_daily_guard_exceeded'
      using errcode = 'P0001', detail = p_provider;
  end if;

  return v_attempts;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quota reservation v2: adds pools, the optional service principal, and leaves
-- the existing per-user logic untouched.
-- ---------------------------------------------------------------------------
drop function if exists public.reserve_ai_quota(uuid, uuid, text, bigint, text, text);

create or replace function public.reserve_ai_quota(
  p_user_id uuid,
  p_request_id uuid,
  p_feature text,
  p_reserved_micro_usd bigint,
  p_provider text default null,
  p_model text default null,
  p_pool text default null,
  p_pool_limit integer default null,
  p_service text default null,
  p_daily_cap integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing public.ai_usage_events%rowtype;
  v_plan public.plans%rowtype;
  v_daily_limit integer;
  v_daily_used integer;
  v_monthly_budget bigint;
  v_monthly_used bigint;
  v_global_cap bigint;
  v_global_used bigint;
  v_event_id uuid;
  v_kill boolean;
  v_feature_enabled boolean;
  v_pool_used integer;
begin
  if p_request_id is null or p_feature is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_user_id is null and p_service is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_user_id is not null and p_service is not null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_reserved_micro_usd is null or p_reserved_micro_usd < 0 then
    raise exception 'invalid_reserved_amount' using errcode = '22023';
  end if;
  if p_pool is not null and p_pool not in ('anonymous', 'registered', 'service') then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  -- Serialize quota decisions for the same principal+feature.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(p_user_id::text, p_service) || ':' || p_feature, 0)
  );

  select * into v_existing
  from public.ai_usage_events e
  where e.request_id = p_request_id
    and (
      (p_user_id is not null and e.user_id = p_user_id)
      or (p_user_id is null and e.service_principal = p_service)
    );
  if found then
    return jsonb_build_object(
      'event_id', v_existing.id,
      'status', v_existing.status,
      'idempotent', true,
      'reserved_micro_usd', v_existing.reserved_micro_usd
    );
  end if;

  select ai_kill_switch into v_kill from public.app_config where id = 1;
  if coalesce(v_kill, false) then
    raise exception 'ai_kill_switch' using errcode = 'P0001';
  end if;

  select coalesce((feature_flags ->> p_feature)::boolean, true)
  into v_feature_enabled
  from public.app_config where id = 1;
  if not coalesce(v_feature_enabled, true) then
    raise exception 'feature_disabled' using errcode = 'P0001';
  end if;

  -- Pool accounting happens before the per-user checks so an exhausted
  -- anonymous pool costs a registered user nothing and vice versa.
  if p_pool is not null and p_pool_limit is not null then
    insert into public.ai_pool_daily as d (day, pool, provider, requests, updated_at)
    values (current_date, p_pool, coalesce(left(p_provider, 64), 'unknown'), 1, now())
    on conflict (day, pool, provider) do update
      set requests = d.requests + 1,
          updated_at = now()
    returning requests into v_pool_used;

    if v_pool_used > p_pool_limit then
      raise exception 'ai_pool_exhausted:%', p_pool using errcode = 'P0001';
    end if;
  end if;

  -- Service principal: no profile/plan; the gateway enforces its own
  -- per-user/day caps and the pool.
  if p_service is not null then
    insert into public.ai_global_daily (day) values (current_date)
    on conflict (day) do nothing;

    select global_daily_cap_micro_usd into v_global_cap from public.app_config where id = 1;
    select cost_micro_usd into v_global_used
    from public.ai_global_daily where day = current_date for update;
    if v_global_cap >= 0 and v_global_used + p_reserved_micro_usd > v_global_cap then
      raise exception 'global_budget_exceeded' using errcode = 'P0001';
    end if;

    insert into public.ai_usage_events (
      user_id, service_principal, request_id, feature, provider, model, status,
      reserved_micro_usd
    )
    values (
      null, p_service, p_request_id, p_feature, p_provider, p_model, 'reserved',
      p_reserved_micro_usd
    )
    returning id into v_event_id;

    update public.ai_global_daily
    set requests = requests + 1,
        cost_micro_usd = cost_micro_usd + p_reserved_micro_usd,
        updated_at = now()
    where day = current_date;

    return jsonb_build_object(
      'event_id', v_event_id,
      'status', 'reserved',
      'idempotent', false,
      'reserved_micro_usd', p_reserved_micro_usd,
      'service_principal', p_service
    );
  end if;

  select pl.* into v_plan
  from public.profiles pr
  join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_daily_limit := coalesce((v_plan.features ->> p_feature)::integer, 0);
  if p_daily_cap is not null and p_daily_cap >= 0
     and (v_daily_limit < 0 or p_daily_cap < v_daily_limit) then
    v_daily_limit := p_daily_cap;
  end if;
  if v_daily_limit = 0 then
    raise exception 'feature_disabled' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_daily_used
  from public.ai_usage_events e
  where e.user_id = p_user_id
    and e.feature = p_feature
    and e.created_at >= date_trunc('day', now())
    and e.status in ('reserved', 'settled')
    and not e.cache_hit;
  if v_daily_limit >= 0 and v_daily_used >= v_daily_limit then
    raise exception 'daily_limit_exceeded' using errcode = 'P0001';
  end if;

  v_monthly_budget := v_plan.monthly_budget_micro_usd;
  select coalesce(sum(
    case when e.status = 'reserved' then e.reserved_micro_usd else e.cost_micro_usd end
  ), 0)::bigint into v_monthly_used
  from public.ai_usage_events e
  where e.user_id = p_user_id
    and e.created_at >= date_trunc('month', now())
    and e.status in ('reserved', 'settled')
    and not e.cache_hit;
  if v_monthly_budget >= 0 and v_monthly_used + p_reserved_micro_usd > v_monthly_budget then
    raise exception 'monthly_budget_exceeded' using errcode = 'P0001';
  end if;

  -- Global circuit breaker. The row lock serializes concurrent reservations.
  insert into public.ai_global_daily (day) values (current_date)
  on conflict (day) do nothing;
  select global_daily_cap_micro_usd into v_global_cap from public.app_config where id = 1;
  select cost_micro_usd into v_global_used
  from public.ai_global_daily where day = current_date for update;
  if v_global_cap >= 0 and v_global_used + p_reserved_micro_usd > v_global_cap then
    raise exception 'global_budget_exceeded' using errcode = 'P0001';
  end if;

  insert into public.ai_usage_events (
    user_id, request_id, feature, provider, model, status, reserved_micro_usd
  )
  values (
    p_user_id, p_request_id, p_feature, p_provider, p_model, 'reserved', p_reserved_micro_usd
  )
  returning id into v_event_id;

  insert into public.ai_usage_counters (
    user_id, period_kind, period_start, feature, requests, cost_micro_usd
  )
  values
    (p_user_id, 'day', current_date, p_feature, 1, p_reserved_micro_usd),
    (p_user_id, 'month', date_trunc('month', current_date)::date, p_feature, 1, p_reserved_micro_usd)
  on conflict (user_id, period_kind, period_start, feature) do update
    set requests = public.ai_usage_counters.requests + 1,
        cost_micro_usd = public.ai_usage_counters.cost_micro_usd + excluded.cost_micro_usd,
        updated_at = now();

  update public.ai_global_daily
  set requests = requests + 1,
      cost_micro_usd = cost_micro_usd + p_reserved_micro_usd,
      updated_at = now()
  where day = current_date;

  return jsonb_build_object(
    'event_id', v_event_id,
    'status', 'reserved',
    'idempotent', false,
    'reserved_micro_usd', p_reserved_micro_usd,
    'daily_used', v_daily_used + 1,
    'daily_limit', v_daily_limit,
    'monthly_used_micro_usd', v_monthly_used + p_reserved_micro_usd,
    'monthly_budget_micro_usd', v_monthly_budget,
    'global_used_micro_usd', v_global_used + p_reserved_micro_usd,
    'global_cap_micro_usd', v_global_cap
  );
end;
$$;

-- `settle_ai_usage`/`refund_ai_usage` look rows up by event id only, so they
-- already work for service events.

-- Service-principal usage snapshot. There is no auth.users row, so the regular
-- get_my_usage() cannot serve it. Service traffic is metered against the
-- end user's anonymous/registered pool, so the snapshot counts today's service
-- events (cache hits excluded) plus the month-to-date cost.
create or replace function public.get_service_usage(p_service text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_daily integer;
  v_cost bigint;
begin
  if p_service is null or char_length(p_service) = 0 then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;

  select count(*)::integer into v_daily
  from public.ai_usage_events e
  where e.service_principal = p_service
    and e.created_at >= date_trunc('day', now())
    and e.status in ('reserved', 'settled')
    and not e.cache_hit;

  select coalesce(sum(e.cost_micro_usd), 0)::bigint into v_cost
  from public.ai_usage_events e
  where e.service_principal = p_service
    and e.created_at >= date_trunc('month', now())
    and e.status = 'settled'
    and not e.cache_hit;

  return jsonb_build_object(
    'plan_id', 'service',
    'daily', jsonb_build_object(
      'ai', jsonb_build_object('limit', -1, 'used', v_daily, 'remaining', null)
    ),
    'monthly', jsonb_build_object(
      'budget_micro_usd', -1,
      'used_micro_usd', v_cost,
      'remaining_micro_usd', null
    ),
    'resets_at', (date_trunc('day', now()) + interval '1 day')::timestamptz
  );
end;
$$;

revoke all on function public.get_service_usage(text) from public, anon, authenticated;
grant execute on function public.get_service_usage(text) to service_role;

revoke all on function public.reserve_ai_quota(uuid, uuid, text, bigint, text, text, text, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_quota(uuid, uuid, text, bigint, text, text, text, integer, text, integer)
  to service_role;

revoke all on function public.consume_ai_challenge(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ai_challenge(uuid, integer) to service_role;

revoke all on function public.reset_ai_challenge(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reset_ai_challenge(uuid, text) to service_role;

revoke all on function public.create_ai_challenge_nonce(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.create_ai_challenge_nonce(uuid, integer) to service_role;

revoke all on function public.consume_ai_challenge_nonce(uuid, text)
  from public, anon, authenticated;
grant execute on function public.consume_ai_challenge_nonce(uuid, text) to service_role;

revoke all on function public.record_provider_attempt(text, integer)
  from public, anon, authenticated;
grant execute on function public.record_provider_attempt(text, integer) to service_role;

comment on function public.reserve_ai_quota(uuid, uuid, text, bigint, text, text, text, integer, text, integer) is
  'Atomically reserves AI usage, checks the anonymous/registered/service pool, and records service-principal calls without an auth.users row.';
comment on function public.record_provider_attempt(text, integer) is
  'Counts one provider HTTP attempt (including fallbacks) and rejects past the 95 % daily guard.';
comment on function public.consume_ai_challenge(uuid, integer) is
  'Returns allowed=false when the user must solve a challenge before the next provider-bound call.';
