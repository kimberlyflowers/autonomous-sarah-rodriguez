create table if not exists public.bloomie_watch_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bloomie_watch_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

create table if not exists public.bloomie_watch_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id text not null,
  episode_id text not null,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

create index if not exists bloomie_watch_favorites_user_created_idx
  on public.bloomie_watch_favorites (user_id, created_at desc);
create index if not exists bloomie_watch_progress_user_updated_idx
  on public.bloomie_watch_progress (user_id, updated_at desc);

alter table public.bloomie_watch_profiles enable row level security;
alter table public.bloomie_watch_favorites enable row level security;
alter table public.bloomie_watch_progress enable row level security;

revoke all on public.bloomie_watch_profiles from anon;
revoke all on public.bloomie_watch_favorites from anon;
revoke all on public.bloomie_watch_progress from anon;
grant select, insert, update, delete on public.bloomie_watch_profiles to authenticated;
grant select, insert, update, delete on public.bloomie_watch_favorites to authenticated;
grant select, insert, update, delete on public.bloomie_watch_progress to authenticated;

drop policy if exists "View own Bloomie Watch profile" on public.bloomie_watch_profiles;
create policy "View own Bloomie Watch profile"
on public.bloomie_watch_profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Create own Bloomie Watch profile" on public.bloomie_watch_profiles;
create policy "Create own Bloomie Watch profile"
on public.bloomie_watch_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Update own Bloomie Watch profile" on public.bloomie_watch_profiles;
create policy "Update own Bloomie Watch profile"
on public.bloomie_watch_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own Bloomie Watch profile" on public.bloomie_watch_profiles;
create policy "Delete own Bloomie Watch profile"
on public.bloomie_watch_profiles for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "View own Bloomie Watch favorites" on public.bloomie_watch_favorites;
create policy "View own Bloomie Watch favorites"
on public.bloomie_watch_favorites for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Create own Bloomie Watch favorites" on public.bloomie_watch_favorites;
create policy "Create own Bloomie Watch favorites"
on public.bloomie_watch_favorites for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own Bloomie Watch favorites" on public.bloomie_watch_favorites;
create policy "Delete own Bloomie Watch favorites"
on public.bloomie_watch_favorites for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "View own Bloomie Watch progress" on public.bloomie_watch_progress;
create policy "View own Bloomie Watch progress"
on public.bloomie_watch_progress for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Create own Bloomie Watch progress" on public.bloomie_watch_progress;
create policy "Create own Bloomie Watch progress"
on public.bloomie_watch_progress for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Update own Bloomie Watch progress" on public.bloomie_watch_progress;
create policy "Update own Bloomie Watch progress"
on public.bloomie_watch_progress for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Delete own Bloomie Watch progress" on public.bloomie_watch_progress;
create policy "Delete own Bloomie Watch progress"
on public.bloomie_watch_progress for delete to authenticated
using ((select auth.uid()) = user_id);
