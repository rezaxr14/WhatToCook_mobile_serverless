-- Concurrency: two simultaneous reservations for the same user must not exceed
-- the daily limit. dblink connects over the Docker service name so it uses
-- password auth rather than the loopback trust rule (dblink refuses the latter
-- for non-superusers).
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

set search_path = public, extensions;

-- Committed setup so the dblink sessions can see it.
delete from public.profiles where id = 'abcdabcd-1111-4111-8111-111111111111';
delete from auth.users where id = 'abcdabcd-1111-4111-8111-111111111111';
delete from public.plans where id = 'concurrency_test';

insert into public.plans (id, name, features, monthly_budget_micro_usd, max_image_bytes)
values ('concurrency_test', 'Concurrency Test', '{"ctest":1}'::jsonb, 100000, 5242880);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, created_at, updated_at)
values (
  'abcdabcd-1111-4111-8111-111111111111',
  'concurrency@example.test',
  '{"username":"concurrency"}',
  false, now(), now()
);

update public.profiles
set plan_id = 'concurrency_test'
where id = 'abcdabcd-1111-4111-8111-111111111111';

update public.app_config
set ai_kill_switch = false, global_daily_cap_micro_usd = 5000000
where id = 1;

select plan(4);

select ok(
  dblink_connect(
    'cc1',
    'host=db port=5432 dbname=postgres user=postgres password=postgres'
  ) = 'OK',
  'dblink session 1 connects'
);
select ok(
  dblink_connect(
    'cc2',
    'host=db port=5432 dbname=postgres user=postgres password=postgres'
  ) = 'OK',
  'dblink session 2 connects'
);

select dblink_send_query(
  'cc1',
  'select public.reserve_ai_quota(
    ''abcdabcd-1111-4111-8111-111111111111'',
    ''11112222-1111-4111-8111-111111111111'',
    ''ctest'', 100, ''test'', ''model'')'
);
select dblink_send_query(
  'cc2',
  'select public.reserve_ai_quota(
    ''abcdabcd-1111-4111-8111-111111111111'',
    ''22223333-2222-4222-8222-222222222222'',
    ''ctest'', 100, ''test'', ''model'')'
);

create temp table cc_results (conn text, outcome text);

do $$
declare
  v_result jsonb;
begin
  begin
    select result into v_result from dblink_get_result('cc1') as t(result jsonb);
    insert into cc_results values ('cc1', 'ok:' || coalesce(v_result::text, ''));
  exception when others then
    insert into cc_results values ('cc1', 'err:' || SQLSTATE || ':' || SQLERRM);
  end;

  begin
    select result into v_result from dblink_get_result('cc2') as t(result jsonb);
    insert into cc_results values ('cc2', 'ok:' || coalesce(v_result::text, ''));
  exception when others then
    insert into cc_results values ('cc2', 'err:' || SQLSTATE || ':' || SQLERRM);
  end;
end;
$$;

select is((
  select count(*)::integer from cc_results where outcome like 'ok:%'
), 1, 'exactly one concurrent reservation succeeds');
select is((
  select count(*)::integer from public.ai_usage_events
  where user_id = 'abcdabcd-1111-4111-8111-111111111111'
    and feature = 'ctest'
), 1, 'exactly one event was recorded');

select dblink_disconnect('cc1');
select dblink_disconnect('cc2');

delete from public.profiles where id = 'abcdabcd-1111-4111-8111-111111111111';
delete from auth.users where id = 'abcdabcd-1111-4111-8111-111111111111';
delete from public.plans where id = 'concurrency_test';
drop table if exists cc_results;

select * from finish();
