-- Row Level Security for every public table.
-- Catalog rows are readable by everyone; user rows are owner-only; AI internals are server-only.

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.pantry_items enable row level security;
alter table public.grocery_items enable row level security;
alter table public.ai_model_prices enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_usage_counters enable row level security;
alter table public.ai_global_daily enable row level security;
alter table public.ai_response_cache enable row level security;
alter table public.app_config enable row level security;

-- Plans are reference data.
drop policy if exists "plans readable" on public.plans;
create policy "plans readable"
  on public.plans for select
  to anon, authenticated
  using (is_active);

-- A user can read and edit only their own profile. plan_id/telegram fields are
-- protected by column-level grants below, not by RLS alone.
drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Catalog is public read-only.
drop policy if exists "ingredients catalog read" on public.ingredients;
create policy "ingredients catalog read"
  on public.ingredients for select
  to anon, authenticated
  using (true);

-- Catalog recipes are public; user recipes are owner-only.
drop policy if exists "recipes read catalog or own" on public.recipes;
create policy "recipes read catalog or own"
  on public.recipes for select
  to anon, authenticated
  using (
    deleted_at is null
    and (owner_id is null or owner_id = (select auth.uid()))
  );

drop policy if exists "recipes insert own" on public.recipes;
create policy "recipes insert own"
  on public.recipes for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and source in ('ai', 'user')
    and catalog_key is null
  );

drop policy if exists "recipes update own" on public.recipes;
create policy "recipes update own"
  on public.recipes for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "recipes delete own" on public.recipes;
create policy "recipes delete own"
  on public.recipes for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Join rows follow the visibility/write rules of their recipe.
drop policy if exists "recipe ingredients read visible recipe" on public.recipe_ingredients;
create policy "recipe ingredients read visible recipe"
  on public.recipe_ingredients for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.deleted_at is null
        and (r.owner_id is null or r.owner_id = (select auth.uid()))
    )
  );

drop policy if exists "recipe ingredients insert own recipe" on public.recipe_ingredients;
create policy "recipe ingredients insert own recipe"
  on public.recipe_ingredients for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.owner_id = (select auth.uid())
        and r.deleted_at is null
    )
  );

drop policy if exists "recipe ingredients update own recipe" on public.recipe_ingredients;
create policy "recipe ingredients update own recipe"
  on public.recipe_ingredients for update
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.owner_id = (select auth.uid())
    )
  );

drop policy if exists "recipe ingredients delete own recipe" on public.recipe_ingredients;
create policy "recipe ingredients delete own recipe"
  on public.recipe_ingredients for delete
  to authenticated
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.owner_id = (select auth.uid())
    )
  );

-- Pantry items are owner-only. Soft-deleted rows stay visible to the owner so
-- clients can sync removals; can_cook() ignores them.
drop policy if exists "pantry select own" on public.pantry_items;
create policy "pantry select own"
  on public.pantry_items for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "pantry insert own" on public.pantry_items;
create policy "pantry insert own"
  on public.pantry_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "pantry update own" on public.pantry_items;
create policy "pantry update own"
  on public.pantry_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "pantry delete own" on public.pantry_items;
create policy "pantry delete own"
  on public.pantry_items for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Grocery items are owner-only.
drop policy if exists "grocery select own" on public.grocery_items;
create policy "grocery select own"
  on public.grocery_items for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "grocery insert own" on public.grocery_items;
create policy "grocery insert own"
  on public.grocery_items for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "grocery update own" on public.grocery_items;
create policy "grocery update own"
  on public.grocery_items for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "grocery delete own" on public.grocery_items;
create policy "grocery delete own"
  on public.grocery_items for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Users can read their own AI usage, never write it.
drop policy if exists "ai usage events select own" on public.ai_usage_events;
create policy "ai usage events select own"
  on public.ai_usage_events for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "ai usage counters select own" on public.ai_usage_counters;
create policy "ai usage counters select own"
  on public.ai_usage_counters for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ai_model_prices, ai_global_daily, ai_response_cache, app_config:
-- RLS is enabled and no client policies exist, so they are server-only.

-- ---------------------------------------------------------------------------
-- Storage policies
-- Supabase owns storage.objects and already has RLS enabled there; changing
-- ownership/RLS on it from a CLI migration is rejected.
-- ---------------------------------------------------------------------------
drop policy if exists "recipe images public read" on storage.objects;
create policy "recipe images public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'recipe-images');

drop policy if exists "scan uploads owner read" on storage.objects;
create policy "scan uploads owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'scan-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "scan uploads owner insert" on storage.objects;
create policy "scan uploads owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'scan-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "scan uploads owner update" on storage.objects;
create policy "scan uploads owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'scan-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'scan-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "scan uploads owner delete" on storage.objects;
create policy "scan uploads owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'scan-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Privileges (explicit because auto_expose_new_tables is off)
-- ---------------------------------------------------------------------------
revoke all on public.plans from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.ingredients from anon, authenticated;
revoke all on public.recipes from anon, authenticated;
revoke all on public.recipe_ingredients from anon, authenticated;
revoke all on public.pantry_items from anon, authenticated;
revoke all on public.grocery_items from anon, authenticated;
revoke all on public.ai_model_prices from anon, authenticated;
revoke all on public.ai_usage_events from anon, authenticated;
revoke all on public.ai_usage_counters from anon, authenticated;
revoke all on public.ai_global_daily from anon, authenticated;
revoke all on public.ai_response_cache from anon, authenticated;
revoke all on public.app_config from anon, authenticated;

grant select on public.plans to anon, authenticated;
grant select on public.ingredients to anon, authenticated;
grant select on public.recipes to anon, authenticated;
grant select on public.recipe_ingredients to anon, authenticated;

grant select on public.profiles to authenticated;
-- plan_id, telegram_* are intentionally not updatable by clients.
grant update (username, locale) on public.profiles to authenticated;

grant insert, update, delete on public.recipes to authenticated;
grant insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.pantry_items to authenticated;
grant select, insert, update, delete on public.grocery_items to authenticated;

grant select on public.ai_usage_events to authenticated;
grant select on public.ai_usage_counters to authenticated;

grant usage, select on all sequences in schema public to authenticated;
grant all on public.plans, public.profiles, public.ingredients, public.recipes,
  public.recipe_ingredients, public.pantry_items, public.grocery_items,
  public.ai_model_prices, public.ai_usage_events, public.ai_usage_counters,
  public.ai_global_daily, public.ai_response_cache, public.app_config
  to service_role;
grant all on all sequences in schema public to service_role;
