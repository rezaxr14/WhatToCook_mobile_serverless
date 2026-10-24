-- Ingredient thumbnails cached by the `cache-ingredient-images` Edge Function.
--
-- The reference app resolved ingredient photos from a hard-coded Unsplash map.
-- That external host is not reachable from every network, so the server copies
-- each photo into this public bucket once and stores the object path in
-- `public.ingredients.image_path`. Object names are content-hashed
-- (`ingredients/<slug>-<sha256 prefix>.<ext>`), which lets the objects be served
-- with a one-year immutable cache: replacing a photo creates a new URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ingredient-images',
  'ingredient-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ingredient images public read" on storage.objects;
create policy "ingredient images public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'ingredient-images');
