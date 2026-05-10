-- Multi-tenant website editing tools
-- Gives every Bloomie scoped website/page/event/blog records without creating
-- one-off admin panels for each client.

create extension if not exists pgcrypto;

create table if not exists client_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  org_slug text not null,
  site_name text not null,
  template_id text default '01',
  theme_color text,
  custom_domain text,
  ghl_location_id text,
  ghl_calendar_id text,
  source_repo text,
  vercel_project_id text,
  published boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table client_sites add column if not exists organization_id uuid;
alter table client_sites add column if not exists org_slug text;
alter table client_sites add column if not exists site_name text;
alter table client_sites add column if not exists template_id text default '01';
alter table client_sites add column if not exists theme_color text;
alter table client_sites add column if not exists custom_domain text;
alter table client_sites add column if not exists ghl_location_id text;
alter table client_sites add column if not exists ghl_calendar_id text;
alter table client_sites add column if not exists source_repo text;
alter table client_sites add column if not exists vercel_project_id text;
alter table client_sites add column if not exists published boolean not null default false;
alter table client_sites add column if not exists settings jsonb not null default '{}'::jsonb;
alter table client_sites add column if not exists created_at timestamptz not null default now();
alter table client_sites add column if not exists updated_at timestamptz not null default now();

create unique index if not exists client_sites_org_slug_key
  on client_sites (organization_id, org_slug);

create unique index if not exists client_sites_custom_domain_key
  on client_sites (custom_domain)
  where custom_domain is not null;

create table if not exists site_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references client_sites(id) on delete cascade,
  slug text not null,
  title text not null,
  content_html text,
  content_data jsonb,
  template_id text default '01',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table site_pages add column if not exists site_id uuid;
alter table site_pages add column if not exists slug text;
alter table site_pages add column if not exists title text;
alter table site_pages add column if not exists content_html text;
alter table site_pages add column if not exists content_data jsonb;
alter table site_pages add column if not exists template_id text default '01';
alter table site_pages add column if not exists published boolean not null default true;
alter table site_pages add column if not exists created_at timestamptz not null default now();
alter table site_pages add column if not exists updated_at timestamptz not null default now();

create unique index if not exists site_pages_site_slug_key
  on site_pages (site_id, slug);

create table if not exists website_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null references client_sites(id) on delete cascade,
  title text not null,
  slug text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  summary text,
  description text,
  image_url text,
  registration_url text,
  ghl_calendar_id text,
  ghl_form_id text,
  ticket_type text not null default 'free' check (ticket_type in ('free', 'paid')),
  ticket_price_cents integer not null default 0,
  currency text not null default 'USD',
  published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists website_events_site_slug_key
  on website_events (site_id, slug);

create index if not exists website_events_org_site_starts_idx
  on website_events (organization_id, site_id, starts_at);

create table if not exists website_blog_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null references client_sites(id) on delete cascade,
  title text not null,
  slug text not null,
  page_slug text not null,
  excerpt text,
  content_html text,
  author text,
  hero_image_url text,
  tags text[] not null default '{}',
  published boolean not null default true,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists website_blog_posts_site_slug_key
  on website_blog_posts (site_id, slug);

create index if not exists website_blog_posts_org_site_published_idx
  on website_blog_posts (organization_id, site_id, published_at desc);
