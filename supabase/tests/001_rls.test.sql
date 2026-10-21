-- RLS, grants, demo flow, and account data deletion.
create extension if not exists pgtap with schema extensions;

begin;
set search_path = public, extensions;

select plan(33);

-- Runs one statement as an authenticated user (or anon when p_uid is null)
-- and returns "ok:<value>" or "err:<sqlstate>". Keeping role switching inside
-- a helper lets the assertions themselves run as postgres.
create or replace function pg_temp.as_user(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_result text;
  v_role text := case when p_uid is null then 'anon' else 'authenticated' end;
begin
  perform set_config(
    'request.jwt.claims',
    case
      when p_uid is null then '{"role":"anon"}'
      else json_build_object('sub', p_uid::text, 'role', 'authenticated')::text
    end,
    true
  );
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', v_role);
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

insert into auth.users (id, email, raw_user_meta_data, is_anonymous, created_at, updated_at)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'rls-a@example.test', '{"username":"rls_a"}', false, now(), now()),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'rls-b@example.test', '{"username":"rls_b"}', false, now(), now()),
  ('cccccccc-3333-4333-8333-333333333333', null, '{"username":"rls_c"}', true, now(), now())
on conflict (id) do nothing;

insert into public.pantry_items (user_id, ingredient_id)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', 1),
  ('bbbbbbbb-2222-4222-8222-222222222222', 2),
  ('cccccccc-3333-4333-8333-333333333333', 3)
on conflict (user_id, ingredient_id) do nothing;

insert into public.grocery_items (user_id, name)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'A item'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'B item');

insert into public.ai_usage_events (user_id, request_id, feature, status)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', gen_random_uuid(), 'test', 'reserved'),
  ('bbbbbbbb-2222-4222-8222-222222222222', gen_random_uuid(), 'test', 'reserved');

select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.pantry_items'),
  'ok:1', 'user A sees only their pantry row'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.grocery_items'),
  'ok:1', 'user A sees only their grocery row'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.profiles where id = ''aaaaaaaa-1111-4111-8111-111111111111'''),
  'ok:1', 'user A sees their own profile'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.profiles where id = ''bbbbbbbb-2222-4222-8222-222222222222'''),
  'ok:0', 'user A cannot see user B profile'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.recipes'),
  'ok:12', 'user A sees the 12 catalog recipes'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'insert into public.pantry_items (user_id, ingredient_id) values (''bbbbbbbb-2222-4222-8222-222222222222'', 1)'),
  'err:42501', 'user A cannot insert a pantry row for user B'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'with upd as (update public.recipes set title = ''{"en":"Hacked"}''::jsonb where owner_id is null returning 1) select count(*)::text from upd'),
  'ok:0', 'catalog recipes cannot be updated by clients'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'update public.profiles set locale = ''tr'' where id = ''aaaaaaaa-1111-4111-8111-111111111111'' returning locale'),
  'ok:tr', 'user A can update their own locale'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'update public.profiles set plan_id = ''pro'' where id = ''aaaaaaaa-1111-4111-8111-111111111111'' returning 1'),
  'err:42501', 'user A cannot self-upgrade plan_id'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.ai_usage_events'),
  'ok:1', 'user A sees only their own AI usage event'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.ai_usage_events where user_id = ''bbbbbbbb-2222-4222-8222-222222222222'''),
  'ok:0', 'user A cannot see user B AI events'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'insert into public.ai_usage_events (user_id, request_id, feature) values (''aaaaaaaa-1111-4111-8111-111111111111'', gen_random_uuid(), ''test'')'),
  'err:42501', 'clients cannot insert AI usage events'
);
select is(
  pg_temp.as_user(null, 'select count(*)::text from public.recipes'),
  'ok:12', 'anon can read the catalog'
);
select is(
  pg_temp.as_user(null, 'select count(*)::text from public.pantry_items'),
  'err:42501', 'anon has no pantry table grant'
);
select is(
  pg_temp.as_user(null, 'select public.seed_demo_data()::text'),
  'err:42501', 'anon cannot call seed_demo_data'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111', 'select public.seed_demo_data()::text'),
  'ok:11', 'authenticated user can seed the 11-item demo pantry'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select public.can_cook()->>''total_full_matches'''),
  'ok:0', 'demo pantry has zero full matches'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select public.can_cook()->>''total_partial_matches'''),
  'ok:9', 'demo pantry has nine partial matches'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select public.can_cook()->>''pantry_ingredient_count'''),
  'ok:11', 'demo pantry contains 11 ingredients'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from jsonb_array_elements(public.can_cook()->''partial_matches'') e where e->>''name'' ilike ''%Carbonara%'''),
  'ok:0', 'Carbonara remains excluded'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111', 'select public.seed_demo_data()::text'),
  'ok:11', 'seed_demo_data is idempotent'
);
select is(
  pg_temp.as_user('aaaaaaaa-1111-4111-8111-111111111111',
    'select count(*)::text from public.pantry_items'),
  'ok:11', 'demo pantry still has 11 rows after reseeding'
);

select is(
  pg_temp.as_user('cccccccc-3333-4333-8333-333333333333',
    'select public.delete_my_account_data()'),
  'ok:', 'user C can delete their public domain data'
);
select is((select count(*)::integer from public.profiles
  where id = 'cccccccc-3333-4333-8333-333333333333'), 0, 'profile deleted');
select is((select count(*)::integer from public.pantry_items
  where user_id = 'cccccccc-3333-4333-8333-333333333333'), 0, 'pantry cascaded');
select is((select count(*)::integer from auth.users
  where id = 'cccccccc-3333-4333-8333-333333333333'), 1, 'auth user remains for Admin API cleanup');

select ok(has_table_privilege('anon', 'public.recipes', 'SELECT'), 'anon can select recipes');
select ok(not has_table_privilege('anon', 'public.pantry_items', 'SELECT'), 'anon cannot select pantry_items');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reserve_ai_quota(uuid,uuid,text,bigint,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute reserve_ai_quota'
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
  not has_table_privilege('authenticated', 'public.ai_usage_events', 'INSERT'),
  'authenticated cannot insert AI usage events'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'plan_id', 'UPDATE'),
  'authenticated cannot update plan_id column'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE'),
  'authenticated can update username column'
);

select * from finish();
rollback;
