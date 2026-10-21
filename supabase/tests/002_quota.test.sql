-- AI quota reserve / idempotency / settle / refund / limits / usage.
create extension if not exists pgtap with schema extensions;

begin;
set search_path = public, extensions;

select plan(26);

create or replace function pg_temp.as_user(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_result text;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v_result;
    execute 'reset role';
    return 'ok:' || coalesce(v_result, '');
  exception when others then
    begin
      execute 'reset role';
    exception when others then
      null;
    end;
    return 'err:' || SQLSTATE;
  end;
end;
$$;

insert into public.plans (id, name, features, monthly_budget_micro_usd, max_image_bytes)
values ('quota_test', 'Quota Test', '{"qtest":2}'::jsonb, 1000, 5242880)
on conflict (id) do update set
  features = excluded.features,
  monthly_budget_micro_usd = excluded.monthly_budget_micro_usd;

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('dddddddd-1111-4111-8111-111111111111', 'quota-q1@example.test', '{"username":"quota_q1"}', false, now(), now()),
  ('eeeeeeee-2222-4222-8222-222222222222', 'quota-q2@example.test', '{"username":"quota_q2"}', false, now(), now()),
  ('ffffffff-3333-4333-8333-333333333333', 'quota-q3@example.test', '{"username":"quota_q3"}', false, now(), now())
on conflict (id) do nothing;

update public.profiles
set plan_id = 'quota_test'
where id in (
  'dddddddd-1111-4111-8111-111111111111',
  'eeeeeeee-2222-4222-8222-222222222222',
  'ffffffff-3333-4333-8333-333333333333'
);

select is(
  public.reserve_ai_quota(
    'dddddddd-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'qtest', 100, 'test', 'model'
  ) ->> 'status',
  'reserved', 'first reservation succeeds'
);
select is(
  public.reserve_ai_quota(
    'dddddddd-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    'qtest', 100, 'test', 'model'
  ) ->> 'idempotent',
  'true', 'same request_id is idempotent'
);
select is(
  public.reserve_ai_quota(
    'dddddddd-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'qtest', 100, 'test', 'model'
  ) ->> 'daily_used',
  '2', 'second reservation reports daily_used = 2'
);
select throws_ok(
  'select public.reserve_ai_quota(
    ''dddddddd-1111-4111-8111-111111111111'',
    ''33333333-3333-4333-8333-333333333333'',
    ''qtest'', 100, ''test'', ''model'')',
  'P0001', 'daily_limit_exceeded', 'third reservation is rejected by the daily limit'
);
select is((
  select count(*)::integer from public.ai_usage_events
  where user_id = 'dddddddd-1111-4111-8111-111111111111'
), 2, 'failed reservation did not create an event');

select is(
  public.settle_ai_usage(
    (select id from public.ai_usage_events
      where user_id = 'dddddddd-1111-4111-8111-111111111111'
        and request_id = '11111111-1111-4111-8111-111111111111'),
    10, 20, 150
  ) ->> 'status',
  'settled', 'successful call can be settled'
);
select is(
  public.settle_ai_usage(
    (select id from public.ai_usage_events
      where user_id = 'dddddddd-1111-4111-8111-111111111111'
        and request_id = '11111111-1111-4111-8111-111111111111'),
    10, 20, 150
  ) ->> 'idempotent',
  'true', 'settling twice is idempotent'
);
select is((
  select cost_micro_usd from public.ai_usage_counters
  where user_id = 'dddddddd-1111-4111-8111-111111111111'
    and period_kind = 'day' and period_start = current_date and feature = 'qtest'
), 250::bigint, 'daily cost reflects settled cost plus the still-reserved request');

select is(
  public.refund_ai_usage(
    (select id from public.ai_usage_events
      where user_id = 'dddddddd-1111-4111-8111-111111111111'
        and request_id = '22222222-2222-4222-8222-222222222222'),
    'provider_error'
  ) ->> 'status',
  'refunded', 'failed call can be refunded'
);
select is((
  select requests from public.ai_usage_counters
  where user_id = 'dddddddd-1111-4111-8111-111111111111'
    and period_kind = 'day' and period_start = current_date and feature = 'qtest'
), 1, 'refund decrements the daily request counter');
select is((
  select cost_micro_usd from public.ai_usage_counters
  where user_id = 'dddddddd-1111-4111-8111-111111111111'
    and period_kind = 'day' and period_start = current_date and feature = 'qtest'
), 150::bigint, 'refund removes the reserved cost');

