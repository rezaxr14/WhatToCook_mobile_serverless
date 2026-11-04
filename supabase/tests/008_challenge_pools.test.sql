-- S2: challenge gate, daily pools, provider guard, and the service principal.
create extension if not exists pgtap with schema extensions;

begin;
set search_path = public, extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Config defaults and plan caps (Section 0 / 4.2).
-- ---------------------------------------------------------------------------
select is(
  (select challenge_mobile_enforce from public.app_config where id = 1),
  false,
  'mobile Play Integrity enforcement stays off until H2 exists'
);
select is(
  (select pool_anonymous_pct from public.app_config where id = 1),
  60,
  'the anonymous pool defaults to 60%'
);
select is(
  (select pool_registered_pct from public.app_config where id = 1),
  40,
  'the registered pool defaults to 40%'
);
select is(
  (select anonymous_unattested_daily_cap from public.app_config where id = 1),
  10,
  'unattested Android gets the lower daily cap'
);
select is(
  (select (features ->> 'suggestions')::integer from public.plans where id = 'anonymous'),
  20,
  'anonymous plan has 20 AI requests'
);
select is(
  (select (features ->> 'scan')::integer from public.plans where id = 'anonymous'),
  5,
  'anonymous plan has 5 pantry scans'
);
select is(
  (select (features ->> 'suggestions')::integer from public.plans where id = 'free'),
  60,
  'free plan has 60 AI requests'
);
select is(
  (select (features ->> 'scan')::integer from public.plans where id = 'free'),
  15,
  'free plan has 15 pantry scans'
);

-- ---------------------------------------------------------------------------
-- Challenge counter and single-use nonces.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data, is_anonymous, created_at, updated_at)
values (
  'c0c0c0c0-1111-4111-8111-111111111111',
  'challenge@example.test',
  '{"username":"challenge_user"}',
  false,
  now(),
  now()
)
on conflict (id) do nothing;

create temp table first_call as
select public.consume_ai_challenge('c0c0c0c0-1111-4111-8111-111111111111', 3) as payload;
select is(
  (select payload ->> 'allowed' from first_call),
  'false',
  'a new user must verify before the first provider call'
);

select public.reset_ai_challenge('c0c0c0c0-1111-4111-8111-111111111111', 'turnstile');

create temp table three_calls as
select public.consume_ai_challenge('c0c0c0c0-1111-4111-8111-111111111111', 3) as payload
from generate_series(1, 3);
select is(
  (select count(*)::integer from three_calls where (payload ->> 'allowed')::boolean),
  3,
  'three calls are allowed after a successful verification'
);
select is(
  public.consume_ai_challenge('c0c0c0c0-1111-4111-8111-111111111111', 3) ->> 'allowed',
  'false',
  'the fourth call requires verification again'
);

create temp table issued_nonce as
select public.create_ai_challenge_nonce('c0c0c0c0-1111-4111-8111-111111111111', 300) as payload;
select is(
  char_length((select payload ->> 'nonce' from issued_nonce)),
  64,
  'the server nonce is 64 characters'
);
select is(
  public.consume_ai_challenge_nonce(
    'c0c0c0c0-1111-4111-8111-111111111111',
    (select payload ->> 'nonce' from issued_nonce)
  ),
  true,
  'a fresh nonce is consumed once'
);
select is(
  public.consume_ai_challenge_nonce(
    'c0c0c0c0-1111-4111-8111-111111111111',
    (select payload ->> 'nonce' from issued_nonce)
  ),
  false,
  'a replayed nonce is rejected'
);
select is(
  public.consume_ai_challenge_nonce('c0c0c0c0-1111-4111-8111-111111111111', repeat('a', 64)),
  false,
  'an unknown nonce is rejected'
);

-- ---------------------------------------------------------------------------
-- Pools and the service principal.
-- ---------------------------------------------------------------------------
select is(
  public.reserve_ai_quota(
    null,
    'a0000000-0000-4000-8000-000000000001',
    'qtest', 10, 'test', 'model', 'anonymous', 1, 'main-app-service', null
  ) ->> 'status',
  'reserved',
  'a service call reserves inside a pool'
);
select throws_ok(
  'select public.reserve_ai_quota(
    null,
    ''a0000000-0000-4000-8000-000000000002'',
    ''qtest'', 10, ''test'', ''model'', ''anonymous'', 1, ''main-app-service'', null)',
  'P0001', 'ai_pool_exhausted:anonymous', 'the pool limit is enforced atomically'
);
select is(
  (select requests from public.ai_pool_daily
   where day = current_date and pool = 'anonymous' and provider = 'test'),
  1,
  'a rejected pool reservation rolls its increment back'
);
select ok(
  (select user_id is null from public.ai_usage_events
   where service_principal = 'main-app-service'
     and request_id = 'a0000000-0000-4000-8000-000000000001'),
  'service events do not create an auth.users row'
);
select is(
  (select service_principal from public.ai_usage_events
   where request_id = 'a0000000-0000-4000-8000-000000000001'),
  'main-app-service',
  'service events carry their principal'
);
select is(
  public.get_service_usage('main-app-service') -> 'daily' -> 'ai' ->> 'used',
  '1',
  'the service usage snapshot counts today''s events'
);

-- ---------------------------------------------------------------------------
-- Provider attempt guard.
-- ---------------------------------------------------------------------------
select is(
  public.record_provider_attempt('test-provider', 1),
  1,
  'the first provider attempt is counted'
);
select throws_ok(
  'select public.record_provider_attempt(''test-provider'', 1)',
  'P0001', 'provider_daily_guard_exceeded', 'the guard blocks an attempt above the limit'
);
select is(
  (select attempts from public.ai_provider_attempts where provider = 'test-provider'),
  1,
  'a blocked attempt rolls back its increment'
);
select is(
  public.record_provider_attempt('test-provider', null),
  2,
  'without a guard the counter keeps increasing'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_ai_challenge(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated cannot consume challenges directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_ai_challenge(uuid,integer)',
    'EXECUTE'
  ),
  'service_role can consume challenges'
);

select * from finish();
rollback;
