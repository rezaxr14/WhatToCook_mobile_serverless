-- Security hardening: helper functions are not RPC endpoints, and server-only
-- tables explicitly deny client roles.
create extension if not exists pgtap with schema extensions;

begin;
set search_path = public, extensions;

select plan(8);

select ok(
  (select count(*) = 0
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'handle_new_user'
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'anon cannot execute handle_new_user'
);
select ok(
  (select count(*) = 0
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'handle_new_user'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'authenticated cannot execute handle_new_user'
);
select ok(
  (select count(*) = 0
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'rls_auto_enable'
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'anon cannot execute rls_auto_enable (when present)'
);
select ok(
  (select count(*) = 0
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'rls_auto_enable'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'authenticated cannot execute rls_auto_enable (when present)'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_global_daily'
      and policyname = 'ai global daily deny clients'
  ),
  'ai_global_daily has an explicit client-deny policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_model_prices'
      and policyname = 'ai model prices deny clients'
  ),
  'ai_model_prices has an explicit client-deny policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_response_cache'
      and policyname = 'ai response cache deny clients'
  ),
  'ai_response_cache has an explicit client-deny policy'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_config'
      and policyname = 'app config deny clients'
  ),
  'app_config has an explicit client-deny policy'
);

select * from finish();
rollback;
