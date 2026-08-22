alter table public.shortdrama_shows
  add column if not exists source_categories text[] not null default '{}'::text[],
  add column if not exists normalized_genres text[] not null default '{}'::text[];

alter table public.shortdrama_shows
  drop constraint if exists shortdrama_shows_source_categories_no_blank,
  add constraint shortdrama_shows_source_categories_no_blank
    check (array_position(source_categories, '') is null),
  drop constraint if exists shortdrama_shows_normalized_genres_no_blank,
  add constraint shortdrama_shows_normalized_genres_no_blank
    check (array_position(normalized_genres, '') is null);

create index if not exists shortdrama_shows_source_categories_gin_idx
  on public.shortdrama_shows using gin (source_categories);
create index if not exists shortdrama_shows_normalized_genres_gin_idx
  on public.shortdrama_shows using gin (normalized_genres);
