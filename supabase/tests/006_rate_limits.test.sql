-- M8: per-user / per-IP AI gateway rate limits.
create extension if not exists pgtap with schema extensions;

begin;
set search_path = public, extensions;

select plan(13);

select ok(
  to_regclass('public.ai_rate_windows') is not null,
  'ai_rate_windows table exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_rate_windows'::regclass),
  'ai_rate_windows has RLS enabled'
);
select is(
  (select count(*)::integer from pg_policies where tablename = 'ai_rate_windows'),
  0,
  'ai_rate_windows has no policies (service role only)'
);
select ok(
  not has_table_privilege('anon', 'public.ai_rate_windows', 'select'),
  'anon cannot read ai_rate_windows'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.check_ai_rate_limit(uuid,text,integer,integer,integer,timestamptz)',
    'execute'
  ),
  'anon cannot execute check_ai_rate_limit'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.check_ai_rate_limit(uuid,text,integer,integer,integer,timestamptz)',
    'execute'
  ),
  'service_role can execute check_ai_rate_limit'
);

-- A fresh user stays under a 2/min limit for the first two calls.
select is(
  (public.check_ai_rate_limit(
    '11111111-1111-1111-1111-111111111111',
    null,
    2,
    null,
    60,
    '2026-10-24T12:00:10Z'
  ) ->> 'allowed')::boolean,
  true,
  'first request in a window is allowed'
);
select is(
  (public.check_ai_rate_limit(
    '11111111-1111-1111-1111-111111111111',
    null,
    2,
    null,
    60,
    '2026-10-24T12:00:20Z'
  ) ->> 'allowed')::boolean,
  true,
  'second request in a window is allowed'
);
select is(
  (public.check_ai_rate_limit(
    '11111111-1111-1111-1111-111111111111',
    null,
    2,
    null,
    60,
    '2026-10-24T12:00:30Z'
  ) ->> 'scope'),
  'user',
  'third request reports the user scope'
);
select is(
  (public.check_ai_rate_limit(
    '11111111-1111-1111-1111-111111111111',
    null,
    2,
    null,
    60,
    '2026-10-24T12:00:30Z'
  ) ->> 'retry_after')::integer,
  30,
  'retry_after points at the end of the fixed window'
);

-- A different user has an independent bucket.
select is(
  (public.check_ai_rate_limit(
    '22222222-2222-2222-2222-222222222222',
    null,
    2,
    null,
    60,
    '2026-10-24T12:00:40Z'
  ) ->> 'allowed')::boolean,
  true,
  'a different user is not affected by another user bucket'
);

-- The IP bucket blocks even when the user has headroom.
select is(
  (public.check_ai_rate_limit(
    '33333333-3333-3333-3333-333333333333',
    repeat('a', 64),
    100,
    1,
    60,
    '2026-10-24T12:00:50Z'
  ) ->> 'allowed')::boolean,
  true,
  'first request from an IP is allowed'
);
select is(
  (public.check_ai_rate_limit(
    '33333333-3333-3333-3333-333333333333',
    repeat('a', 64),
    100,
    1,
    60,
    '2026-10-24T12:00:55Z'
  ) ->> 'scope'),
  'ip',
  'second request from one IP reports the ip scope'
);

select * from finish();
rollback;
