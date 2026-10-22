-- ---------------------------------------------------------------------------
-- M4 AI gateway: Gemini routing/prices, substitution metering, cache-hit RPC,
-- and admin spend/cache views.
--
-- All changes are additive and safe to apply after the M0/M1 migrations.
-- ---------------------------------------------------------------------------

-- The substitution endpoint is metered separately from chat so a cheap
-- flash-lite call does not consume the more expensive chat allowance.
update public.plans
set features = features || '{"substitution": 10}'::jsonb
where id = 'anonymous';

update public.plans
set features = features || '{"substitution": 30}'::jsonb
where id = 'free';

update public.plans
set features = features || '{"substitution": 200}'::jsonb
where id = 'pro';

update public.app_config
set feature_flags = feature_flags || '{"substitution": true}'::jsonb
where id = 1;

-- Active Gemini prices in micro-USD per 1M tokens. The M1 seed used the
-- vendor label 'google'; runtime provider ids are AI_PROVIDERS values, so the
-- active rows use 'gemini'. The historical 'google' row is intentionally left
-- untouched for auditability. Providers are selected from env/app_config and
-- prices are always read from this table.
insert into public.ai_model_prices (
  provider,
  model,
  input_micro_usd_per_million,
  output_micro_usd_per_million,
  active,
  effective_from,
  source_note
)
values
  ('gemini', 'gemini-2.5-flash-lite', 100000, 400000, true,
   '2026-10-22T00:00:00Z', 'Gemini API list price; verify before production traffic'),
  ('gemini', 'gemini-2.5-flash', 300000, 2500000, true,
   '2026-10-22T00:00:00Z', 'Gemini API list price; verify before production traffic'),
  ('gemini', 'gemini-2.0-flash', 100000, 400000, true,
   '2026-10-22T00:00:00Z', 'Gemini API list price; fallback model'),
  ('gemini', 'gemini-2.5-pro', 1250000, 10000000, true,
   '2026-10-22T00:00:00Z', 'Gemini API list price; fallback model')
on conflict (provider, model, effective_from) do update set
  input_micro_usd_per_million = excluded.input_micro_usd_per_million,
  output_micro_usd_per_million = excluded.output_micro_usd_per_million,
  active = excluded.active,
  source_note = excluded.source_note;

-- Routing is data, not code. AI_PROVIDER can still override the provider at
-- deploy time (for example AI_PROVIDER=fake on staging), while the model names
-- below remain the production defaults.
update public.app_config
set model_routing = jsonb_build_object(
  'provider', 'gemini',
  'models', jsonb_build_object(
    'suggestions', 'gemini-2.5-flash-lite',
    'recipe', 'gemini-2.5-flash',
    'chat', 'gemini-2.5-flash',
    'stream', 'gemini-2.5-flash',
    'scan', 'gemini-2.5-flash',
    'substitution', 'gemini-2.5-flash-lite'
  ),
  'fallbacks', jsonb_build_object(
    'text', jsonb_build_array(
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    ),
    'vision', jsonb_build_array(
      'gemini-2.5-flash',
      'gemini-2.0-flash'
    )
  )
)
where id = 1;

-- Cache hits are recorded as zero-cost ai_usage_events with cache_hit=true.
-- They must remain visible in the admin views but must not consume the user's
-- daily request allowance. Re-declare the M1 function with that exclusion; the
-- rest of the reservation logic is intentionally unchanged.
create or replace function public.reserve_ai_quota(
  p_user_id uuid,
  p_request_id uuid,
  p_feature text,
  p_reserved_micro_usd bigint,
  p_provider text default null,
  p_model text default null
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
begin
  if p_user_id is null or p_request_id is null or p_feature is null then
    raise exception 'invalid_arguments' using errcode = '22023';
  end if;
  if p_reserved_micro_usd is null or p_reserved_micro_usd < 0 then
    raise exception 'invalid_reserved_amount' using errcode = '22023';
  end if;

  -- Serialize quota decisions for the same user+feature.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_feature, 0));

  select * into v_existing
  from public.ai_usage_events e
  where e.user_id = p_user_id and e.request_id = p_request_id;
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

  select pl.* into v_plan
  from public.profiles pr
  join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user_id;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_daily_limit := coalesce((v_plan.features ->> p_feature)::integer, 0);
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

