-- BLOOM Autonomous Agent Infrastructure - Database Schema
-- Railway PostgreSQL setup for heartbeat-engine and agent operations

-- Create database (run this first if bloom_heartbeat doesn't exist)
-- CREATE DATABASE bloom_heartbeat;
-- \c bloom_heartbeat;

-- Agent profiles table
CREATE TABLE IF NOT EXISTS agents (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(255),
    client VARCHAR(255),
    autonomy_level INTEGER DEFAULT 1,
    standing_instructions TEXT,
    config JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Heartbeat cycle records - tracks each autonomous cycle
CREATE TABLE IF NOT EXISTS heartbeat_cycles (
    cycle_id VARCHAR(100) PRIMARY KEY,
    agent_id VARCHAR(100) REFERENCES agents(id),
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    actions_count INTEGER DEFAULT 0,
    rejections_count INTEGER DEFAULT 0,
    handoffs_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'running',
    error TEXT,
    environment_snapshot JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Action log - what the agent DID (the "do" in sense-think-do)
CREATE TABLE IF NOT EXISTS action_log (
    id SERIAL PRIMARY KEY,
    cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
    agent_id VARCHAR(100) REFERENCES agents(id),
    action_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    target_system VARCHAR(100), -- GHL, EMAIL, CALENDAR, etc.
    input_data JSONB,
    result JSONB,
    success BOOLEAN,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Rejection log - what the agent DECIDED NOT TO DO (crucial for trust building)
CREATE TABLE IF NOT EXISTS rejection_log (
    id SERIAL PRIMARY KEY,
    cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
    agent_id VARCHAR(100) REFERENCES agents(id),
    candidate_action VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    reason_code VARCHAR(50), -- RISK, SCOPE, TIMING, DUPLICATE, LOW_VALUE, INSUFFICIENT_DATA
    confidence DECIMAL(3,2), -- 0.00 to 1.00 - how confident in the rejection
    alternative_suggested TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Handoff log - what the agent ESCALATED to human (also crucial for trust)
CREATE TABLE IF NOT EXISTS handoff_log (
    id SERIAL PRIMARY KEY,
    cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
    agent_id VARCHAR(100) REFERENCES agents(id),
    issue TEXT NOT NULL,
    analysis_path TEXT, -- what the agent already checked
    hypotheses_tested JSONB, -- what possibilities were ruled out
    recommendation TEXT, -- agent's suggestion for human action
    confidence DECIMAL(3,2), -- how confident in the analysis
    urgency VARCHAR(50), -- LOW, MEDIUM, HIGH, CRITICAL
    human_notified BOOLEAN DEFAULT FALSE,
    human_response TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Trust metrics - tracks performance for autonomy level graduation
CREATE TABLE IF NOT EXISTS trust_metrics (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100) REFERENCES agents(id),
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    total_cycles INTEGER DEFAULT 0,
    total_actions INTEGER DEFAULT 0,
    successful_actions INTEGER DEFAULT 0,
    rollback_count INTEGER DEFAULT 0,
    escalation_count INTEGER DEFAULT 0,
    rejection_count INTEGER DEFAULT 0,
    approval_rate DECIMAL(5,2), -- percentage of actions that didn't need rollback
    action_success_rate DECIMAL(5,2), -- percentage of successful actions
    escalation_appropriateness DECIMAL(5,2), -- scored by human feedback
    calculated_at TIMESTAMP DEFAULT NOW()
);

-- Agent memory snapshots (backup for Letta)
CREATE TABLE IF NOT EXISTS memory_snapshots (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100) REFERENCES agents(id),
    cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
    memory_type VARCHAR(50), -- CONVERSATION, LEARNED_PATTERN, PREFERENCE, CONTEXT
    content JSONB,
    relevance_score DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_action_log_agent_time ON action_log(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rejection_log_agent_time ON rejection_log(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_handoff_log_agent_time ON handoff_log(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeat_agent_time ON heartbeat_cycles(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trust_metrics_agent_period ON trust_metrics(agent_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_heartbeat_status ON heartbeat_cycles(status, started_at);
CREATE INDEX IF NOT EXISTS idx_handoff_unresolved ON handoff_log(agent_id, resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_memory_agent_type ON memory_snapshots(agent_id, memory_type, created_at DESC);

-- Insert Sarah Rodriguez agent profile
INSERT INTO agents (id, name, role, client, autonomy_level, standing_instructions, config, created_at)
VALUES (
    'bloomie-sarah-rodriguez',
    'Sarah Rodriguez',
    'Operations Agent',
    'BLOOM Ecosystem',
    1, -- Start at Observer level
    'You are Sarah Rodriguez, an autonomous operations agent for BLOOM Ecosystem.

    Every heartbeat cycle, you should:
    1. Check for new client inquiries in GHL and respond within scope
    2. Check for overdue follow-ups and send reminders
    3. Check for upcoming calendar events and prepare reminders
    4. Check for any tasks assigned to you and work on them
    5. Monitor email for anything requiring attention

    You operate within your current autonomy level. If something exceeds your scope,
    escalate to Kimberly with your analysis, what you have already checked, and your
    recommendation. Never guess — if unsure, escalate.

    Log everything: what you did, what you chose not to do (and why), and what you
    escalated. Your logs are how trust is built.',
    '{
        "ghlConfig": {
            "locationId": "iGy4nrpDVU0W1jAvseL3",
            "checkFrequency": "30min",
            "pipelineMonitoring": ["enrollment_inquiries", "follow_ups", "appointments"]
        },
        "emailConfig": {
            "checkInbox": true,
            "autoRespond": false,
            "escalateUnknownSenders": true
        },
        "calendarConfig": {
            "reminderWindow": "24h",
            "prepReminders": true
        },
        "humanContact": {
            "name": "Kimberly Flowers",
            "method": "email",
            "address": "kimberly@bloomiestaffing.com"
        },
        "autonomySettings": {
            "currentLevel": 1,
            "graduationCriteria": {
                "cyclesRequired": 100,
                "successRateThreshold": 0.95,
                "appropriateEscalationRate": 0.8
            }
        }
    }',
    NOW()
) ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW(),
    config = EXCLUDED.config,
    autonomy_level = EXCLUDED.autonomy_level;

-- Create initial trust metrics baseline
INSERT INTO trust_metrics (agent_id, period_start, period_end, calculated_at)
VALUES (
    'bloomie-sarah-rodriguez',
    NOW() - INTERVAL '1 day',
    NOW(),
    NOW()
) ON CONFLICT DO NOTHING;

-- Useful queries for monitoring
-- View recent agent activity:
-- SELECT * FROM heartbeat_cycles WHERE agent_id = 'bloomie-sarah-rodriguez' ORDER BY started_at DESC LIMIT 10;

-- View what agent did vs didn't do:
-- SELECT 'ACTION' as type, description as content, timestamp FROM action_log WHERE agent_id = 'bloomie-sarah-rodriguez'
-- UNION ALL
-- SELECT 'REJECTION' as type, candidate_action || ' - ' || reason as content, timestamp FROM rejection_log WHERE agent_id = 'bloomie-sarah-rodriguez'
-- ORDER BY timestamp DESC LIMIT 20;

-- Check trust progression:
-- SELECT autonomy_level, total_cycles, approval_rate, escalation_count FROM agents a
-- LEFT JOIN trust_metrics tm ON a.id = tm.agent_id
-- WHERE a.id = 'bloomie-sarah-rodriguez' ORDER BY tm.calculated_at DESC LIMIT 5;