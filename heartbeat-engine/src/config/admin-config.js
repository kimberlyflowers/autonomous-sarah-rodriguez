// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Admin Config Loader
// Reads org-level and global settings from Supabase
// Caches for 60 seconds to avoid hitting DB on every chat message
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('admin-config');

let _supabase = null;
function getSupabase() {
  if (!_supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return _supabase;
}

// ── Cache ─────────────────────────────────────────────────────────────────
const cache = {
  global: null,
  globalExpiry: 0,
  orgs: new Map(), // orgId → { config, expiry }
};

const CACHE_TTL = 60 * 1000; // 60 seconds

// ── Global Settings ───────────────────────────────────────────────────────
export async function getGlobalSettings() {
  const now = Date.now();
  if (cache.global && now < cache.globalExpiry) {
    return cache.global;
  }

  const sb = getSupabase();
  if (!sb) {
    logger.warn('No Supabase connection — using fallback defaults');
    return getHardcodedDefaults();
  }

  try {
    const { data, error } = await sb.from('bloom_admin_settings').select('*').single();
    if (error) throw error;
    cache.global = data;
    cache.globalExpiry = now + CACHE_TTL;
    return data;
  } catch (e) {
    logger.error('Failed to fetch global settings', { error: e.message });
    return cache.global || getHardcodedDefaults();
  }
}

// ── Org Config ────────────────────────────────────────────────────────────
export async function getOrgConfig(organizationId) {
  if (!organizationId) return null;

  const now = Date.now();
  const cached = cache.orgs.get(organizationId);
  if (cached && now < cached.expiry) {
    return cached.config;
  }

  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('org_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();
    if (error) throw error;
    cache.orgs.set(organizationId, { config: data, expiry: now + CACHE_TTL });
    return data;
  } catch (e) {
    logger.warn('Failed to fetch org config', { orgId: organizationId, error: e.message });
    return cached?.config || null;
  }
}

// ── Resolved Config (merges global + org) ─────────────────────────────────
export async function getResolvedConfig(organizationId) {
  const global = await getGlobalSettings();
  const org = await getOrgConfig(organizationId);

  // Model resolution: org override > tier default > global default
  let model = global.default_model;
  let tier = 'bloom';
  let reason = 'global default';

  if (org) {
    tier = org.model_tier || 'bloom';

    if (org.model_override) {
      model = org.model_override;
      reason = `org override: ${model}`;
    } else {
      // Tier-based model assignment
      const tierModels = {
        bloom: global.default_model,
        premium: global.default_client_model,
        standard: global.default_client_model_after_trial,
        budget: 'gpt-4o-mini',
      };
      model = tierModels[tier] || global.default_model;
      reason = `tier "${tier}"`;

      // Check time-based downgrade (premium → standard after trial)
      if (tier === 'premium' && org.tier_start_date && global.client_trial_days) {
        const start = new Date(org.tier_start_date);
        const daysSince = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
        if (daysSince > global.client_trial_days) {
          model = global.default_client_model_after_trial;
          tier = 'standard';
          reason = `auto-downgrade: ${daysSince} days past ${global.client_trial_days}-day trial`;
        }
      }
    }
  }

  // Feature flags: merge global defaults with org overrides
  const features = { ...(global.global_feature_flags || {}), ...(org?.feature_flags || {}) };
  const skills = { ...(global.global_skill_config || {}), ...(org?.skill_config || {}) };
  const failoverChain = global.failover_chain || [];

  return {
    model,
    tier,
    reason,
    features,
    skills,
    failoverChain,
    orgId: organizationId,
    supportAccess: org?.support_access_granted || false,
  };
}

// ── Feature Check (fast) ──────────────────────────────────────────────────
export async function isFeatureEnabled(organizationId, featureName) {
  const config = await getResolvedConfig(organizationId);
  return config.features[featureName] !== false; // default to enabled
}

// ── Skill Check (fast) ───────────────────────────────────────────────────
export async function isSkillEnabled(organizationId, skillName) {
  const config = await getResolvedConfig(organizationId);
  return config.skills[skillName] !== false; // default to enabled
}

// ── Cache Invalidation ───────────────────────────────────────────────────
export function invalidateCache(organizationId = null) {
  if (organizationId) {
    cache.orgs.delete(organizationId);
  } else {
    cache.global = null;
    cache.globalExpiry = 0;
    cache.orgs.clear();
  }
  logger.info('Admin config cache invalidated', { orgId: organizationId || 'all' });
}

// ── Hardcoded fallback (no DB) ───────────────────────────────────────────
function getHardcodedDefaults() {
  return {
    default_model: 'claude-sonnet-4-6',
    default_client_model: 'gpt-4o',
    default_client_model_after_trial: 'gemini-2.5-flash',
    client_trial_days: 30,
    failover_chain: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'gpt-4o', 'gpt-4o-mini', 'gemini-2.5-flash'],
    global_feature_flags: {
      image_generation: true, web_search: true, blog_posting: true,
      email_templates: true, sms_sending: true, calendar_booking: true,
      pipeline_management: true, voice_calls: false, browser_automation: true, file_creation: true,
    },
    global_skill_config: {
      blog_writer: true, email_designer: true, social_media: true,
      website_builder: true, image_creator: true, seo_optimizer: true,
      crm_manager: true, report_generator: true,
    },
  };
}
