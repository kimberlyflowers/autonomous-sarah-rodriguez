-- Migration 003: Ralph+Cowork Verification System
-- Adds progress log table and verification tracking to task plans
-- Run this against your Supabase database

-- ============================================
-- 1. PROGRESS LOG TABLE (Ralph's progress.txt)
-- ============================================
CREATE TABLE IF NOT EXISTS bloom_progress_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL DEFAULT 'bloomie-sarah-rodriguez',
  cycle_id VARCHAR(100),
  project_id VARCHAR(255),
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN (
    'task_completed', 'task_failed', 'learning', 'blocker',
    'observation', 'verification_result', 'retry_attempt', 'cycle_summary'
  )),
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  steps_completed TEXT[] DEFAULT '{}',
  steps_failed JSONB DEFAULT '[]',
  next_priority TEXT,
  verification_results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient querying by agent and time
CREATE INDEX IF NOT EXISTS idx_progress_log_agent_time
  ON bloom_progress_log(agent_id, created_at DESC);

-- Index for project-specific queries
CREATE INDEX IF NOT EXISTS idx_progress_log_project
  ON bloom_progress_log(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

-- ============================================
-- 2. TASK PLANS VERIFICATION COLUMNS
-- ============================================
-- Add verification tracking to task_plans (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_plans' AND column_name = 'verification_status'
  ) THEN
    ALTER TABLE task_plans ADD COLUMN verification_status VARCHAR(50) DEFAULT 'unverified';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_plans' AND column_name = 'all_steps_passing'
  ) THEN
    ALTER TABLE task_plans ADD COLUMN all_steps_passing BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_plans' AND column_name = 'last_verified_at'
  ) THEN
    ALTER TABLE task_plans ADD COLUMN last_verified_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- ============================================
-- 3. VERIFICATION LOG TABLE
-- ============================================
-- Detailed log of every verification check for auditing
CREATE TABLE IF NOT EXISTS bloom_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL DEFAULT 'bloomie-sarah-rodriguez',
  cycle_id VARCHAR(100),
  plan_id VARCHAR(100),
  step_id INTEGER,
  action_type VARCHAR(100) NOT NULL,
  verified BOOLEAN NOT NULL,
  confidence VARCHAR(20) DEFAULT 'none',
  evidence JSONB,
  reason TEXT,
  strategy VARCHAR(50),
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_log_plan
  ON bloom_verification_log(plan_id, step_id);

CREATE INDEX IF NOT EXISTS idx_verification_log_time
  ON bloom_verification_log(created_at DESC);

-- ============================================
-- 4. RLS POLICIES (if using Supabase RLS)
-- ============================================
-- Uncomment if RLS is enabled on your Supabase project:
-- ALTER TABLE bloom_progress_log ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bloom_verification_log ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Service role access" ON bloom_progress_log FOR ALL USING (true);
-- CREATE POLICY "Service role access" ON bloom_verification_log FOR ALL USING (true);
