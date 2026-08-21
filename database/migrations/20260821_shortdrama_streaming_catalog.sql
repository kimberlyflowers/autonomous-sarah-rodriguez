insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shortdrama-videos',
  'shortdrama-videos',
  true,
  524288000,
  array['video/mp4','image/jpeg','image/png','image/webp','image/avif','application/json']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.shortdrama_shows (
  id text primary key,
  title text not null,
  source_order integer not null,
  cover_url text,
  hero_url text,
  description text,
  genre text default 'Short drama',
  episode_count integer not null default 0,
  ingestion_status text not null default 'discovered'
    check (ingestion_status in ('discovered','cover_ready','ingesting','ready','failed')),
  source text not null default 'tiktok',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shortdrama_episodes (
  id text primary key,
  show_id text not null references public.shortdrama_shows(id) on delete cascade,
  episode_number integer not null,
  title text,
  description text,
  duration_seconds integer,
  thumbnail_url text,
  video_url text,
  ingestion_status text not null default 'discovered'
    check (ingestion_status in ('discovered','ingesting','ready','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(show_id, episode_number)
);

create index if not exists shortdrama_shows_status_order_idx
  on public.shortdrama_shows (ingestion_status, source_order);
create index if not exists shortdrama_episodes_show_number_idx
  on public.shortdrama_episodes (show_id, episode_number);

alter table public.shortdrama_shows enable row level security;
alter table public.shortdrama_episodes enable row level security;

drop policy if exists "Public reads ready shortdrama shows" on public.shortdrama_shows;
create policy "Public reads ready shortdrama shows"
on public.shortdrama_shows for select
to anon, authenticated
using (ingestion_status = 'ready');

drop policy if exists "Public reads ready shortdrama episodes" on public.shortdrama_episodes;
create policy "Public reads ready shortdrama episodes"
on public.shortdrama_episodes for select
to anon, authenticated
using (
  ingestion_status = 'ready'
  and exists (
    select 1 from public.shortdrama_shows s
    where s.id = show_id and s.ingestion_status = 'ready'
  )
);
