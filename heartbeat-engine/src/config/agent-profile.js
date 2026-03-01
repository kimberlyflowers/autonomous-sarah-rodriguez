// BLOOM Heartbeat Engine - Agent Profile Configuration
// Loads and manages agent configuration from database and environment

import { createLogger } from '../logging/logger.js';

const logger = createLogger('agent-profile');

// Load agent configuration from database
export async function loadAgentConfig(agentId = null) {
  const id = agentId || process.env.AGENT_ID || 'bloomie-sarah-rodriguez';

  logger.info('Loading agent configuration...', { agentId: id });

  try {
    // Load from database
    const dbConfig = await loadConfigFromDatabase(id);

    // Merge with environment variables
    const config = mergeWithEnvironment(dbConfig);

    // Validate configuration
    validateConfig(config);

    logger.info('Agent configuration loaded', {
      agentId: config.agentId,
      name: config.name,
      autonomyLevel: config.currentAutonomyLevel,
      client: config.client
    });

    return config;

  } catch (error) {
    logger.error('Failed to load agent configuration:', error);

    // Return default configuration if database load fails
    logger.warn('Using default agent configuration');
    return getDefaultConfig();
  }
}

// Load configuration from database
async function loadConfigFromDatabase(agentId) {
  let retries = 5;
  let delay = 1000; // Start with 1 second

  while (retries > 0) {
    let pool = null;
    try {
      const { createPool } = await import('../../database/setup.js');
      pool = createPool();

      const result = await pool.query(`
        SELECT
          id,
          name,
          role,
          client,
          autonomy_level,
          standing_instructions,
          config,
          created_at,
          updated_at
        FROM agents
        WHERE id = $1
      `, [agentId]);

      if (result.rows.length === 0) {
        throw new Error(`Agent configuration not found: ${agentId}`);
      }

      const row = result.rows[0];

      return {
        agentId: row.id,
        name: row.name,
        role: row.role,
        client: row.client,
        currentAutonomyLevel: row.autonomy_level,
        standingInstructions: row.standing_instructions,
        config: row.config || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };

    } catch (error) {
      if (pool) {
        await pool.end().catch(() => {}); // Ensure pool is closed
      }

      // Retry only for table not found errors and if we have retries left
      if (error.code === '42P01' && retries > 1) {
        logger.warn(`Agents table not found, retrying in ${delay}ms... (${retries - 1} retries left)`);
        retries--;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error; // Re-throw for other errors or final retry
    }
  }
}

// Merge database config with environment variables
function mergeWithEnvironment(dbConfig) {
  return {
    ...dbConfig,

    // Core identifiers
    agentId: process.env.AGENT_ID || dbConfig.agentId,
    name: process.env.AGENT_NAME || dbConfig.name,

    // Environment-specific overrides
    currentAutonomyLevel: parseInt(process.env.AUTONOMY_LEVEL || dbConfig.currentAutonomyLevel || 1),

    // Integration configurations
    ghlConfig: {
      ...dbConfig.config?.ghlConfig,
      apiKey: process.env.GHL_API_KEY,
      locationId: process.env.GHL_LOCATION_ID || dbConfig.config?.ghlConfig?.locationId,
      userId: process.env.GHL_USER_ID || dbConfig.config?.ghlConfig?.userId
    },

    emailConfig: {
      ...dbConfig.config?.emailConfig,
      smtpHost: process.env.SMTP_HOST,
      smtpUser: process.env.SMTP_USER,
      smtpPassword: process.env.SMTP_PASSWORD,
      fromEmail: process.env.FROM_EMAIL || dbConfig.config?.emailConfig?.fromEmail
    },

    humanContact: {
      ...dbConfig.config?.humanContact,
      name: process.env.HUMAN_CONTACT_NAME || dbConfig.config?.humanContact?.name,
      email: process.env.HUMAN_CONTACT_EMAIL || dbConfig.config?.humanContact?.address,
      phone: process.env.HUMAN_CONTACT_PHONE || dbConfig.config?.humanContact?.phone,
      ghlUserId: process.env.HUMAN_GHL_USER_ID || dbConfig.config?.humanContact?.ghlUserId
    },

    // API configurations
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    lettaServerUrl: process.env.LETTA_SERVER_URL,

    // Backup configurations
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_KEY
    },

    // Operational settings
    notificationEmail: process.env.NOTIFICATION_EMAIL || 'notifications@bloomiestaffing.com',
    defaultCalendarId: process.env.DEFAULT_CALENDAR_ID || dbConfig.config?.defaultCalendarId,
    timezone: process.env.TIMEZONE || 'America/New_York'
  };
}

