const { Pool } = require('pg');

let pool;
let initPromise;

function hasDatabase() {
  return !!process.env.DATABASE_URL;
}

function getPool() {
  if (!hasDatabase()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5
    });
  }
  return pool;
}

async function query(text, params = []) {
  const db = getPool();
  if (!db) throw new Error('DATABASE_URL is not configured.');
  return db.query(text, params);
}

async function initUgcStore() {
  if (!hasDatabase()) return false;
  if (!initPromise) {
    initPromise = query(`
      create extension if not exists pgcrypto;

      create table if not exists public.ugc_asset_files (
        id uuid primary key default gen_random_uuid(),
        tenant_slug text not null,
        type text not null check (type in ('product', 'subject', 'audio', 'video', 'output')),
        name text not null,
        file_name text not null,
        mime_type text,
        size_bytes bigint,
        file_data bytea not null,
        metadata jsonb not null default '{}',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists idx_ugc_asset_files_tenant
        on public.ugc_asset_files(tenant_slug, type, created_at desc);

      create table if not exists public.ugc_video_jobs (
        id uuid primary key default gen_random_uuid(),
        tenant_slug text not null,
        provider text not null,
        workflow_preset text,
        mode text,
        audio_provider text,
        status text not null default 'processing',
        request_id text not null,
        script text,
        prompt text,
        negative_prompt text,
        error text,
        metadata jsonb not null default '{}',
        created_at timestamptz not null default now(),
        completed_at timestamptz,
        updated_at timestamptz not null default now()
      );

      create index if not exists idx_ugc_video_jobs_tenant
        on public.ugc_video_jobs(tenant_slug, created_at desc);

      create unique index if not exists idx_ugc_video_jobs_request
        on public.ugc_video_jobs(tenant_slug, request_id);

      create table if not exists public.ugc_tenant_settings (
        id uuid primary key default gen_random_uuid(),
        tenant_slug text not null,
        key text not null,
        value text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique(tenant_slug, key)
      );

      create index if not exists idx_ugc_tenant_settings_tenant
        on public.ugc_tenant_settings(tenant_slug, key);
    `).then(() => true);
  }
  return initPromise;
}

async function getAssetFile(tenantSlug, id, type) {
  await initUgcStore();
  const params = [tenantSlug, id];
  const typeFilter = type ? 'and type = $3' : '';
  if (type) params.push(type);
  const { rows } = await query(
    `select * from public.ugc_asset_files where tenant_slug = $1 and id::text = $2 ${typeFilter} limit 1`,
    params
  );
  return rows[0] || null;
}

async function getTenantSetting(tenantSlug, key) {
  await initUgcStore();
  const { rows } = await query(
    `select value from public.ugc_tenant_settings where tenant_slug = $1 and key = $2 limit 1`,
    [tenantSlug, key]
  );
  return rows[0]?.value ?? null;
}

async function setTenantSetting(tenantSlug, key, value) {
  await initUgcStore();
  await query(
    `insert into public.ugc_tenant_settings (tenant_slug, key, value, updated_at)
     values ($1, $2, $3, now())
     on conflict (tenant_slug, key) do update set value = excluded.value, updated_at = now()`,
    [tenantSlug, key, value]
  );
}

async function deleteTenantSetting(tenantSlug, key) {
  await initUgcStore();
  await query(
    `delete from public.ugc_tenant_settings where tenant_slug = $1 and key = $2`,
    [tenantSlug, key]
  );
}

module.exports = {
  deleteTenantSetting,
  getAssetFile,
  getTenantSetting,
  hasDatabase,
  initUgcStore,
  query,
  setTenantSetting
};
