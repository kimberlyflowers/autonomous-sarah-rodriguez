-- Bloom UGC Studio multi-tenant schema
-- Run in Supabase SQL Editor before enabling this app for multiple clients.

create extension if not exists pgcrypto;

create table if not exists public.ugc_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  plan text not null default 'internal',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text not null default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ugc_tenants
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text not null default 'internal';

create table if not exists public.ugc_tenant_members (
  tenant_id uuid not null references public.ugc_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.ugc_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.ugc_tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  type text not null check (type in ('product', 'subject', 'audio', 'video', 'output')),
  name text not null,
  storage_bucket text not null default 'ugc-assets',
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.ugc_brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.ugc_tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  slug text not null,
  name text not null,
  category text,
  description text,
  selling_points text[] not null default '{}',
  target_audience text,
  tone text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table if not exists public.ugc_video_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.ugc_tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  provider text not null,
  workflow_preset text,
  mode text not null check (mode in ('i2v', 'v2v', 't2v')),
  audio_provider text not null default 'upload',
  status text not null default 'queued' check (status in ('queued', 'pending', 'processing', 'completed', 'failed', 'cancelled')),
  request_id text,
  script text,
  prompt text,
  negative_prompt text,
  input_asset_ids uuid[] not null default '{}',
  output_asset_id uuid references public.ugc_assets(id) on delete set null,
  error text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ugc_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.ugc_tenants(id) on delete set null,
  stripe_event_id text unique,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_ugc_tenant_members_user on public.ugc_tenant_members(user_id);
create index if not exists idx_ugc_assets_tenant on public.ugc_assets(tenant_id, created_at desc);
create index if not exists idx_ugc_brands_tenant on public.ugc_brands(tenant_id, updated_at desc);
create index if not exists idx_ugc_video_jobs_tenant on public.ugc_video_jobs(tenant_id, created_at desc);
create index if not exists idx_ugc_video_jobs_request on public.ugc_video_jobs(request_id);
create index if not exists idx_ugc_billing_events_tenant on public.ugc_billing_events(tenant_id, created_at desc);

create or replace function public.ugc_is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ugc_tenant_members m
    where m.tenant_id = target_tenant_id
      and m.user_id = auth.uid()
  );
$$;

alter table public.ugc_tenants enable row level security;
alter table public.ugc_tenant_members enable row level security;
alter table public.ugc_assets enable row level security;
alter table public.ugc_brands enable row level security;
alter table public.ugc_video_jobs enable row level security;
alter table public.ugc_billing_events enable row level security;

drop policy if exists "UGC members can view tenants" on public.ugc_tenants;
create policy "UGC members can view tenants"
  on public.ugc_tenants for select
  using (public.ugc_is_tenant_member(id));

drop policy if exists "UGC members can view memberships" on public.ugc_tenant_members;
create policy "UGC members can view memberships"
  on public.ugc_tenant_members for select
  using (user_id = auth.uid() or public.ugc_is_tenant_member(tenant_id));

drop policy if exists "UGC members can manage own assets" on public.ugc_assets;
create policy "UGC members can manage own assets"
  on public.ugc_assets for all
  using (public.ugc_is_tenant_member(tenant_id))
  with check (public.ugc_is_tenant_member(tenant_id));

drop policy if exists "UGC members can manage own brands" on public.ugc_brands;
create policy "UGC members can manage own brands"
  on public.ugc_brands for all
  using (public.ugc_is_tenant_member(tenant_id))
  with check (public.ugc_is_tenant_member(tenant_id));

drop policy if exists "UGC members can manage own jobs" on public.ugc_video_jobs;
create policy "UGC members can manage own jobs"
  on public.ugc_video_jobs for all
  using (public.ugc_is_tenant_member(tenant_id))
  with check (public.ugc_is_tenant_member(tenant_id));

drop policy if exists "UGC members can view own billing events" on public.ugc_billing_events;
create policy "UGC members can view own billing events"
  on public.ugc_billing_events for select
  using (public.ugc_is_tenant_member(tenant_id));

insert into storage.buckets (id, name, public)
values ('ugc-assets', 'ugc-assets', false)
on conflict (id) do nothing;

drop policy if exists "UGC members can read own storage files" on storage.objects;
create policy "UGC members can read own storage files"
  on storage.objects for select
  using (
    bucket_id = 'ugc-assets'
    and exists (
      select 1
      from public.ugc_tenants t
      where t.slug = split_part(name, '/', 1)
        and public.ugc_is_tenant_member(t.id)
    )
  );

drop policy if exists "UGC members can upload own storage files" on storage.objects;
create policy "UGC members can upload own storage files"
  on storage.objects for insert
  with check (
    bucket_id = 'ugc-assets'
    and exists (
      select 1
      from public.ugc_tenants t
      where t.slug = split_part(name, '/', 1)
        and public.ugc_is_tenant_member(t.id)
    )
  );

drop policy if exists "UGC members can update own storage files" on storage.objects;
create policy "UGC members can update own storage files"
  on storage.objects for update
  using (
    bucket_id = 'ugc-assets'
    and exists (
      select 1
      from public.ugc_tenants t
      where t.slug = split_part(name, '/', 1)
        and public.ugc_is_tenant_member(t.id)
    )
  )
  with check (
    bucket_id = 'ugc-assets'
    and exists (
      select 1
      from public.ugc_tenants t
      where t.slug = split_part(name, '/', 1)
        and public.ugc_is_tenant_member(t.id)
    )
  );

drop policy if exists "UGC members can delete own storage files" on storage.objects;
create policy "UGC members can delete own storage files"
  on storage.objects for delete
  using (
    bucket_id = 'ugc-assets'
    and exists (
      select 1
      from public.ugc_tenants t
      where t.slug = split_part(name, '/', 1)
        and public.ugc_is_tenant_member(t.id)
    )
  );
