// ── BLOOM Supabase Auto-Setup ─────────────────────────────────────────────
// Ensures Quality Gate tables and schema extensions exist in Supabase.
// Called on startup. Uses SUPABASE_SERVICE_KEY (service_role) which is
// available in the Railway environment.
//
// Safe to call on every startup — all statements use IF NOT EXISTS / OR REPLACE.
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from '../logging/logger.js';

const logger = createLogger('supabase-setup');

// ── SQL executed on every startup ────────────────────────────────────────────
const QUALITY_GATE_DDL = `
-- bloom_review_queue ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bloom_review_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_run_id        UUID,
  organization_id    UUID,
  agent_id           TEXT,
  deliverable_type   TEXT CHECK (deliverable_type IN (
                       'website', 'blog_post', 'image', 'document',
                       'email', 'social_post'
                     )),
  deliverable_url    TEXT,
  deliverable_content TEXT,
  checklist_json     JSONB,
  confidence_score   FLOAT CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  review_status      TEXT DEFAULT 'pending'
                       CHECK (review_status IN ('pending', 'approved', 'needs_revision')),
  claude_feedback    TEXT,
  revision_count     INT DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_review_queue_task_run_id   ON bloom_review_queue(task_run_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_org_id        ON bloom_review_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status        ON bloom_review_queue(review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_agent_id      ON bloom_review_queue(agent_id, created_at DESC);

-- Extend task_runs status values ──────────────────────────────────────────────
ALTER TABLE task_runs
  DROP CONSTRAINT IF EXISTS task_runs_status_check;

ALTER TABLE task_runs
  ADD CONSTRAINT task_runs_status_check
    CHECK (status IN (
      'queued', 'pending', 'running', 'completed', 'failed',
      'pending_review', 'approved', 'needs_revision', 'delivered'
    ));
`;

// ── Execute DDL statements sequentially via REST endpoint ────────────────────
// Supabase exposes PostgreSQL as a REST API.  The service_role key can execute
// raw SQL through the /rest/v1/rpc/<fn> route if a helper function exists, or
// through a direct psql-style connection.
//
// We use the pg-compatible connection via the Supabase pooler here.
async function execSupabaseDDL(sql) {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return false;

  // Extract project ref from URL (e.g. njfhzabmaxhfzekbzpzz)
  const ref = url.replace('https://', '').replace('.supabase.co', '').split('.')[0];

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let ok = true;
  for (const stmt of statements) {
    try {
      // Use the Supabase REST API's POST /rest/v1/rpc/exec endpoint if it exists,
      // otherwise try the pg connection via the supabase-js client.
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      // Try native rpc exec_sql (available if the function was pre-created)
      const { error } = await supabase.rpc('exec_sql', { sql_string: stmt + ';' });

      if (error) {
        if (error.message?.includes('does not exist') && error.message?.includes('exec_sql')) {
          // exec_sql function not available — fall through to pg.Pool direct connection
          ok = await execViaPool(ref, key, stmt + ';');
          if (!ok) break;
        } else if (
          error.message?.includes('already exists') ||
          error.message?.includes('does not exist') && stmt.toLowerCase().includes('drop constraint')
        ) {
          // Idempotent — skip
        } else {
          logger.warn(`Supabase DDL stmt warning: ${error.message}`);
        }
      }
    } catch (e) {
      logger.warn(`Supabase DDL exec error: ${e.message}`);
      ok = false;
    }
  }
  return ok;
}

// ── Fallback: connect via pg Pool to Supabase pooler ────────────────────────
async function execViaPool(ref, serviceKey, sql) {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: `postgresql://postgres.${ref}:${serviceKey}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await pool.query(sql);
    await pool.end();
    return true;
  } catch (e) {
    logger.warn(`Supabase pool DDL error: ${e.message}`);
    return false;
  }
}

// ── Public function: ensureSupabaseSchema ────────────────────────────────────
export async function ensureSupabaseSchema() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logger.debug('Supabase credentials not set — skipping schema check');
    return;
  }

  logger.info('🔧 Supabase: Checking Quality Gate schema...');

  try {
    // Quick check: does bloom_review_queue already exist?
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );

    const { error: checkErr } = await supabase
      .from('bloom_review_queue')
      .select('id')
      .limit(1);

    if (!checkErr || checkErr.code === 'PGRST116') {
      // PGRST116 = no rows found (table exists but is empty) — already set up
      logger.info('✅ Supabase: bloom_review_queue already exists');
      return;
    }

    if (checkErr.code === 'PGRST205') {
      // Table not found — run DDL
      logger.info('🏗️  Supabase: Creating Quality Gate tables...');
      const ddlOk = await execSupabaseDDL(QUALITY_GATE_DDL);
      if (ddlOk) {
        logger.info('✅ Supabase: Quality Gate schema created successfully');
      } else {
        logger.warn('⚠️  Supabase: Schema creation had issues — may need manual migration');
        logger.warn('   Run: node run-quality-gate-migration.mjs');
      }
    } else {
      logger.warn(`Supabase schema check returned unexpected error: ${checkErr.message}`);
    }
  } catch (e) {
    logger.warn(`Supabase schema setup error (non-fatal): ${e.message}`);
  }
}
