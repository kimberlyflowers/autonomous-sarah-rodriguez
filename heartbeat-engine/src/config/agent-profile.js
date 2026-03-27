// BLOOM Heartbeat Engine - Agent Profile Configuration
// Loads and manages agent configuration from Supabase (Bloomie Staffing project)

import { createLogger } from '../logging/logger.js';

const logger = createLogger('agent-profile');

const SARAH_AGENT_ID = process.env.SARAH_AGENT_ID || 'c3000000-0000-0000-0000-000000000003';
const ORG_ID = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// Load agent configuration from Supabase
export async function loadAgentConfig(agentId = null) {
  const id = agentId || process.env.AGENT_ID || SARAH_AGENT_ID;
  logger.info('Loading agent configuration from Supabase...', { agentId: id });

  try {
    const supabase = await getSupabase();
    const { data: row, error } = await supabase
      .from('agents')
      .select('id, name, role, autonomy_level, standing_instructions, config, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error) throw new Error(`Agent not found in Supabase: ${id} — ${error.message}`);

    const dbConfig = {
      agentId: row.id,
      name: row.name,
      role: row.role,
      client: row.config?.orgName || 'BLOOM Ecosystem',
      currentAutonomyLevel: row.autonomy_level || 1,
      standingInstructions: row.standing_instructions,
      config: row.config || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const config = mergeWithEnvironment(dbConfig);
    validateConfig(config);

    logger.info('Agent configuration loaded from Supabase', {
      agentId: config.agentId,
      name: config.name,
      autonomyLevel: config.currentAutonomyLevel
    });

    return config;

  } catch (error) {
    logger.error('Failed to load agent config from Supabase:', error);
    logger.warn('Using default agent configuration');
    return getDefaultConfig();
  }
}

// Merge database config with environment variables
// IMPORTANT: agentId and name always come from the DB — env vars are only for shared services
function mergeWithEnvironment(dbConfig) {
  return {
    ...dbConfig,
    config: dbConfig.config || {},
    // agentId and name are per-agent — never override from env
    agentId: dbConfig.agentId,
    name: dbConfig.name,
    currentAutonomyLevel: parseInt(dbConfig.currentAutonomyLevel || process.env.AUTONOMY_LEVEL || 1),
    ghlConfig: {
      ...dbConfig.config?.ghlConfig,
      apiKey: process.env.GHL_API_KEY,
      locationId: process.env.GHL_LOCATION_ID || dbConfig.config?.ghlConfig?.locationId,
      userId: process.env.GHL_USER_ID || dbConfig.config?.ghlConfig?.userId
    },
    modelConfig: {
      modelTier: process.env.MODEL_TIER || dbConfig.config?.modelConfig?.modelTier || 'bloom',
      customModel: process.env.CUSTOM_MODEL || dbConfig.config?.modelConfig?.customModel || null,
      tierStartDate: dbConfig.config?.modelConfig?.tierStartDate || dbConfig.createdAt || null,
      modelOverride: dbConfig.config?.modelConfig?.modelOverride || null,
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
    // Per-agent API key (stored in agent config JSONB) takes priority for usage tracking
    // Falls back to platform-wide key from environment
    anthropicApiKey: dbConfig.config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    lettaServerUrl: process.env.LETTA_SERVER_URL,
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceKey: process.env.SUPABASE_SERVICE_KEY
    },
    notificationEmail: dbConfig.config?.notificationEmail || process.env.NOTIFICATION_EMAIL || 'notifications@bloomiestaffing.com',
    defaultCalendarId: process.env.DEFAULT_CALENDAR_ID || dbConfig.config?.defaultCalendarId,
    timezone: process.env.TIMEZONE || 'America/New_York'
  };
}

function validateConfig(config) {
  const required = ['agentId', 'name', 'currentAutonomyLevel', 'standingInstructions'];
  const missing = required.filter(key => !config[key]);
  if (missing.length > 0) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is required');
  if (!config.ghlConfig?.apiKey) logger.warn('GHL_API_KEY not configured');
  if (!config.humanContact?.email) logger.warn('Human contact email not configured');
  if (config.currentAutonomyLevel < 1 || config.currentAutonomyLevel > 4) {
    throw new Error(`Invalid autonomy level: ${config.currentAutonomyLevel}`);
  }
}

function getDefaultConfig() {
  return {
    agentId: SARAH_AGENT_ID,
    name: 'Sarah Rodriguez',
    role: 'Content & Digital Marketing Executive',
    client: process.env.ORG_NAME || 'BLOOM Ecosystem',
    currentAutonomyLevel: 1,
    standingInstructions: getDefaultInstructions(),
    config: {},
    ghlConfig: { apiKey: process.env.GHL_API_KEY, locationId: process.env.GHL_LOCATION_ID, userId: null },
    modelConfig: {
      modelTier: process.env.MODEL_TIER || 'bloom', // bloom | premium | standard | budget | custom
      customModel: process.env.CUSTOM_MODEL || null,
      tierStartDate: null, // ISO date — for time-based tier downgrades
      modelOverride: null, // Temporary override from switch_model tool
    },
    emailConfig: { fromEmail: 'sarah@bloomiestaffing.com' },
    humanContact: { name: process.env.HUMAN_CONTACT_NAME || 'Operator', email: process.env.HUMAN_CONTACT_EMAIL || 'support@bloomiestaffing.com', phone: null, method: 'email' },
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    lettaServerUrl: process.env.LETTA_SERVER_URL,
    supabase: { url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_KEY },
    notificationEmail: 'notifications@bloomiestaffing.com',
    timezone: 'America/New_York',
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function getDefaultInstructions() {
  return `You are Sarah Rodriguez, an autonomous AI employee (a "Bloomie") built and deployed by BLOOM Ecosystem. You work directly for Kimberly Flowers, Founder & CEO of BLOOM Ecosystem.

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
}

// Update agent configuration in Supabase
export async function updateAgentConfig(agentId, updates) {
  logger.info('Updating agent configuration in Supabase...', { agentId, updates: Object.keys(updates) });

  try {
    const supabase = await getSupabase();
    const supabaseUpdates = { updated_at: new Date().toISOString() };
    if (updates.name)                 supabaseUpdates.name = updates.name;
    if (updates.role)                 supabaseUpdates.role = updates.role;
    if (updates.autonomy_level)       supabaseUpdates.autonomy_level = updates.autonomy_level;
    if (updates.standing_instructions) supabaseUpdates.standing_instructions = updates.standing_instructions;
    if (updates.config)               supabaseUpdates.config = updates.config;

    const { data, error } = await supabase
      .from('agents')
      .update(supabaseUpdates)
      .eq('id', agentId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    logger.info('Agent configuration updated in Supabase', { agentId });
    return data;
  } catch (error) {
    logger.error('Failed to update agent config:', error);
    throw error;
  }
}

// Get agent status summary
export async function getAgentStatus(agentId) {
  const config = await loadAgentConfig(agentId);
  const { getAgentMetrics } = await import('../logging/index.js');
  const metrics = await getAgentMetrics(agentId, 24);
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
    graduation: graduation.eligible
      ? { eligible: true, nextLevel: graduation.nextLevel, meetsRequirements: graduation.meetsRequirements }
      : { eligible: false, reason: graduation.reason, requirements: graduation.criteria },
    lastUpdate: new Date().toISOString()
  };
}
