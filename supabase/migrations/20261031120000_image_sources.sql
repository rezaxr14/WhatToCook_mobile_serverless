-- Durable record of every stock photo the catalog can rebuild from.
--
-- Storage is only a cache: if a bucket is lost, `image_sources` plus the
-- `recache-images` function are enough to recreate every object byte-for-byte
-- from its original source URL. The table is service-role only.
create table if not exists public.image_sources (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('dish', 'recipe', 'ingredient')),
  key text not null,
  source_url text not null,
  source_page text,
  license text,
  attribution text,
  sha256 text,
  storage_bucket text not null default 'recipe-images',
  storage_path text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, key, source_url)
);

comment on table public.image_sources is
  'Original source of every cached food photo. The durable record used to rebuild Storage.';
comment on column public.image_sources.key is
  'Catalog key or ingredient slug; the stored object is named from it.';
comment on column public.image_sources.storage_path is
  'Content-hashed object path inside storage_bucket; null until first fetch.';

create index if not exists image_sources_key_idx on public.image_sources (kind, key);

alter table public.image_sources enable row level security;
revoke all on table public.image_sources from anon, authenticated;
grant all on table public.image_sources to service_role;
grant usage, select on sequence public.image_sources_id_seq to service_role;

create or replace function public.touch_image_sources_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists image_sources_touch_updated_at on public.image_sources;
create trigger image_sources_touch_updated_at
  before update on public.image_sources
  for each row execute function public.touch_image_sources_updated_at();