select is(
  pg_temp.as_user(
    'dddddddd-1111-4111-8111-111111111111',
    'select public.get_my_usage()->>''plan_id'''
  ),
  'ok:quota_test', 'get_my_usage returns the current plan'
);
select is(
  pg_temp.as_user(
    'dddddddd-1111-4111-8111-111111111111',
    'select public.get_my_usage()->''daily''->''qtest''->>''used'''
  ),
  'ok:1', 'get_my_usage reports one used qtest request'
);
select is(
  pg_temp.as_user(
    'dddddddd-1111-4111-8111-111111111111',
    'select public.get_my_usage()->''daily''->''qtest''->>''remaining'''
  ),
  'ok:1', 'get_my_usage reports one remaining qtest request'
);
select is(
  pg_temp.as_user(
    'dddddddd-1111-4111-8111-111111111111',
    'select public.get_my_usage()->''monthly''->>''used_micro_usd'''
  ),
  'ok:150', 'get_my_usage reports monthly cost'
);
select is(
  pg_temp.as_user(
    'dddddddd-1111-4111-8111-111111111111',
    'select public.get_my_usage()->''monthly''->>''remaining_micro_usd'''
  ),
  'ok:850', 'get_my_usage reports remaining monthly budget'
);

select is(
  public.reserve_ai_quota(
    'eeeeeeee-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'qtest', 900, 'test', 'model'
  ) ->> 'status',
  'reserved', 'large reservation within the monthly budget succeeds'
);
select throws_ok(
  'select public.reserve_ai_quota(
    ''eeeeeeee-2222-4222-8222-222222222222'',
    ''55555555-5555-4555-8555-555555555555'',
    ''qtest'', 200, ''test'', ''model'')',
  'P0001', 'monthly_budget_exceeded', 'reservation over the monthly budget is rejected'
);

update public.app_config set ai_kill_switch = true;
select throws_ok(
  'select public.reserve_ai_quota(
    ''ffffffff-3333-4333-8333-333333333333'',
    ''66666666-6666-4666-8666-666666666666'',
    ''qtest'', 100, ''test'', ''model'')',
  'P0001', 'ai_kill_switch', 'kill switch blocks reservations'
);
update public.app_config set ai_kill_switch = false;

update public.app_config
set feature_flags = jsonb_set(feature_flags, '{qtest}', 'false'::jsonb);
select throws_ok(
  'select public.reserve_ai_quota(
    ''ffffffff-3333-4333-8333-333333333333'',
    ''77777777-7777-4777-8777-777777777777'',
    ''qtest'', 100, ''test'', ''model'')',
  'P0001', 'feature_disabled', 'feature flag blocks reservations'
);
update public.app_config
set feature_flags = jsonb_set(feature_flags, '{qtest}', 'true'::jsonb);

update public.app_config
set global_daily_cap_micro_usd = (
  select coalesce(cost_micro_usd, 0) from public.ai_global_daily where day = current_date
) + 50;
select throws_ok(
  'select public.reserve_ai_quota(
    ''ffffffff-3333-4333-8333-333333333333'',
    ''88888888-8888-4888-8888-888888888888'',
    ''qtest'', 100, ''test'', ''model'')',
  'P0001', 'global_budget_exceeded', 'global daily cap blocks reservations'
);
update public.app_config set global_daily_cap_micro_usd = 5000000;

select throws_ok(
  'select public.reserve_ai_quota(
    ''ffffffff-3333-4333-8333-333333333333'',
    ''99999999-9999-4999-8999-999999999999'',
    ''qtest'', -1, ''test'', ''model'')',
  '22023', 'invalid_reserved_amount', 'negative reservation is rejected'
);
select throws_ok(
  'select public.settle_ai_usage(''99999999-9999-4999-8999-999999999999'', 1, 1, 1)',
  'P0002', 'event_not_found', 'settling an unknown event is rejected'
);
select throws_ok(
  'select public.refund_ai_usage(''99999999-9999-4999-8999-999999999999'', ''x'')',
  'P0002', 'event_not_found', 'refunding an unknown event is rejected'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reserve_ai_quota(uuid,uuid,text,bigint,text,text)',
    'EXECUTE'
  ),
  'service_role can execute reserve_ai_quota'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_ai_quota(uuid,uuid,text,bigint,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute reserve_ai_quota'
);

select * from finish();
rollback;
