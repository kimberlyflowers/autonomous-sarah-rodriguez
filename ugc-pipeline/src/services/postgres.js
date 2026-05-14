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

module.exports = {
  getAssetFile,
  hasDatabase,
  initUgcStore,
  query
};