-- Atomic cache hit counter used by the cache gateway. Only service_role may
-- call this; clients never see the cache table.
create or replace function public.record_ai_cache_hit(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  if p_key is null or char_length(p_key) < 16 then
    raise exception 'invalid_cache_key' using errcode = '22023';
  end if;

  update public.ai_response_cache
  set hit_count = hit_count + 1
  where key = p_key
  returning hit_count into v_hits;

  return coalesce(v_hits, 0);
end;
$$;

revoke all on function public.record_ai_cache_hit(text)
  from public, anon, authenticated;
grant execute on function public.record_ai_cache_hit(text)
  to service_role;

-- Admin/read-only views. No client grants: these are for the dashboard and
-- service-role runbooks. security_invoker keeps RLS meaningful if a future
-- admin role is granted access.
create or replace view public.v_ai_spend_daily
with (security_invoker = true) as
select
  (e.created_at at time zone 'utc')::date as day,
  e.feature,
  e.provider,
  e.model,
  count(*) filter (where e.status = 'settled' and not e.cache_hit)::bigint
    as settled_requests,
  count(*) filter (where e.cache_hit)::bigint as cache_hits,
  count(*) filter (where e.status = 'refunded')::bigint as refunded_requests,
  count(*) filter (where e.status = 'failed')::bigint as failed_requests,
  coalesce(sum(e.input_tokens) filter (where e.status = 'settled'), 0)::bigint as input_tokens,
  coalesce(sum(e.output_tokens) filter (where e.status = 'settled'), 0)::bigint as output_tokens,
  coalesce(sum(e.cost_micro_usd) filter (where e.status = 'settled'), 0)::bigint as cost_micro_usd
from public.ai_usage_events e
group by 1, 2, 3, 4;

create or replace view public.v_ai_spend_by_user
with (security_invoker = true) as
select
  e.user_id,
  p.plan_id,
  e.feature,
  e.provider,
  e.model,
  count(*) filter (where e.status = 'settled' and not e.cache_hit)::bigint as requests,
  count(*) filter (where e.cache_hit)::bigint as cache_hits,
  coalesce(sum(e.cost_micro_usd) filter (where e.status = 'settled'), 0)::bigint
    as cost_micro_usd,
  max(e.created_at) as last_request_at
from public.ai_usage_events e
left join public.profiles p on p.id = e.user_id
group by e.user_id, p.plan_id, e.feature, e.provider, e.model;

create or replace view public.v_ai_cache_hit_rate
with (security_invoker = true) as
select
  (e.created_at at time zone 'utc')::date as day,
  e.feature,
  e.provider,
  e.model,
  count(*)::bigint as total_requests,
  count(*) filter (where e.cache_hit)::bigint as cache_hits,
  case
    when count(*) = 0 then 0
    else round(
      (count(*) filter (where e.cache_hit))::numeric / count(*)::numeric,
      4
    )
  end as hit_rate
from public.ai_usage_events e
group by 1, 2, 3, 4;

revoke all on public.v_ai_spend_daily from public, anon, authenticated;
revoke all on public.v_ai_spend_by_user from public, anon, authenticated;
revoke all on public.v_ai_cache_hit_rate from public, anon, authenticated;
grant select on public.v_ai_spend_daily to service_role;
grant select on public.v_ai_spend_by_user to service_role;
grant select on public.v_ai_cache_hit_rate to service_role;

comment on function public.record_ai_cache_hit(text)
  is 'Increments ai_response_cache.hit_count for a successful cache hit; service_role only.';
comment on view public.v_ai_spend_daily
  is 'Daily AI request, token, and micro-USD spend totals (service_role/admin only).';
comment on view public.v_ai_spend_by_user
  is 'Per-user/per-feature AI spend totals (service_role/admin only).';
comment on view public.v_ai_cache_hit_rate
  is 'Daily cache hit rate by feature (service_role/admin only).';
