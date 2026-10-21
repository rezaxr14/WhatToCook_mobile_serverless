-- Business logic: exact recipe matcher, demo pantry, AI quota metering, account deletion.

-- ---------------------------------------------------------------------------
-- Python-style round-half-to-even (the reference uses Python's round()).
-- ---------------------------------------------------------------------------
create or replace function public.python_round(value numeric)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when value is null then null
    when (value - pg_catalog.floor(value)) = 0.5 then
      case
        when pg_catalog.mod(pg_catalog.floor(value)::bigint, 2) = 0
          then pg_catalog.floor(value)::integer
        else pg_catalog.ceil(value)::integer
      end
    else pg_catalog.round(value)::integer
  end
$$;

-- ---------------------------------------------------------------------------
-- Exact matcher. Preserves the reference OR rule:
--   partial when missing_count <= 2 OR match_pct >= 50
-- so a 0% recipe with two missing ingredients is included.
-- ---------------------------------------------------------------------------
create or replace function public.can_cook()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with pantry as (
    select distinct pi.ingredient_id
    from public.pantry_items pi
    where pi.user_id = (select auth.uid())
      and pi.deleted_at is null
  ),
  recipe_req as (
    select r.id, count(distinct ri.ingredient_id)::integer as required_count
    from public.recipes r
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    where r.deleted_at is null
    group by r.id
  ),
  recipe_match as (
    select
      rr.id,
      rr.required_count,
      count(distinct ri.ingredient_id)
        filter (where p.ingredient_id is not null)::integer as matched_count
    from recipe_req rr
    join public.recipe_ingredients ri on ri.recipe_id = rr.id
    left join pantry p on p.ingredient_id = ri.ingredient_id
    group by rr.id, rr.required_count
  ),
  scored as (
    select
      rm.id,
      rm.required_count,
      rm.matched_count,
      (rm.required_count - rm.matched_count)::integer as missing_count,
      public.python_round((rm.matched_count::numeric / rm.required_count) * 100) as match_pct
    from recipe_match rm
  ),
  payload as (
    select
      s.id,
      s.match_pct,
      s.missing_count,
      jsonb_build_object(
        'id', r.id,
        'name', coalesce(r.title ->> 'en', r.title ->> 'tr', ''),
        'description', coalesce(r.description ->> 'en', ''),
        'cooking_time', r.cooking_time_minutes,
        'instructions', coalesce((
          select pg_catalog.string_agg(value, E'\n' order by ord)
          from jsonb_array_elements_text(coalesce(r.instructions, '[]'::jsonb))
            with ordinality as t(value, ord)
        ), ''),
        'steps', coalesce(r.instructions, '[]'::jsonb),
        'image', r.image_path,
        'image_url', null,
        'source', r.source,
        'owner_id', r.owner_id,
        'ingredients', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'name', coalesce(i.names ->> 'en', ''),
              'calories_per_100g', i.calories_per_100g,
              'category', i.category,
              'image_url', null
            )
            order by i.name_en
          )
          from public.recipe_ingredients ri
          join public.ingredients i on i.id = ri.ingredient_id
          where ri.recipe_id = r.id
        ), '[]'::jsonb),
        'recipe_ingredients', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', ri.id,
              'ingredient_id', ri.ingredient_id,
              'quantity', ri.quantity,
              'unit', ri.unit,
              'optional', ri.optional,
              'ingredient', jsonb_build_object(
                'id', i.id,
                'name', coalesce(i.names ->> 'en', ''),
                'calories_per_100g', i.calories_per_100g,
                'category', i.category,
                'image_url', null
              )
            )
            order by ri.sort_order, ri.id
          )
          from public.recipe_ingredients ri
          join public.ingredients i on i.id = ri.ingredient_id
          where ri.recipe_id = r.id
        ), '[]'::jsonb),
        'missing_ingredients', coalesce((
          select jsonb_agg(coalesce(i.names ->> 'en', '') order by i.name_en)
          from public.recipe_ingredients ri
          join public.ingredients i on i.id = ri.ingredient_id
          where ri.recipe_id = r.id
            and not exists (
              select 1 from pantry p where p.ingredient_id = ri.ingredient_id
            )
        ), '[]'::jsonb),
        'matched_ingredients', coalesce((
          select jsonb_agg(coalesce(i.names ->> 'en', '') order by i.name_en)
          from public.recipe_ingredients ri
          join public.ingredients i on i.id = ri.ingredient_id
          where ri.recipe_id = r.id
            and exists (
              select 1 from pantry p where p.ingredient_id = ri.ingredient_id
            )
        ), '[]'::jsonb),
        'match_percentage', s.match_pct,
        'missing_count', s.missing_count
      ) as recipe
    from scored s
    join public.recipes r on r.id = s.id
  )
  select jsonb_build_object(
    'full_matches', coalesce((
      select jsonb_agg(recipe)
      from payload
      where missing_count = 0
    ), '[]'::jsonb),
    'partial_matches', coalesce((
      select jsonb_agg(recipe order by match_pct desc)
      from payload
      where missing_count > 0
        and (missing_count <= 2 or match_pct >= 50)
    ), '[]'::jsonb),
    'pantry_ingredient_count', (select count(*)::integer from pantry),
    'total_full_matches', (select count(*)::integer from payload where missing_count = 0),
    'total_partial_matches', (
      select count(*)::integer
      from payload
      where missing_count > 0
        and (missing_count <= 2 or match_pct >= 50)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Demo data: the reference's 11-item ChefDemo pantry, per anonymous user.
-- ---------------------------------------------------------------------------
create or replace function public.seed_demo_data()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.pantry_items (user_id, ingredient_id)
  select v_uid, i.id
  from public.ingredients i
  where i.name_en in (
    'Garlic', 'Onion', 'Tomato', 'Eggs', 'Milk', 'Butter',
    'Chicken Breast', 'Rice', 'Flour', 'Olive Oil', 'Salt'
  )
  on conflict (user_id, ingredient_id) do update
    set deleted_at = null, updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- AI quota: reserve -> settle (success) or refund (failure).
-- Only service_role may call these; the Edge Function gateway owns the flow.
-- ---------------------------------------------------------------------------
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
    and e.status in ('reserved', 'settled');
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
    and e.status in ('reserved', 'settled');
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

create or replace function public.settle_ai_usage(
  p_event_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_micro_usd bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ai_usage_events%rowtype;
  v_delta bigint;
begin
  if p_event_id is null then
    raise exception 'invalid_event_id' using errcode = '22023';
  end if;
  if p_cost_micro_usd is null or p_cost_micro_usd < 0 then
    raise exception 'invalid_cost' using errcode = '22023';
  end if;

  select * into v_event
  from public.ai_usage_events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if v_event.status <> 'reserved' then
    return jsonb_build_object(
      'event_id', v_event.id,
      'status', v_event.status,
      'cost_micro_usd', v_event.cost_micro_usd,
      'idempotent', true
    );
  end if;

  v_delta := p_cost_micro_usd - v_event.reserved_micro_usd;

  update public.ai_usage_events
  set status = 'settled',
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      cost_micro_usd = p_cost_micro_usd,
      settled_at = now()
  where id = p_event_id;

  update public.ai_usage_counters
  set cost_micro_usd = greatest(0, cost_micro_usd + v_delta),
      updated_at = now()
  where user_id = v_event.user_id
    and feature = v_event.feature
    and period_kind in ('day', 'month')
    and period_start in (v_event.created_at::date, date_trunc('month', v_event.created_at)::date);

  update public.ai_global_daily
  set cost_micro_usd = greatest(0, cost_micro_usd + v_delta),
      updated_at = now()
  where day = v_event.created_at::date;

  return jsonb_build_object(
    'event_id', p_event_id,
    'status', 'settled',
    'cost_micro_usd', p_cost_micro_usd,
    'delta_micro_usd', v_delta,
    'idempotent', false
  );
end;
$$;

create or replace function public.refund_ai_usage(
  p_event_id uuid,
  p_error_code text default 'provider_error'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.ai_usage_events%rowtype;
begin
  if p_event_id is null then
    raise exception 'invalid_event_id' using errcode = '22023';
  end if;

  select * into v_event
  from public.ai_usage_events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  if v_event.status <> 'reserved' then
    return jsonb_build_object(
      'event_id', v_event.id,
      'status', v_event.status,
      'idempotent', true
    );
  end if;

  update public.ai_usage_events
  set status = 'refunded',
      cost_micro_usd = 0,
      error_code = p_error_code,
      settled_at = now()
  where id = p_event_id;

  update public.ai_usage_counters
  set requests = greatest(0, requests - 1),
      cost_micro_usd = greatest(0, cost_micro_usd - v_event.reserved_micro_usd),
      updated_at = now()
  where user_id = v_event.user_id
    and feature = v_event.feature
    and period_kind in ('day', 'month')
    and period_start in (v_event.created_at::date, date_trunc('month', v_event.created_at)::date);

  update public.ai_global_daily
  set requests = greatest(0, requests - 1),
      cost_micro_usd = greatest(0, cost_micro_usd - v_event.reserved_micro_usd),
      updated_at = now()
  where day = v_event.created_at::date;

  return jsonb_build_object(
    'event_id', p_event_id,
    'status', 'refunded',
    'idempotent', false
  );
end;
$$;

create or replace function public.reap_stale_ai_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_count integer := 0;
begin
  for v_event in
    select id, user_id, feature, reserved_micro_usd, created_at
    from public.ai_usage_events
    where status = 'reserved'
      and created_at < now() - interval '15 minutes'
    for update skip locked
  loop
    update public.ai_usage_events
    set status = 'refunded',
        cost_micro_usd = 0,
        error_code = 'stale_reservation',
        settled_at = now()
    where id = v_event.id;

    update public.ai_usage_counters
    set requests = greatest(0, requests - 1),
        cost_micro_usd = greatest(0, cost_micro_usd - v_event.reserved_micro_usd),
        updated_at = now()
    where user_id = v_event.user_id
      and feature = v_event.feature
      and period_kind in ('day', 'month')
      and period_start in (
        v_event.created_at::date,
        date_trunc('month', v_event.created_at)::date
      );

    update public.ai_global_daily
    set requests = greatest(0, requests - 1),
        cost_micro_usd = greatest(0, cost_micro_usd - v_event.reserved_micro_usd),
        updated_at = now()
    where day = v_event.created_at::date;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.prune_ai_response_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.ai_response_cache where expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_my_usage()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select p.id, p.plan_id, pl.features, pl.monthly_budget_micro_usd
    from public.profiles p
    join public.plans pl on pl.id = p.plan_id
    where p.id = (select auth.uid())
  ),
  daily as (
    select c.feature, c.requests
    from public.ai_usage_counters c
    where c.user_id = (select auth.uid())
      and c.period_kind = 'day'
      and c.period_start = current_date
  ),
  monthly as (
    select coalesce(sum(c.cost_micro_usd), 0)::bigint as used
    from public.ai_usage_counters c
    where c.user_id = (select auth.uid())
      and c.period_kind = 'month'
      and c.period_start = date_trunc('month', current_date)::date
  )
  select jsonb_build_object(
    'plan_id', me.plan_id,
    'daily', coalesce((
      select jsonb_object_agg(
        f.feature,
        jsonb_build_object(
          'limit', (me.features ->> f.feature)::integer,
          'used', coalesce(d.requests, 0),
          'remaining', case
            when (me.features ->> f.feature)::integer < 0 then null
            else greatest(0, (me.features ->> f.feature)::integer - coalesce(d.requests, 0))
          end
        )
      )
      from jsonb_object_keys(me.features) as f(feature)
      left join daily d on d.feature = f.feature
    ), '{}'::jsonb),
    'monthly', jsonb_build_object(
      'budget_micro_usd', me.monthly_budget_micro_usd,
      'used_micro_usd', monthly.used,
      'remaining_micro_usd', case
        when me.monthly_budget_micro_usd < 0 then null
        else greatest(0, me.monthly_budget_micro_usd - monthly.used)
      end
    ),
    'resets_at', (date_trunc('day', now()) + interval '1 day')::timestamptz
  )
  from me, monthly;
$$;

-- Deletes public domain data. The auth user itself is removed by the account
-- Edge Function through the Admin API so sessions/identities are cleaned up.
create or replace function public.delete_my_account_data()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.profiles where id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled maintenance (pg_cron is available on hosted Supabase).
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'create extension if not exists pg_cron with schema extensions';
exception when others then
  raise notice 'pg_cron extension unavailable: %', sqlerrm;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'reap-stale-ai-reservations',
      '*/5 * * * *',
      'select public.reap_stale_ai_reservations()'
    );
    perform cron.schedule(
      'prune-ai-response-cache',
      '15 3 * * *',
      'select public.prune_ai_response_cache()'
    );
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;

revoke all on function public.python_round(numeric) from public;
grant execute on function public.python_round(numeric) to anon, authenticated, service_role;

revoke all on function public.can_cook() from public;
grant execute on function public.can_cook() to anon, authenticated, service_role;

revoke all on function public.seed_demo_data() from public, anon;
grant execute on function public.seed_demo_data() to authenticated, service_role;

revoke all on function public.get_my_usage() from public, anon;
grant execute on function public.get_my_usage() to authenticated, service_role;

revoke all on function public.delete_my_account_data() from public, anon;
grant execute on function public.delete_my_account_data() to authenticated, service_role;

revoke all on function public.reserve_ai_quota(uuid, uuid, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_quota(uuid, uuid, text, bigint, text, text)
  to service_role;

revoke all on function public.settle_ai_usage(uuid, integer, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.settle_ai_usage(uuid, integer, integer, bigint)
  to service_role;

revoke all on function public.refund_ai_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ai_usage(uuid, text) to service_role;

revoke all on function public.reap_stale_ai_reservations() from public, anon, authenticated;
grant execute on function public.reap_stale_ai_reservations() to service_role;

revoke all on function public.prune_ai_response_cache() from public, anon, authenticated;
grant execute on function public.prune_ai_response_cache() to service_role;
