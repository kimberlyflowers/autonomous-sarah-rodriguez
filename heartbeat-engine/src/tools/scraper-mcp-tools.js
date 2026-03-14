// ─────────────────────────────────────────────────────────────────────────────
// Bloomie Scraper MCP Tools — Bridge Module
// Routes scraper_* tool calls from the chat system to the MCP scraper functions.
// Server-side HTTP scraping (no browser needed for most sources).
// Paid APIs (Outscraper, Apollo, PhantomBuster) gated by plan tier.
// ─────────────────────────────────────────────────────────────────────────────

import { createLogger } from '../logging/logger.js';

const logger = createLogger('scraper-mcp-tools');

// ── Plan tier access control ────────────────────────────────────────────────

const TIER_ACCESS = {
  free: [
    'scraper_check_access',
    'scraper_scrape_url',
    'scraper_search_businesses',
    'scraper_search_facebook_groups',
  ],
  lead_booster: [
    'scraper_check_access',
    'scraper_scrape_url',
    'scraper_search_businesses',
    'scraper_search_facebook_groups',
    'scraper_search_google_maps',
    'scraper_search_apollo',
  ],
  lead_pro: [
    'scraper_check_access',
    'scraper_scrape_url',
    'scraper_search_businesses',
    'scraper_search_facebook_groups',
    'scraper_search_google_maps',
    'scraper_search_apollo',
    'scraper_search_linkedin',
  ],
};

const UPSELL = {
  scraper_search_google_maps: {
    plan: 'Lead Booster',
    price: '$29/month',
    pitch: 'Google Maps has the most comprehensive local business database — verified phone numbers, addresses, ratings, reviews, hours, and websites. Way more data than free directories.',
  },
  scraper_search_apollo: {
    plan: 'Lead Booster',
    price: '$29/month',
    pitch: 'Apollo.io gives you verified business emails and direct phone numbers for 210M+ contacts. Not guesses — actually confirmed deliverable emails and real numbers.',
  },
  scraper_search_linkedin: {
    plan: 'Lead Pro',
    price: '$99/month',
    pitch: 'LinkedIn search pulls up to 75 data points per person — name, title, company, experience, education, and email. The gold standard for B2B prospecting.',
  },
};

function checkTierAccess(toolName, planTier = 'free') {
  const tier = planTier || 'free';
  const allowed = TIER_ACCESS[tier] || TIER_ACCESS.free;
  if (allowed.includes(toolName)) return { allowed: true };

  const upsell = UPSELL[toolName];
  return {
    allowed: false,
    message: upsell
      ? `🔒 **${toolName.replace('scraper_search_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}** requires the **${upsell.plan}** add-on (${upsell.price}).\n\n${upsell.pitch}\n\nI already pulled what I could from free sources. You can upgrade anytime at bloomiestaffing.com/upgrade.`
      : `🔒 This feature requires an upgraded plan. Visit bloomiestaffing.com/upgrade.`,
  };
}

// ── Plan summary for check_access ──────────────────────────────────────────

function getPlanSummary(planTier = 'free') {
  const tiers = [
    { name: 'Free', tier: 'free', price: 'Included', tools: [
      'Universal URL scraper — extract data from any webpage',
      'Yellowpages & Yelp business search',
      'Facebook Groups member extraction',
    ]},
    { name: 'Lead Booster', tier: 'lead_booster', price: '$29/month', tools: [
      'Everything in Free, plus:',
      'Google Maps business search (verified data, reviews, hours)',
      'Apollo.io contact search (verified emails & phone numbers for 210M+ contacts)',
    ]},
    { name: 'Lead Pro', tier: 'lead_pro', price: '$99/month', tools: [
      'Everything in Lead Booster, plus:',
      'LinkedIn profile search (75 data points per person, email discovery)',
      'Priority scraping with higher rate limits',
    ]},
  ];

  const lines = [`## Your Current Plan: **${tiers.find(t => t.tier === planTier)?.name || 'Free'}**\n`];
  for (const t of tiers) {
    const isCurrent = t.tier === planTier;
    lines.push(`### ${t.name} (${t.price})${isCurrent ? ' ← You are here' : ''}`);
    t.tools.forEach(tool => lines.push(`• ${tool}`));
    lines.push('');
  }
  lines.push('Upgrade anytime at **bloomiestaffing.com/upgrade**.');
  return lines.join('\n');
}

// ── Lazy imports of the compiled MCP scraper functions ─────────────────────
// These import from the built dist/ of the MCP server

async function loadScraperModule(moduleName) {
  // Path from src/tools/ → ../../bloomie-scraper-mcp-server/dist/tools/
  const modUrl = new URL(`../../bloomie-scraper-mcp-server/dist/tools/${moduleName}.js`, import.meta.url);
  return await import(modUrl.href);
}

// ── Main executor ──────────────────────────────────────────────────────────

