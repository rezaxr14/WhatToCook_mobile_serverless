-- Security hardening found by the Supabase advisors after M1.

-- Trigger/event-trigger helpers must never be callable through PostgREST.
-- Triggers do not require EXECUTE privileges, so revoking these is safe.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- This helper is present on some hosted projects but not in the local image.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- These tables are server-only. Explicit deny policies document the intent and
-- keep the RLS advisor from reporting them as accidentally unprotected.
drop policy if exists "ai global daily deny clients" on public.ai_global_daily;
create policy "ai global daily deny clients" on public.ai_global_daily
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "ai model prices deny clients" on public.ai_model_prices;
create policy "ai model prices deny clients" on public.ai_model_prices
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "ai response cache deny clients" on public.ai_response_cache;
create policy "ai response cache deny clients" on public.ai_response_cache
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "app config deny clients" on public.app_config;
create policy "app config deny clients" on public.app_config
  for all to anon, authenticated
  using (false)
  with check (false);
