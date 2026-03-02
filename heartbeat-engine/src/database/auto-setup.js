// BLOOM Heartbeat Engine - Auto Database Setup
// Ensures bloom_heartbeat database and schema exist on startup

import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../logging/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createLogger('auto-setup');

// Create connection to default postgres database
const createDefaultPool = () => {
  if (process.env.DATABASE_URL) {
    // For DATABASE_URL, we need to connect to the default database first
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = '/postgres'; // Connect to default postgres database
    return new Pool({
      connectionString: url.toString(),
      ssl: false,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
  }
  return new Pool({
    host: process.env.PGHOST || 'postgres.railway.internal',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: 'postgres', // Connect to default database
    ssl: false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
};

// Create connection to bloom_heartbeat database
const createBloomPool = () => {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
  }
  return new Pool({
    host: process.env.PGHOST || 'postgres.railway.internal',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    database: 'bloom_heartbeat',
    ssl: false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
};

export async function ensureDatabaseExists() {
  logger.info('🔧 Ensuring bloom_heartbeat database exists...');

  let defaultPool = null;
  let bloomPool = null;

  try {
    // Connect to default postgres database
    defaultPool = createDefaultPool();

    // Check if bloom_heartbeat database exists
    const dbResult = await defaultPool.query(`
      SELECT 1 FROM pg_database WHERE datname = 'bloom_heartbeat'
    `);

    if (dbResult.rows.length === 0) {
      logger.info('📦 Creating bloom_heartbeat database...');
      await defaultPool.query('CREATE DATABASE bloom_heartbeat');
      logger.info('✅ Database bloom_heartbeat created successfully');
    } else {
      logger.info('✅ Database bloom_heartbeat already exists');
    }

    // Close connection to default database
    await defaultPool.end();
    defaultPool = null;

    // Connect to bloom_heartbeat database
    bloomPool = createBloomPool();

    // Check if ALL required tables exist
    const tableResult = await bloomPool.query(`
      SELECT COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN (
        'agents', 'heartbeat_cycles', 'action_log', 'rejection_log',
        'handoff_log', 'trust_metrics', 'memory_snapshots'
      )
    `);

    const tableCount = parseInt(tableResult.rows[0].table_count);
    const expectedTables = 7;

    if (tableCount === 0) {
      logger.info('🏗️  Creating database schema (no tables found)...');
      await createSchema(bloomPool);
      logger.info('✅ Database schema created successfully');
    } else if (tableCount < expectedTables) {
      logger.warn(`⚠️  Found ${tableCount} tables, expected ${expectedTables} - recreating full schema`);
      logger.info('🏗️  Running full schema creation...');
      await createSchema(bloomPool);
    } else {
      logger.info(`✅ All ${expectedTables} database tables exist`);
    }

    // Verify Sarah's agent profile exists
    await ensureAgentProfile(bloomPool);

    await bloomPool.end();
    bloomPool = null;

    logger.info('🎯 Database setup complete!');
    return true;

  } catch (error) {
    logger.error('❌ Database setup failed:', error.message);

    // Clean up connections
    if (defaultPool) await defaultPool.end().catch(() => {});
    if (bloomPool) await bloomPool.end().catch(() => {});

    return false;
  }
}

async function createSchema(pool) {
  try {
    // Read schema file
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');

    // Execute schema - split by semicolon and execute each statement
    const statements = schemaSql.split(';').filter(stmt => stmt.trim().length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
      }
    }

    logger.info('📊 Database tables and indexes created');

  } catch (error) {
    // If we can't read the schema file, create basic tables manually
    logger.warn('Could not read schema file, creating basic schema:', error.message);
    await createBasicSchema(pool);
  }
}

async function createBasicSchema(pool) {
  logger.info('🔨 Creating basic schema manually...');

  // Create agents table
  await pool.query(`
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
    )
  `);

  // Create heartbeat_cycles table
  await pool.query(`
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
    )
  `);

  // Create action_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS action_log (
      id SERIAL PRIMARY KEY,
      cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
      agent_id VARCHAR(100) REFERENCES agents(id),
      action_type VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      target_system VARCHAR(100),
      input_data JSONB,
      result JSONB,
      success BOOLEAN,
      timestamp TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create rejection_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rejection_log (
      id SERIAL PRIMARY KEY,
      cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
      agent_id VARCHAR(100) REFERENCES agents(id),
      candidate_action VARCHAR(255) NOT NULL,
      reason TEXT NOT NULL,
      reason_code VARCHAR(50),
      confidence DECIMAL(3,2),
      alternative_suggested TEXT,
      timestamp TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create handoff_log table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS handoff_log (
      id SERIAL PRIMARY KEY,
      cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
      agent_id VARCHAR(100) REFERENCES agents(id),
      issue TEXT NOT NULL,
      analysis_path TEXT,
      hypotheses_tested JSONB,
      recommendation TEXT,
      confidence DECIMAL(3,2),
      urgency VARCHAR(50),
      human_notified BOOLEAN DEFAULT FALSE,
      human_response TEXT,
      resolved BOOLEAN DEFAULT FALSE,
      timestamp TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create trust_metrics table
  await pool.query(`
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
      approval_rate DECIMAL(5,2),
      action_success_rate DECIMAL(5,2),
      escalation_appropriateness DECIMAL(5,2),
      calculated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create memory_snapshots table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memory_snapshots (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(100) REFERENCES agents(id),
      cycle_id VARCHAR(100) REFERENCES heartbeat_cycles(cycle_id),
      memory_type VARCHAR(50),
      content JSONB,
      relevance_score DECIMAL(3,2),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create bloom_context table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bloom_context (
      id SERIAL PRIMARY KEY,
      agent_id VARCHAR(100) REFERENCES agents(id),
      context_type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      related_entities JSONB,
      tags JSONB,
      expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create indexes (matching schema.sql)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_action_log_agent_time ON action_log(agent_id, timestamp DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rejection_log_agent_time ON rejection_log(agent_id, timestamp DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_handoff_log_agent_time ON handoff_log(agent_id, timestamp DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeat_agent_time ON heartbeat_cycles(agent_id, started_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trust_metrics_agent_period ON trust_metrics(agent_id, period_start, period_end)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_heartbeat_status ON heartbeat_cycles(status, started_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_handoff_unresolved ON handoff_log(agent_id, resolved) WHERE resolved = FALSE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_memory_agent_type ON memory_snapshots(agent_id, memory_type, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bloom_context_agent_type ON bloom_context(agent_id, context_type, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bloom_context_expires ON bloom_context(expires_at) WHERE expires_at IS NOT NULL`);

  logger.info('✅ Basic schema created manually');
}

// Simple database connection test
export async function testDatabaseConnection() {
  const pool = createBloomPool();
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    logger.debug('Database connection test successful');
    return true;
  } catch (error) {
    logger.debug('Database connection test failed:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function ensureAgentProfile(pool) {
  logger.info('👩‍💼 Ensuring Sarah Rodriguez agent profile exists...');

  const agentResult = await pool.query(`
    SELECT id FROM agents WHERE id = 'bloomie-sarah-rodriguez'
  `);

  if (agentResult.rows.length === 0) {
    logger.info('📝 Creating Sarah Rodriguez agent profile...');

    const standingInstructions = `You are Sarah Rodriguez, an autonomous operations agent for BLOOM Ecosystem.

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
escalated. Your logs are how trust is built.`;

    const config = {
      ghlConfig: {
        locationId: process.env.GHL_LOCATION_ID || "iGy4nrpDVU0W1jAvseL3",
        checkFrequency: "30min",
        pipelineMonitoring: ["enrollment_inquiries", "follow_ups", "appointments"]
      },
      emailConfig: {
        checkInbox: true,
        autoRespond: false,
        escalateUnknownSenders: true
      },
      calendarConfig: {
        reminderWindow: "24h",
        prepReminders: true
      },
      humanContact: {
        name: process.env.HUMAN_CONTACT_NAME || "Kimberly Flowers",
        method: "email",
        address: process.env.HUMAN_CONTACT_EMAIL || "kimberly@bloomiestaffing.com"
      },
      autonomySettings: {
        currentLevel: 1,
        graduationCriteria: {
          cyclesRequired: 100,
          successRateThreshold: 0.95,
          appropriateEscalationRate: 0.8
        }
      }
    };

    await pool.query(`
      INSERT INTO agents (id, name, role, client, autonomy_level, standing_instructions, config, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      'bloomie-sarah-rodriguez',
      'Sarah Rodriguez',
      'Content & Digital Marketing Executive',
      'BLOOM Ecosystem',
      1,
      standingInstructions,
      JSON.stringify(config)
    ]);

    // Create initial trust metrics
    await pool.query(`
      INSERT INTO trust_metrics (agent_id, period_start, period_end, calculated_at)
      VALUES ($1, NOW() - INTERVAL '1 day', NOW(), NOW())
    `, ['bloomie-sarah-rodriguez']);

    logger.info('✅ Sarah Rodriguez agent profile created');
  } else {
    // Update existing agent profile to ensure correct identity
    await pool.query(`
      UPDATE agents SET
        role = 'Content & Digital Marketing Executive',
        client = 'BLOOM Ecosystem'
      WHERE id = 'bloomie-sarah-rodriguez'
    `);
    logger.info('✅ Sarah Rodriguez agent profile updated with correct identity');
  }
}