export async function executeScraperMCPTool(toolName, toolInput) {
  const startTime = Date.now();
  const planTier = toolInput.plan_tier || 'free';

  logger.info(`Executing scraper tool: ${toolName}`, { planTier, org: toolInput.org_id });

  try {
    // ── Check access first ──
    if (toolName !== 'scraper_check_access') {
      const access = checkTierAccess(toolName, planTier);
      if (!access.allowed) {
        logger.info(`Access denied for ${toolName} on ${planTier} tier — returning upsell`);
        return { success: false, upsell: true, message: access.message };
      }
    }

    // ── Route to the appropriate tool ──
    let result;

    switch (toolName) {
      case 'scraper_check_access': {
        const summary = getPlanSummary(planTier);
        return { success: true, message: summary };
      }

      case 'scraper_scrape_url': {
        const { scrapeUrl } = await loadScraperModule('scrape-url');
        result = await scrapeUrl({
          url: toolInput.url,
          columns: toolInput.columns,
          org_id: toolInput.org_id,
          plan_tier: planTier,
          limit: toolInput.limit || 30,
          offset: toolInput.offset || 0,
          response_format: 'markdown',
        });
        break;
      }

      case 'scraper_search_businesses': {
        const { searchBusinesses } = await loadScraperModule('search-businesses');
        result = await searchBusinesses({
          query: toolInput.query,
          location: toolInput.location,
          source: toolInput.source || 'both',
          org_id: toolInput.org_id,
          plan_tier: planTier,
          limit: toolInput.limit || 30,
          offset: toolInput.offset || 0,
          response_format: 'markdown',
        });
        break;
      }

      case 'scraper_search_facebook_groups': {
        const { searchFacebookGroups } = await loadScraperModule('search-facebook-groups');
        result = await searchFacebookGroups({
          query: toolInput.query,
          group_url: toolInput.group_url,
          org_id: toolInput.org_id,
          plan_tier: planTier,
          limit: toolInput.limit || 30,
          offset: toolInput.offset || 0,
          response_format: 'markdown',
        });
        break;
      }

      case 'scraper_search_google_maps': {
        const { searchGoogleMaps } = await loadScraperModule('search-google-maps');
        result = await searchGoogleMaps({
          query: toolInput.query,
          location: toolInput.location,
          org_id: toolInput.org_id,
          plan_tier: planTier,
          limit: toolInput.limit || 30,
          offset: toolInput.offset || 0,
          response_format: 'markdown',
        });
        break;
      }

      case 'scraper_search_apollo': {
        const { searchApollo } = await loadScraperModule('search-apollo');
        result = await searchApollo({
          query: toolInput.query,
          location: toolInput.location,
          job_title: toolInput.job_title,
          industry: toolInput.industry,
          company_size: toolInput.company_size,
          org_id: toolInput.org_id,
          plan_tier: planTier,
          limit: toolInput.limit || 30,
          offset: toolInput.offset || 0,
          response_format: 'markdown',
        });
        break;
      }

      case 'scraper_search_linkedin': {
        const { searchLinkedIn } = await loadScraperModule('search-linkedin');
        result = await searchLinkedIn({
          query: toolInput.query,
          location: toolInput.location,
          job_title: toolInput.job_title,
          company: toolInput.company,
          org_id: toolInput.org_id,
          plan_tier: planTier,
          limit: toolInput.limit || 30,
          offset: toolInput.offset || 0,
          response_format: 'markdown',
        });
        break;
      }

      default:
        return { success: false, error: `Unknown scraper tool: ${toolName}` };
    }

    const duration = Date.now() - startTime;
    logger.info(`Scraper tool done: ${toolName} (${duration}ms)`, {
      resultCount: result?.count || result?.results?.length || 0,
      errors: result?.errors?.length || 0,
    });

    // Format result for the chat system
    return {
      success: result.errors?.length === 0 || result.results?.length > 0,
      total: result.total || 0,
      count: result.count || 0,
      source: result.source || toolName,
      results: result.results || [],
      errors: result.errors || [],
      warnings: result.warnings || [],
      has_more: result.has_more || false,
      next_offset: result.next_offset,
      message: formatResultMessage(result, toolName),
      executionTime: duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Scraper tool failed: ${toolName} (${duration}ms)`, { error: error.message });
    return {
      success: false,
      error: error.message,
      message: `❌ Scraper tool failed: ${error.message}. Try a different source or search term.`,
      executionTime: duration,
    };
  }
}

// ── Format results into a human-readable message for the Bloomie ──────────

function formatResultMessage(result, toolName) {
  const lines = [];

  if (result.results?.length > 0) {
    lines.push(`Found **${result.total}** results from ${result.source || toolName}:`);
    lines.push('');

    for (let i = 0; i < Math.min(result.results.length, 30); i++) {
      const r = result.results[i];
      const name = r.name || r.Business_Name || 'Result';
      const details = [];
      if (r.phone) details.push(`📞 ${r.phone}`);
      if (r.email) details.push(`✉️ ${r.email}`);
      if (r.address) details.push(`📍 ${r.address}`);
      if (r.city) details.push(r.city);
      if (r.category) details.push(r.category);
      if (r.title) details.push(r.title);
      if (r.company) details.push(r.company);
      if (r.website) details.push(`🌐 ${r.website}`);
      if (r.rating) details.push(`⭐ ${r.rating}`);

      lines.push(`**${i + 1}. ${name}**${details.length ? ' — ' + details.join(' | ') : ''}`);
    }
  }

  if (result.errors?.length > 0) {
    lines.push('');
    lines.push('**Issues:**');
    result.errors.forEach(e => lines.push(`⚠️ ${e}`));
  }

  if (result.warnings?.length > 0) {
    lines.push('');
    result.warnings.forEach(w => lines.push(w));
  }

  if (result.has_more) {
    lines.push('');
    lines.push(`_Showing ${result.count} of ${result.total}. More results available._`);
  }

  return lines.join('\n') || 'No results found.';
}

export default { executeScraperMCPTool };
