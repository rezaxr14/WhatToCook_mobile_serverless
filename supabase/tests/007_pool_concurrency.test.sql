-- Concurrency: two simultaneous pool reservations must not exceed the pool.
-- dblink connects over the Docker service name so it uses password auth rather
-- than the loopback trust rule (dblink refuses the latter for non-superusers).
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

set search_path = public, extensions;

delete from public.ai_usage_events
where service_principal = 'main-app-service'
  and request_id in (
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002'
  );
delete from public.ai_pool_daily
where day = current_date and pool = 'anonymous' and provider = 'pool-test';

update public.app_config
set ai_kill_switch = false, global_daily_cap_micro_usd = 5000000
where id = 1;

select plan(5);

select ok(
  dblink_connect(
    'pc1',
    'host=db port=5432 dbname=postgres user=postgres password=postgres'
  ) = 'OK',
  'dblink session 1 connects'
);
select ok(
  dblink_connect(
    'pc2',
    'host=db port=5432 dbname=postgres user=postgres password=postgres'
  ) = 'OK',
  'dblink session 2 connects'
);

select dblink_send_query(
  'pc1',
  'select public.reserve_ai_quota(
    null,
    ''b0000000-0000-4000-8000-000000000001'',
    ''qtest'', 10, ''pool-test'', ''model'', ''anonymous'', 1, ''main-app-service'', null)'
);
select dblink_send_query(
  'pc2',
  'select public.reserve_ai_quota(
    null,
    ''b0000000-0000-4000-8000-000000000002'',
    ''qtest'', 10, ''pool-test'', ''model'', ''anonymous'', 1, ''main-app-service'', null)'
);

create temp table pool_results (conn text, outcome text);

do $$
declare
  v_result jsonb;
begin
  begin
    select result into v_result from dblink_get_result('pc1') as t(result jsonb);
    insert into pool_results values ('pc1', 'ok:' || coalesce(v_result::text, ''));
  exception when others then
    insert into pool_results values ('pc1', 'err:' || SQLSTATE || ':' || SQLERRM);
  end;

  begin
    select result into v_result from dblink_get_result('pc2') as t(result jsonb);
    insert into pool_results values ('pc2', 'ok:' || coalesce(v_result::text, ''));
  exception when others then
    insert into pool_results values ('pc2', 'err:' || SQLSTATE || ':' || SQLERRM);
  end;
end;
$$;

select is((
  select count(*)::integer from pool_results where outcome like 'ok:%'
), 1, 'exactly one concurrent pool reservation succeeds');
select is((
  select count(*)::integer from pool_results where outcome like 'err:%ai_pool_exhausted%'
), 1, 'the other reservation is rejected by the pool');
select is((
  select requests from public.ai_pool_daily
  where day = current_date and pool = 'anonymous' and provider = 'pool-test'
), 1, 'the pool counter never exceeds its limit');

select dblink_disconnect('pc1');
select dblink_disconnect('pc2');

delete from public.ai_usage_events
where service_principal = 'main-app-service'
  and request_id in (
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000002'
  );
delete from public.ai_pool_daily
where day = current_date and pool = 'anonymous' and provider = 'pool-test';
drop table if exists pool_results;

select * from finish();