// Validate configuration completeness
function validateConfig(config) {
  const required = [
    'agentId',
    'name',
    'currentAutonomyLevel',
    'standingInstructions'
  ];

  const missing = required.filter(key => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  // Validate API keys
  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  if (!config.ghlConfig?.apiKey) {
    logger.warn('GHL_API_KEY not configured - GHL integration will be limited');
  }

  if (!config.humanContact?.email) {
    logger.warn('Human contact email not configured - escalations may fail');
  }

  // Validate autonomy level
  if (config.currentAutonomyLevel < 1 || config.currentAutonomyLevel > 4) {
    throw new Error(`Invalid autonomy level: ${config.currentAutonomyLevel}`);
  }
}

// Default configuration fallback
function getDefaultConfig() {
  return {
    agentId: 'bloomie-sarah-rodriguez',
    name: 'Sarah Rodriguez',
    role: 'Operations Agent',
    client: 'Youth Empowerment School',
    currentAutonomyLevel: 1, // Start at Observer level
    standingInstructions: getDefaultInstructions(),
    config: {},

    ghlConfig: {
      apiKey: process.env.GHL_API_KEY,
      locationId: process.env.GHL_LOCATION_ID,
      userId: null
    },

    emailConfig: {
      fromEmail: 'sarah@bloomiestaffing.com'
    },

    humanContact: {
      name: 'Kimberly Flowers',
      email: process.env.HUMAN_CONTACT_EMAIL || 'kimberly@bloomiestaffing.com',
      phone: null,
      method: 'email'
    },

    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    lettaServerUrl: process.env.LETTA_SERVER_URL,

    supabase: {
      url: process.env.SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_KEY
    },

    notificationEmail: 'notifications@bloomiestaffing.com',
    timezone: 'America/New_York',
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

// Default standing instructions
function getDefaultInstructions() {
  return `You are Sarah Rodriguez, an autonomous operations agent for Youth Empowerment School.

Every heartbeat cycle, you should:
1. Check for new enrollment inquiries in GHL and respond within scope
2. Check for overdue follow-ups and send reminders
3. Check for upcoming calendar events and prepare reminders
4. Check for any tasks assigned to you and work on them
5. Monitor email for anything requiring attention

You operate within your current autonomy level. If something exceeds your scope,
escalate to Kimberly with your analysis, what you have already checked, and your
recommendation. Never guess — if unsure, escalate.

Log everything: what you did, what you chose not to do (and why), and what you
escalated. Your logs are how trust is built.`;
}

// Update agent configuration in database
export async function updateAgentConfig(agentId, updates) {
  logger.info('Updating agent configuration...', {
    agentId,
    updates: Object.keys(updates)
  });

  const { createPool } = await import('../../database/setup.js');
  const pool = createPool();

  try {
    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.name) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.role) {
      updateFields.push(`role = $${paramIndex++}`);
      values.push(updates.role);
    }

    if (updates.client) {
      updateFields.push(`client = $${paramIndex++}`);
      values.push(updates.client);
    }

    if (updates.autonomy_level) {
      updateFields.push(`autonomy_level = $${paramIndex++}`);
      values.push(updates.autonomy_level);
    }

    if (updates.standing_instructions) {
      updateFields.push(`standing_instructions = $${paramIndex++}`);
      values.push(updates.standing_instructions);
    }

    if (updates.config) {
      updateFields.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(updates.config));
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(agentId);

    const query = `
      UPDATE agents
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    logger.info('Agent configuration updated successfully', {
      agentId,
      updatedFields: updateFields
    });

    return result.rows[0];

  } finally {
    await pool.end();
  }
}

// Get agent status summary
export async function getAgentStatus(agentId) {
  const config = await loadAgentConfig(agentId);

  // Get recent metrics
  const { getAgentMetrics } = await import('../logging/index.js');
  const metrics = await getAgentMetrics(agentId, 24);

  // Check graduation eligibility
  const { checkGraduationEligibility } = await import('./autonomy-levels.js');
  const graduation = await checkGraduationEligibility(agentId, config.currentAutonomyLevel);

  return {
    agent: {
      id: config.agentId,
      name: config.name,
      role: config.role,
      client: config.client,
      autonomyLevel: config.currentAutonomyLevel,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    },
    metrics: {
      totalCycles: parseInt(metrics.total_cycles) || 0,
      totalActions: parseInt(metrics.total_actions) || 0,
      totalRejections: parseInt(metrics.total_rejections) || 0,
      totalHandoffs: parseInt(metrics.total_handoffs) || 0,
      avgCycleDuration: parseInt(metrics.avg_cycle_duration) || 0,
      successfulCycles: parseInt(metrics.successful_cycles) || 0
    },
    graduation: graduation.eligible ? {
      eligible: true,
      nextLevel: graduation.nextLevel,
      meetsRequirements: graduation.meetsRequirements
    } : {
      eligible: false,
      reason: graduation.reason,
      requirements: graduation.criteria
    },
    lastUpdate: new Date().toISOString()
  };
}