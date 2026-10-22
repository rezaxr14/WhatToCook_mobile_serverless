-- M4 AI gateway: routing/prices, substitution metering, cache-hit accounting.
create extension if not exists pgtap with schema extensions;

begin;
set search_path = public, extensions;

select plan(18);

-- Substitution is metered separately from chat.
select is(
  (select (features ->> 'substitution')::integer from public.plans where id = 'anonymous'),
  10,
  'anonymous plan has a substitution allowance'
);
select is(
  (select (features ->> 'substitution')::integer from public.plans where id = 'free'),
  30,
  'free plan has a substitution allowance'
);
select is(
  (select (features ->> 'substitution')::integer from public.plans where id = 'pro'),
  200,
  'pro plan has a substitution allowance'
);
select is(
  (select (feature_flags ->> 'substitution')::boolean from public.app_config where id = 1),
  true,
  'substitution feature flag is enabled'
);

-- Model routing is data, and runtime prices use the provider id emitted by the
-- Gemini adapter ('gemini', not the historical vendor label 'google').
select is(
  (select model_routing ->> 'provider' from public.app_config where id = 1),
  'gemini',
  'app_config routes to gemini'
);
select is(
  (select model_routing -> 'models' ->> 'suggestions' from public.app_config where id = 1),
  'gemini-2.5-flash-lite',
  'suggestions route to flash-lite'
);
select is(
  (select model_routing -> 'models' ->> 'scan' from public.app_config where id = 1),
  'gemini-2.5-flash',
  'scan routes to flash'
);
select ok(
  (select model_routing -> 'fallbacks' -> 'text' @> '["gemini-2.0-flash"]'::jsonb
   from public.app_config where id = 1),
  'text fallback ladder includes 2.0 flash'
);
select is(
  (select count(*)::integer from public.ai_model_prices
   where provider = 'gemini'
     and active
     and model in (
       'gemini-2.5-flash-lite',
       'gemini-2.5-flash',
       'gemini-2.0-flash',
       'gemini-2.5-pro'
     )),
  4,
  'all routed Gemini models have active prices under provider gemini'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.record_ai_cache_hit(text)',
    'EXECUTE'
  ),
  'service_role can record cache hits'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_ai_cache_hit(text)',
    'EXECUTE'
  ),
  'authenticated cannot record cache hits'
);

-- Cache hit events must remain visible but must not consume the daily request
-- allowance. A cache hit is inserted first; a reservation for the same feature
-- must still succeed with a limit of one.
insert into public.plans (id, name, features, monthly_budget_micro_usd, max_image_bytes)
values (
  'cache_test', 'Cache Test', '{"cachetest":1}'::jsonb, 1000, 5242880
)
on conflict (id) do update set
  features = excluded.features,
  monthly_budget_micro_usd = excluded.monthly_budget_micro_usd;

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, created_at, updated_at)
values (
  'aaaaaaaa-1111-4111-8111-111111111111',
  'cache-hit@example.test',
  '{"username":"cache_hit"}',
  false,
  now(),
  now()
)
on conflict (id) do nothing;

update public.profiles
set plan_id = 'cache_test'
where id = 'aaaaaaaa-1111-4111-8111-111111111111';

insert into public.ai_usage_events (
  user_id, request_id, feature, provider, model, status,
  reserved_micro_usd, input_tokens, output_tokens, cost_micro_usd,
  cache_hit, settled_at
)
values (
  'aaaaaaaa-1111-4111-8111-111111111111',
  'aaaaaaaa-2222-4222-8222-222222222222',
  'cachetest', 'test_ai', 'test-model', 'settled',
  0, 0, 0, 0, true, now()
);

create temp table cache_reserve as
select public.reserve_ai_quota(
  'aaaaaaaa-1111-4111-8111-111111111111',
  'aaaaaaaa-3333-4333-8333-333333333333',
  'cachetest', 1, 'test_ai', 'test-model'
) as payload;

select is(
  (select payload ->> 'status' from cache_reserve),
  'reserved',
  'a cache hit does not consume the daily request allowance'
);
select is(
  (select payload ->> 'daily_used' from cache_reserve),
  '1',
  'daily_used counts the reservation but not the cache hit'
);
select is(
  (select settled_requests from public.v_ai_spend_daily
   where day = current_date
     and feature = 'cachetest'
     and provider = 'test_ai'
     and model = 'test-model'),
  0::bigint,
  'cache hits are excluded from settled_requests in the daily spend view'
);
select is(
  (select cache_hits from public.v_ai_spend_daily
   where day = current_date
     and feature = 'cachetest'
     and provider = 'test_ai'
     and model = 'test-model'),
  1::bigint,
  'cache hits remain visible in the daily spend view'
);
select is(
  (select hit_rate from public.v_ai_cache_hit_rate
   where day = current_date
     and feature = 'cachetest'
     and provider = 'test_ai'
     and model = 'test-model'),
  0.5::numeric,
  'cache hit rate uses all recorded events'
);

insert into public.ai_response_cache (key, feature, response, expires_at)
values (
  'test-cache-key-0001',
  'cachetest',
  '{"ok":true}'::jsonb,
  now() + interval '1 day'
);

select is(
  public.record_ai_cache_hit('test-cache-key-0001'),
  1,
  'record_ai_cache_hit increments the cache hit counter'
);
select is(
  public.record_ai_cache_hit('test-cache-key-0001'),
  2,
  'record_ai_cache_hit is cumulative'
);

select * from finish();
rollback;
