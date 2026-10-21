-- Schema, seed, and helper sanity checks.
create extension if not exists pgtap with schema extensions;

begin;
set search_path = public, extensions;

select plan(31);

select has_table('public', 'plans', 'plans table exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'ingredients', 'ingredients table exists');
select has_table('public', 'recipes', 'recipes table exists');
select has_table('public', 'recipe_ingredients', 'recipe_ingredients table exists');
select has_table('public', 'pantry_items', 'pantry_items table exists');
select has_table('public', 'grocery_items', 'grocery_items table exists');
select has_table('public', 'ai_model_prices', 'ai_model_prices table exists');
select has_table('public', 'ai_usage_events', 'ai_usage_events table exists');
select has_table('public', 'ai_usage_counters', 'ai_usage_counters table exists');
select has_table('public', 'ai_global_daily', 'ai_global_daily table exists');
select has_table('public', 'ai_response_cache', 'ai_response_cache table exists');
select has_table('public', 'app_config', 'app_config table exists');

select is((select count(*)::integer from public.ingredients), 80, '80 canonical ingredients seeded');
select is((select count(*)::integer from public.recipes), 12, '12 canonical recipes seeded');
select is((select count(*)::integer from public.recipe_ingredients), 65, '65 recipe ingredient rows seeded');
select is((select count(*)::integer from public.plans), 3, 'free, anonymous, and pro plans seeded');

select is(public.python_round(62.5), 62, 'bankers rounding: 62.5 -> 62');
select is(public.python_round(63.5), 64, 'bankers rounding: 63.5 -> 64');
select is(public.python_round(0.5), 0, 'bankers rounding: 0.5 -> 0');
select is(public.python_round(1.5), 2, 'bankers rounding: 1.5 -> 2');

select ok(to_regprocedure('public.can_cook()') is not null, 'can_cook() exists');
select ok(to_regprocedure('public.seed_demo_data()') is not null, 'seed_demo_data() exists');
select ok(
  to_regprocedure('public.reserve_ai_quota(uuid,uuid,text,bigint,text,text)') is not null,
  'reserve_ai_quota() exists'
);
select has_trigger('auth', 'users', 'on_auth_user_created', 'profile bootstrap trigger exists');

select is(
  (select public from storage.buckets where id = 'recipe-images'),
  true,
  'recipe-images bucket is public'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.recipes'::regclass),
  true,
  'RLS is enabled on recipes'
);

select is((
  select count(*)::integer
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (array[
      'plans', 'profiles', 'ingredients', 'recipes', 'recipe_ingredients',
      'pantry_items', 'grocery_items', 'ai_model_prices', 'ai_usage_events',
      'ai_usage_counters', 'ai_global_daily', 'ai_response_cache', 'app_config'
    ])
    and not c.relrowsecurity
), 0, 'RLS is enabled on every public domain table');

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'recipe images public read'
  ),
  'public read policy exists for recipe images'
);

select is((
  select count(*)::integer from storage.objects where bucket_id = 'recipe-images'
), 12, '12 recipe images uploaded to Storage');

select is((
  select count(*)::integer
  from public.recipes r
  join storage.objects o
    on o.bucket_id = 'recipe-images' and o.name = r.image_path
), 12, 'every recipe image_path resolves to a Storage object');

select * from finish();
rollback;
