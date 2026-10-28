-- AI Vision can detect foods that are not in the catalog yet. Instead of
-- dropping those detections, clients call this RPC to create a minimal catalog
-- entry (English name + category) and add it to the caller's pantry.
--
-- SECURITY DEFINER is required because the catalog is read-only for clients.
-- The function authorises the caller with auth.uid(), validates/normalises all
-- input, and is executable by authenticated users only.

create or replace function public.add_custom_pantry_ingredient(
  p_name text,
  p_category text default 'Other'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_category text;
  v_base_slug text;
  v_slug text;
  v_ingredient_id bigint;
  v_suffix integer := 1;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid_ingredient_name' using errcode = '22023';
  end if;
  if v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_ingredient_name' using errcode = '22023';
  end if;

  v_category := case lower(btrim(coalesce(p_category, '')))
    when 'produce' then 'Produce'
    when 'dairy & eggs' then 'Dairy & Eggs'
    when 'meat & seafood' then 'Meat & Seafood'
    when 'grains & pasta' then 'Grains & Pasta'
    when 'pantry & spices' then 'Pantry & Spices'
    when 'condiments' then 'Condiments'
    when 'bakery' then 'Bakery'
    when 'beverage' then 'Beverage'
    when 'beverages' then 'Beverage'
    else 'Other'
  end;

  -- Reuse an existing catalog row when the AI spells the name the same way.
  select i.id into v_ingredient_id
  from public.ingredients i
  where lower(i.name_en) = lower(v_name)
  limit 1;

  if v_ingredient_id is null then
    v_base_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_base_slug := btrim(v_base_slug, '-');
    if v_base_slug = '' then
      v_base_slug := 'custom';
    end if;

    v_slug := v_base_slug;
    while exists (select 1 from public.ingredients i where i.slug = v_slug) loop
      v_suffix := v_suffix + 1;
      v_slug := v_base_slug || '-' || v_suffix;
    end loop;

    insert into public.ingredients (slug, names, category)
    values (v_slug, jsonb_build_object('en', v_name), v_category)
    returning id into v_ingredient_id;
  end if;

  insert into public.pantry_items (user_id, ingredient_id, quantity, deleted_at, updated_at)
  values (v_user_id, v_ingredient_id, null, null, now())
  on conflict (user_id, ingredient_id) do update
    set deleted_at = null,
        updated_at = now();

  return v_ingredient_id;
end;
$$;

revoke all on function public.add_custom_pantry_ingredient(text, text) from public;
revoke all on function public.add_custom_pantry_ingredient(text, text) from anon;
grant execute on function public.add_custom_pantry_ingredient(text, text) to authenticated;
