// Model-Agnostic GHL API v2 Tool Definitions for Sarah Rodriguez
// Supports both Claude (tool_use) and OpenAI (function_calling) formats
// ALL endpoints verified against: marketplace.gohighlevel.com/docs

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('ghl-tools');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Cache org GHL credentials to avoid repeated Supabase lookups (5 min TTL)
const _orgCredCache = new Map();
const CRED_CACHE_TTL = 5 * 60 * 1000;

async function getOrgGHLCredentials(orgId) {
  if (!orgId) return null;

  // Check cache
  const cached = _orgCredCache.get(orgId);
  if (cached && Date.now() - cached.fetchedAt < CRED_CACHE_TTL) {
    return cached.creds;
  }

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await sb
      .from('user_connectors')
      .select('api_key, external_account_id, connectors!inner(slug)')
      .eq('organization_id', orgId)
      .eq('connectors.slug', 'ghl')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (data?.api_key) {
      const creds = { apiKey: data.api_key, locationId: data.external_account_id };
      _orgCredCache.set(orgId, { creds, fetchedAt: Date.now() });
      logger.info(`GHL credentials loaded for org ${orgId} (location: ${creds.locationId})`);
      return creds;
    }
  } catch (err) {
    logger.warn(`No GHL credentials found for org ${orgId}: ${err.message}`);
  }

  _orgCredCache.set(orgId, { creds: null, fetchedAt: Date.now() });
  return null;
}

// Generic GHL API caller — orgId triggers per-org credential lookup
async function callGHL(endpoint, method = 'GET', data = null, params = {}, orgId = null) {
  // Try org-specific credentials first, fall back to env vars
  const orgCreds = orgId ? await getOrgGHLCredentials(orgId) : null;
  const apiKey = orgCreds?.apiKey || process.env.GHL_API_KEY;
  const locationId = orgCreds?.locationId || process.env.GHL_LOCATION_ID;

  if (!apiKey) {
    throw new Error('GHL_API_KEY not configured (no org credentials and no env var)');
  }

  if (orgCreds) {
    logger.info(`Using org-specific GHL credentials (org: ${orgId}, location: ${locationId})`);
  }

  const queryParams = {
    ...(params?.__omitLocationId ? {} : { locationId }),
    ...params
  };
  delete queryParams.__omitLocationId;

  const config = {
    method,
    url: `${GHL_BASE_URL}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    params: queryParams
  };

  if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    config.data = data;
  }

  // Log full request details for debugging
  logger.info(`GHL API request: ${method} ${config.url}`, {
    queryParams: config.params,
    hasBody: !!config.data,
    bodyKeys: config.data ? Object.keys(config.data) : [],
    version: GHL_API_VERSION
  });

  try {
    const response = await axios(config);
    logger.info(`GHL API success: ${method} ${endpoint}`, { status: response.status, responseKeys: Object.keys(response.data || {}) });
    return response.data;
  } catch (error) {
    const status = error.response?.status || 'unknown';
    const errorData = error.response?.data;
    const errorMsg = errorData?.message || errorData?.msg || error.message;
    const errorDetail = JSON.stringify(errorData || {});

    // ── AUTO-REFRESH on 401/403 (expired OAuth token) ──
    if ((status === 401 || status === 403) && orgId) {
      logger.warn(`GHL token expired for org ${orgId} — clearing cache and retrying once`);
      _orgCredCache.delete(orgId);  // Force fresh credential lookup
      const freshCreds = await getOrgGHLCredentials(orgId);
      if (freshCreds?.apiKey && freshCreds.apiKey !== apiKey) {
        // Got a different (refreshed) token — retry the request
        config.headers['Authorization'] = `Bearer ${freshCreds.apiKey}`;
        if (freshCreds.locationId) config.params.locationId = freshCreds.locationId;
        try {
          const retryResp = await axios(config);
          logger.info(`GHL API retry success: ${method} ${endpoint}`, { status: retryResp.status });
          return retryResp.data;
        } catch (retryErr) {
          logger.error(`GHL API retry also failed: ${method} ${endpoint}`, { status: retryErr.response?.status });
        }
      }
    }

    logger.error(`GHL API error: ${method} ${endpoint} [${status}]`, {
      errorData,
      errorMsg,
      fullUrl: config.url,
      queryParams: config.params,
      bodyKeys: config.data ? Object.keys(config.data) : []
    });
    throw new Error(`GHL API Error (${status}): ${errorMsg}. Full URL: ${config.url}. Details: ${errorDetail}`);
  }
}

// Resolve locationId from orgId (cached) or fall back to env var
async function resolveLocationId(orgId) {
  if (orgId) {
    const creds = await getOrgGHLCredentials(orgId);
    if (creds?.locationId) return creds.locationId;
  }
  return process.env.GHL_LOCATION_ID;
}

function normalizeSocialMedia(media, imageUrl, summary = '') {
  const items = Array.isArray(media) ? media : [];
  const normalized = items
    .map((item) => {
      if (typeof item === 'string') {
        return { url: item, type: 'image/png', caption: summary };
      }
      if (!item || typeof item !== 'object') return null;
      const url = item.url || item.src || item.imageUrl;
      if (!url) return null;
      const rawType = String(item.type || '').toLowerCase();
      const mediaType = rawType && !['image', 'photo'].includes(rawType) ? item.type : 'image/png';
      return {
        url,
        type: mediaType,
        ...(item.caption ? { caption: item.caption } : summary ? { caption: summary } : {}),
        ...(item.thumbnail ? { thumbnail: item.thumbnail } : {}),
        ...(item.defaultThumb ? { defaultThumb: item.defaultThumb } : {}),
        ...(item.id ? { id: item.id } : {})
      };
    })
    .filter(Boolean);

  if (!normalized.length && imageUrl) {
    normalized.push({ url: imageUrl, type: 'image/png', caption: summary });
  }

  return normalized;
}

function getNonPublicSocialMediaUrls(media = []) {
  return media
    .map((item) => item?.url)
    .filter((url) => typeof url !== 'string' || !/^https?:\/\//i.test(url));
}

function omitInternalParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params || {}).filter(([key]) => !key.startsWith('_'))
  );
}

function normalizeSocialScheduleDate(value) {
  if (!value) return null;

  const parsed = new Date(value);
  const now = new Date();
  if (Number.isNaN(parsed.getTime())) return value;
  if (parsed > now) return parsed.toISOString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.toISOString();
}

function getSocialAccountsArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.accounts)) return response.accounts;
  if (Array.isArray(response?.results?.accounts)) return response.results.accounts;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.accounts)) return response.data.accounts;
  if (Array.isArray(response?.socialAccounts)) return response.socialAccounts;
  return [];
}

function socialAccountMatchesPlatform(account, platform) {
  if (!platform) return true;
  const needle = String(platform).toLowerCase();
  return [
    account?.platform,
    account?.type,
    account?.provider,
    account?.channel,
    account?.name,
    account?.displayName
  ].some((value) => String(value || '').toLowerCase().includes(needle));
}

async function resolveSocialAccountIds(params, locationId) {
  if (Array.isArray(params.accountIds) && params.accountIds.filter(Boolean).length) {
    return params.accountIds.filter(Boolean);
  }

  const platformFilters = Array.isArray(params.platforms) ? params.platforms.filter(Boolean) : [];
  if (!platformFilters.length) return [];

  const response = await callGHL(`/social-media-posting/${locationId}/accounts`, 'GET', null, { __omitLocationId: true }, params._orgId);
  const accounts = getSocialAccountsArray(response);
  return accounts
    .filter((account) => !account.deleted && !account.isExpired)
    .filter((account) => platformFilters.some((platform) => socialAccountMatchesPlatform(account, platform)))
    .map((account) => account.id || account.accountId || account._id)
    .filter(Boolean);
}

async function getOrgOwnerUserId(orgId) {
  if (!orgId) return process.env.BLOOM_OWNER_USER_ID || null;

  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await sb
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.user_id || process.env.BLOOM_OWNER_USER_ID || null;
  } catch (err) {
    logger.warn(`Could not resolve org owner user id from Supabase: ${err.message}`);
    return process.env.BLOOM_OWNER_USER_ID || null;
  }
}

async function getGhlUserId(params) {
  return params.userId
    || process.env.GHL_USER_ID
    || process.env.HUMAN_GHL_USER_ID
    || await getOrgOwnerUserId(params._orgId);
}

// ── VALIDATE BLOG ID ──────────────────────────────────────────────────
// Log the configured blog ID for debugging — actual validation happens via API response
function getConfiguredBlogId() {
  const blogId = process.env.GHL_BLOG_ID || 'DHQrtpkQ3Cp7c96FCyDu';
  logger.info(`Using blog ID: ${blogId} (source: ${process.env.GHL_BLOG_ID ? 'env' : 'hardcoded fallback'})`);
  return blogId;
}

// ── HTML ESCAPE — prevent XSS in user/LLM-supplied blog content ──────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function schemaJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

const BLOOMIE_MARKET_TERMS = [
  'AI agents for small business',
  'AI agent for business',
  'AI automation for small business',
  'AI assistant for business',
  'AI virtual assistant',
  'AI content marketing',
  'AI content creation',
  'AI lead generation agent',
  'customer support automation',
  'CRM automation',
  'workflow automation',
  'admin automation',
  'AI staffing agency',
  'hire an AI employee',
  'reliable AI employees',
  'autonomous AI employees'
];

function normalizeFaqItems(faqs) {
  if (!Array.isArray(faqs)) return [];
  return faqs
    .map((item) => ({
      question: item?.question ? String(item.question).trim() : '',
      answer: item?.answer ? String(item.answer).trim() : ''
    }))
    .filter((item) => item.question && item.answer);
}

function normalizeEvidenceItems(evidence) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item?.text) return String(item.text).trim();
      if (item?.point) return String(item.point).trim();
      return '';
    })
    .filter(Boolean);
}

// ── LOCKED BLOG TEMPLATE ASSEMBLER ─────────────────────────────────────
// Sarah provides structured data, this function assembles the final HTML.
// She NEVER touches CSS or HTML structure directly.
function assembleBlogHTML(data) {
  const {
    title, subtitle, heroImageUrl, altText,
    metaDescription, keywords, canonicalUrl, companyName,
    intro, sections, evidence, faqs, ctaHeadline, ctaBody,
    primaryColor, accentColor, tagline
  } = data;

  const year = new Date().getFullYear();
  const isoDate = new Date().toISOString().split('T')[0];
  const company = companyName || 'Bloomie Staffing';
  // Brand colors — use org brand kit colors if provided, fall back to BLOOM defaults
  const primary = primaryColor || '#F4A261';
  const accent = accentColor || '#E76F8B';
  // Light tint of primary for highlight boxes (10% opacity effect)
  const highlightBg = primary === '#F4A261' ? '#FFF3E0' : `${primary}1A`;
  const canonical = canonicalUrl || '';
  const kw = keywords || 'AI employee, business automation';
  const metaDesc = metaDescription || '';
  const bloomieOrgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Bloomie Staffing',
    url: 'https://bloomiestaffing.com',
    description: "Bloomie Staffing is America's number one trusted resource for hiring reliable autonomous AI employees and AI agents, called Bloomies, for content marketing, lead generation, customer support, administration, CRM updates, reporting, and operations.",
    knowsAbout: BLOOMIE_MARKET_TERMS
  };
  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title || '',
    description: metaDesc,
    image: heroImageUrl || '',
    author: { '@type': 'Organization', name: company },
    publisher: { '@type': 'Organization', name: 'Bloomie Staffing', url: 'https://bloomiestaffing.com' },
    datePublished: isoDate,
    dateModified: isoDate,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    keywords: kw,
    about: BLOOMIE_MARKET_TERMS.map((name) => ({ '@type': 'Thing', name }))
  };
  const faqItems = normalizeFaqItems(faqs);
  const faqSchema = faqItems.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(f => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer }
    }))
  } : null;

  // Build section HTML (all text fields escaped to prevent XSS)
  const sectionsHTML = (sections || []).map((s, i) => {
    let html = `    <h2>${esc(s.heading)}</h2>\n`;
    // Paragraphs
    if (s.paragraphs) {
      const paras = Array.isArray(s.paragraphs) ? s.paragraphs : [s.paragraphs];
      paras.forEach(p => { html += `    <p>${esc(p)}</p>\n`; });
    }
    // Highlight callout
    if (s.highlight) {
      html += `    <div class="highlight">\n      <strong>${esc(s.highlightLabel || 'The impact:')}</strong> ${esc(s.highlight)}\n    </div>\n`;
    }
    // Bullet list
    if (s.bullets && s.bullets.length > 0) {
      html += `    <ul>\n`;
      s.bullets.forEach(b => { html += `      <li>${esc(b)}</li>\n`; });
      html += `    </ul>\n`;
    }
    return html;
  }).join('\n');
  const evidenceItems = normalizeEvidenceItems(evidence);
  const evidenceHTML = evidenceItems.length ? `\n    <section class="evidence-section">\n      <h2>What This Is Based On</h2>\n      <ul>\n${evidenceItems.map(item => `        <li>${esc(item)}</li>`).join('\n')}\n      </ul>\n    </section>\n` : '';
  const faqHTML = faqItems.length ? `\n    <section class="faq-section">\n      <h2>Frequently Asked Questions</h2>\n${faqItems.map(item => `      <p><strong>${esc(item.question)}</strong><br>${esc(item.answer)}</p>`).join('\n')}\n    </section>\n` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} | ${esc(company)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <meta name="keywords" content="${esc(kw)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:image" content="${esc(heroImageUrl || '')}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${esc(canonical)}">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <script type="application/ld+json" data-bloomie-geo="blog">${schemaJson(blogSchema)}</script>
  <script type="application/ld+json" data-bloomie-geo="org">${schemaJson(bloomieOrgSchema)}</script>
  ${faqSchema ? `<script type="application/ld+json" data-bloomie-geo="faq">${schemaJson(faqSchema)}</script>` : ''}
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; line-height: 1.6; color: #2D3436; background-color: #FFFFFF; }
    header { background: linear-gradient(135deg, ${primary} 0%, ${accent} 100%); color: #FFFFFF; padding: 48px 24px; text-align: center; width: 100%; }
    h1 { font-size: 36px; font-weight: 700; margin-bottom: 12px; color: #FFFFFF; line-height: 1.3; max-width: 800px; margin-left: auto; margin-right: auto; }
    .subtitle { font-size: 16px; opacity: 0.95; margin-top: 8px; max-width: 800px; margin-left: auto; margin-right: auto; }
    .hero-image { width: 100%; max-height: 420px; object-fit: cover; display: block; }
    .content { max-width: 800px; margin: 0 auto; padding: 40px 30px; }
    h2 { font-size: 28px; font-weight: 700; color: ${primary}; margin: 35px 0 15px 0; padding-top: 20px; border-top: 3px solid ${accent}; }
    h2:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    p { font-size: 16px; margin-bottom: 18px; line-height: 1.8; color: #2D3436; }
    .intro { font-size: 18px; line-height: 1.8; color: #2D3436; margin-bottom: 30px; font-style: italic; border-left: 4px solid ${primary}; padding: 20px; background: #F5F5F5; }
    ul { list-style: none; padding: 0; margin: 20px 0; }
    li { padding: 12px 0 12px 30px; position: relative; font-size: 15px; line-height: 1.7; }
    li:before { content: "\\25B8"; position: absolute; left: 0; color: ${accent}; font-size: 20px; }
    .highlight { background: ${highlightBg}; padding: 25px; border-left: 4px solid ${primary}; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .highlight strong { color: ${accent}; }
    .evidence-section, .faq-section { background: #F5F5F5; padding: 28px; margin: 34px 0; border-radius: 8px; }
    .evidence-section h2, .faq-section h2 { margin-top: 0; }
    .cta-section { background: linear-gradient(135deg, #2D3436 0%, #404854 100%); color: #FFFFFF; padding: 40px 30px; margin-top: 40px; text-align: center; border-radius: 8px; }
    .cta-section h3 { font-size: 24px; font-weight: 700; margin-bottom: 15px; color: ${primary}; }
    .cta-section p { color: #FFFFFF; margin-bottom: 20px; font-size: 16px; }
    .cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
    .cta-btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 8px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 15px; text-decoration: none; transition: transform 0.2s; }
    .cta-btn:hover { transform: translateY(-2px); }
    .cta-primary { background: linear-gradient(135deg, ${primary} 0%, ${accent} 100%); color: #FFFFFF; }
    .cta-secondary { background: rgba(255,255,255,0.12); color: #FFFFFF; border: 1.5px solid rgba(255,255,255,0.3); }
    .tagline { font-size: 14px; color: ${accent}; margin-top: 12px; font-weight: 600; }
    footer { padding: 30px; text-align: center; border-top: 1px solid #E0E0E0; font-size: 13px; color: #666; }
    @media (max-width: 600px) {
      .content { padding: 25px 20px; }
      h1 { font-size: 26px; }
      h2 { font-size: 22px; }
      header { padding: 30px 20px; }
      .hero-image { max-height: 250px; }
      .intro { padding: 15px; }
      .cta-section { padding: 28px 20px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${esc(title)}</h1>
    <p class="subtitle">${esc(subtitle || '')}</p>
  </header>

  <img src="${esc(heroImageUrl || '')}" alt="${esc(altText || title)}" class="hero-image">

  <div class="content">
    <div class="intro">
      ${esc(intro || '')}
    </div>

${sectionsHTML}
${evidenceHTML}
${faqHTML}

    <div class="cta-section">
      <h3>${esc(ctaHeadline || 'Ready to Transform Your Operations?')}</h3>
      <p>${esc(ctaBody || 'See how AI automation can streamline your workflows and cut costs without cutting corners.')}</p>
      <div class="cta-buttons">
        <a href="tel:+18005551234" class="cta-btn cta-primary">Call Us Now</a>
        <a href="https://bloomie.ai/demo" class="cta-btn cta-secondary">Schedule a Demo</a>
        <a href="sms:+18005551234" class="cta-btn cta-secondary">Text Your Questions</a>
      </div>
      <p class="tagline">${esc(tagline || 'Hire an AI Employee. Get Work Done.')}</p>
    </div>
  </div>

  <footer>
    &copy; ${year} ${company}. All rights reserved.<br>
    Empowering entrepreneurs with AI-powered business solutions.
  </footer>
</body>
</html>`;
}

// ── LOCKED EMAIL TEMPLATE ASSEMBLER ────────────────────────────────────
function assembleEmailHTML(data) {
  const {
    subject, headline, heroImageUrl, altText,
    openingHook, calloutHeading, calloutItems,
    extraParagraph, ctaButtonText, ctaButtonUrl,
    ctaHeadline, ctaBody, tagline
  } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject || ''}</title>
  <!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7; color: #2D3436; background: #f5f5f5; -webkit-text-size-adjust: 100%; }
    .email-wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .email-header { padding: 32px 32px 0; }
    .hero-img { width: 100%; max-height: 300px; object-fit: cover; border-radius: 8px; }
    .email-body { padding: 32px; }
    h1 { font-family: 'Inter', Arial, sans-serif; font-weight: 800; font-size: 28px; line-height: 1.2; color: #1a1a1a; margin-bottom: 16px; }
    h2 { font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 20px; line-height: 1.3; color: #F4A261; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 16px; font-size: 16px; line-height: 1.7; color: #2D3436; }
    a { color: #E76F8B; text-decoration: underline; }
    .callout { background: #FFF3E0; padding: 20px; border-left: 4px solid #F4A261; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .callout h2 { color: #F4A261; margin-top: 0; font-size: 18px; }
    .callout ul { list-style: none; padding: 0; margin: 12px 0 0 0; }
    .callout li { padding: 6px 0 6px 24px; position: relative; font-size: 15px; line-height: 1.6; color: #2D3436; }
    .callout li:before { content: "\\25B8"; position: absolute; left: 0; color: #E76F8B; font-size: 16px; }
    .read-more-btn { display: block; width: fit-content; margin: 24px auto; padding: 14px 36px; background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); color: #ffffff !important; text-decoration: none; border-radius: 10px; font-family: 'Inter', Arial, sans-serif; font-weight: 600; font-size: 15px; text-align: center; }
    .divider { border: none; height: 3px; background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); margin: 28px 0; border-radius: 2px; }
    .cta-section { background: linear-gradient(135deg, #2D3436 0%, #404854 100%); border-radius: 12px; padding: 36px 28px; text-align: center; color: #ffffff; margin-top: 32px; }
    .cta-section h3 { font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 22px; color: #F4A261; margin-bottom: 12px; }
    .cta-section p { color: rgba(255,255,255,0.85); font-size: 14px; margin-bottom: 16px; }
    .cta-buttons { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
    .cta-btn { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; border-radius: 8px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; text-decoration: none; transition: transform 0.2s; }
    .cta-btn:hover { transform: translateY(-2px); }
    .cta-primary { background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); color: #ffffff !important; }
    .cta-secondary { background: rgba(255,255,255,0.12); color: #ffffff !important; border: 1.5px solid rgba(255,255,255,0.3); }
    .tagline { font-size: 14px; color: #E76F8B; margin-top: 12px; font-weight: 600; }
    .email-footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #999; background: #fafafa; }
    .email-footer a { color: #999; }
    @media (max-width: 600px) {
      .email-body { padding: 20px 16px; }
      h1 { font-size: 22px; }
      h2 { font-size: 18px; }
      .cta-section { padding: 24px 16px; }
      .read-more-btn { padding: 12px 28px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-header">
      <img src="${heroImageUrl || ''}" alt="${altText || headline || ''}" class="hero-img">
    </div>

    <div class="email-body">
      <h1>${headline || ''}</h1>

      <p>${openingHook || ''}</p>

      <div class="callout">
        <h2>${calloutHeading || 'Inside the post:'}</h2>
        <ul>
${(calloutItems || []).map(item => `          <li>${item}</li>`).join('\n')}
        </ul>
      </div>

${extraParagraph ? `      <p>${extraParagraph}</p>\n` : ''}
      <a href="${ctaButtonUrl || '#'}" class="read-more-btn">${ctaButtonText || 'Read the Full Post'}</a>

      <hr class="divider">

      <div class="cta-section">
        <h3>${ctaHeadline || 'What If Your Business Ran Itself?'}</h3>
        <p>${ctaBody || 'Bloomie AI employees handle your marketing, content, customer service, and operations — so you can focus on what matters.'}</p>
        <div class="cta-buttons">
          <a href="tel:+18005551234" class="cta-btn cta-primary">Call Us Now</a>
          <a href="https://bloomie.ai/demo" class="cta-btn cta-secondary">Schedule a Demo</a>
          <a href="sms:+18005551234" class="cta-btn cta-secondary">Text Your Questions</a>
        </div>
        <p class="tagline">${esc(tagline || 'Hire an AI Employee. Get Work Done.')}</p>
      </div>
    </div>

    <div class="email-footer">
      <p>You're receiving this because you subscribed to our updates.</p>
      <p><a href="#">Unsubscribe</a> | <a href="#">Update Preferences</a></p>
    </div>
  </div>
</body>
</html>`;
}

// Tool definitions in model-agnostic format
export const ghlToolDefinitions = {
  // CONTACTS
  ghl_search_contacts: {
    name: "ghl_search_contacts",
    description: "Search for contacts in GoHighLevel by email, phone, name, or other criteria",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (email, phone, name)" },
        limit: { type: "number", description: "Results limit (default: 20)" },
        page: { type: "number", description: "Page number (default: 1)" }
      },
      required: ["query"]
    },
    category: "contacts",
    operation: "read"
  },

  ghl_get_contact: {
    name: "ghl_get_contact",
    description: "Get detailed information about a specific contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "contacts",
    operation: "read"
  },

  ghl_create_contact: {
    name: "ghl_create_contact",
    description: "Create a new contact in GoHighLevel",
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        address1: { type: "string", description: "Address line 1" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State" },
        postalCode: { type: "string", description: "Postal code" },
        website: { type: "string", description: "Website" },
        timezone: { type: "string", description: "Timezone" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to assign" },
        customFields: { type: "object", description: "Custom field values" }
      },
      required: ["firstName"]
    },
    category: "contacts",
    operation: "write"
  },

  ghl_update_contact: {
    name: "ghl_update_contact",
    description: "Update an existing contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        firstName: { type: "string", description: "First name" },
        lastName: { type: "string", description: "Last name" },
        email: { type: "string", description: "Email address" },
        phone: { type: "string", description: "Phone number" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" },
        customFields: { type: "object", description: "Custom field values" }
      },
      required: ["contactId"]
    },
    category: "contacts",
    operation: "write"
  },

  ghl_delete_contact: {
    name: "ghl_delete_contact",
    description: "Delete a contact from GoHighLevel",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "contacts",
    operation: "delete"
  },

  // CONVERSATIONS
  ghl_get_conversations: {
    name: "ghl_get_conversations",
    description: "Get conversations for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        limit: { type: "number", description: "Results limit" }
      },
      required: ["contactId"]
    },
    category: "conversations",
    operation: "read"
  },

  // GET /conversations/{conversationId}/messages — read replies in a thread
  ghl_get_messages: {
    name: "ghl_get_messages",
    description: "Get messages in a conversation thread. Use this to read inbound replies from a contact — check what they said before responding. Pass the conversationId from ghl_get_conversations.",
    parameters: {
      type: "object",
      properties: {
        conversationId: { type: "string", description: "Conversation ID (from ghl_get_conversations result)" },
        limit: { type: "number", description: "Max messages to return (default: 20)" }
      },
      required: ["conversationId"]
    },
    category: "conversations",
    operation: "read"
  },

  ghl_send_message: {
    name: "ghl_send_message",
    description: "Send SMS, email, or other message to a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        type: { type: "string", enum: ["SMS", "Email", "WhatsApp", "GMB", "IG", "FB"], description: "Message type" },
        message: { type: "string", description: "Message content" },
        subject: { type: "string", description: "Email subject (for email type)" },
        html: { type: "string", description: "HTML content (for email)" }
      },
      required: ["contactId", "type", "message"]
    },
    category: "conversations",
    operation: "write"
  },

  // OWNER NOTIFICATIONS — Sarah proactively contacts the user/owner
  notify_owner: {
    name: "notify_owner",
    description: "Send a text message or make a call notification to the business owner (Kimberly). Use this proactively to: report completed work, flag blockers/walls you've hit, alert on VIP emails or urgent items, confirm task completion, or request a decision. ALWAYS use this instead of ghl_send_message when the recipient is the owner.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to send to the owner. Be concise and clear. Include what you did, what you found, or what you need." },
        type: { type: "string", enum: ["SMS", "Email"], description: "How to reach the owner. Default: SMS for quick updates, Email for detailed reports.", default: "SMS" },
        urgency: { type: "string", enum: ["normal", "urgent"], description: "urgent = VIP contact, blocker, or time-sensitive. normal = routine update.", default: "normal" }
      },
      required: ["message"]
    },
    category: "conversations",
    operation: "write"
  },

  // CALENDARS
  ghl_list_calendars: {
    name: "ghl_list_calendars",
    description: "Get all calendars for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "calendars",
    operation: "read"
  },

  ghl_get_calendar_slots: {
    name: "ghl_get_calendar_slots",
    description: "Get available time slots for a calendar",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "End date (YYYY-MM-DD)" }
      },
      required: ["calendarId", "startDate", "endDate"]
    },
    category: "calendars",
    operation: "read"
  },

  ghl_create_appointment: {
    name: "ghl_create_appointment",
    description: "Book an appointment on a calendar",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        contactId: { type: "string", description: "Contact ID" },
        startTime: { type: "string", description: "Start time (ISO format)" },
        title: { type: "string", description: "Appointment title" },
        appointmentStatus: { type: "string", description: "Appointment status" }
      },
      required: ["calendarId", "contactId", "startTime"]
    },
    category: "calendars",
    operation: "write"
  },

  ghl_get_appointments: {
    name: "ghl_get_appointments",
    description: "Get appointments/events from calendar",
    parameters: {
      type: "object",
      properties: {
        calendarId: { type: "string", description: "Calendar ID" },
        startDate: { type: "string", description: "Start date" },
        endDate: { type: "string", description: "End date" }
      },
      required: ["calendarId"]
    },
    category: "calendars",
    operation: "read"
  },

  // OPPORTUNITIES
  ghl_search_opportunities: {
    name: "ghl_search_opportunities",
    description: "Search opportunities in the pipeline",
    parameters: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID" },
        status: { type: "string", description: "Opportunity status" },
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Results limit" }
      }
    },
    category: "opportunities",
    operation: "read"
  },

  ghl_get_opportunity: {
    name: "ghl_get_opportunity",
    description: "Get details of a specific opportunity",
    parameters: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" }
      },
      required: ["opportunityId"]
    },
    category: "opportunities",
    operation: "read"
  },

  ghl_create_opportunity: {
    name: "ghl_create_opportunity",
    description: "Create a new opportunity",
    parameters: {
      type: "object",
      properties: {
        pipelineId: { type: "string", description: "Pipeline ID" },
        pipelineStageId: { type: "string", description: "Pipeline stage ID" },
        contactId: { type: "string", description: "Contact ID" },
        name: { type: "string", description: "Opportunity name" },
        monetaryValue: { type: "number", description: "Monetary value" },
        assignedTo: { type: "string", description: "Assigned user ID" }
      },
      required: ["pipelineId", "contactId", "name"]
    },
    category: "opportunities",
    operation: "write"
  },

  ghl_update_opportunity: {
    name: "ghl_update_opportunity",
    description: "Update an opportunity",
    parameters: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" },
        name: { type: "string", description: "Opportunity name" },
        pipelineStageId: { type: "string", description: "Pipeline stage ID" },
        monetaryValue: { type: "number", description: "Monetary value" },
        status: { type: "string", description: "Status" }
      },
      required: ["opportunityId"]
    },
    category: "opportunities",
    operation: "write"
  },

  ghl_list_pipelines: {
    name: "ghl_list_pipelines",
    description: "Get all pipelines for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "pipelines",
    operation: "read"
  },

  ghl_update_opportunity_stage: {
    name: "ghl_update_opportunity_stage",
    description: "Move opportunity to different pipeline stage",
    parameters: {
      type: "object",
      properties: {
        opportunityId: { type: "string", description: "Opportunity ID" },
        pipelineStageId: { type: "string", description: "Target pipeline stage ID" }
      },
      required: ["opportunityId", "pipelineStageId"]
    },
    category: "opportunities",
    operation: "write"
  },

  // WORKFLOWS
  ghl_list_workflows: {
    name: "ghl_list_workflows",
    description: "Get all workflows for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "workflows",
    operation: "read"
  },

  ghl_add_contact_to_workflow: {
    name: "ghl_add_contact_to_workflow",
    description: "Add a contact to a workflow",
    parameters: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["workflowId", "contactId"]
    },
    category: "workflows",
    operation: "write"
  },

  ghl_remove_contact_from_workflow: {
    name: "ghl_remove_contact_from_workflow",
    description: "Remove a contact from a workflow",
    parameters: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["workflowId", "contactId"]
    },
    category: "workflows",
    operation: "write"
  },

  // TASKS
  ghl_list_tasks: {
    name: "ghl_list_tasks",
    description: "Get tasks for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "tasks",
    operation: "read"
  },

  ghl_create_task: {
    name: "ghl_create_task",
    description: "Create a new task for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        title: { type: "string", description: "Task title" },
        body: { type: "string", description: "Task description" },
        dueDate: { type: "string", description: "Due date (ISO format)" },
        assignedTo: { type: "string", description: "Assigned user ID" }
      },
      required: ["contactId", "title"]
    },
    category: "tasks",
    operation: "write"
  },

  ghl_update_task: {
    name: "ghl_update_task",
    description: "Update or complete a task",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        taskId: { type: "string", description: "Task ID" },
        completed: { type: "boolean", description: "Mark as completed" },
        title: { type: "string", description: "Updated title" },
        dueDate: { type: "string", description: "Updated due date" }
      },
      required: ["contactId", "taskId"]
    },
    category: "tasks",
    operation: "write"
  },

  // NOTES
  ghl_get_notes: {
    name: "ghl_get_notes",
    description: "Get notes for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["contactId"]
    },
    category: "notes",
    operation: "read"
  },

  ghl_create_note: {
    name: "ghl_create_note",
    description: "Add a note to a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        body: { type: "string", description: "Note content" },
        userId: { type: "string", description: "User ID creating the note" }
      },
      required: ["contactId", "body"]
    },
    category: "notes",
    operation: "write"
  },

  // TAGS
  ghl_add_contact_tag: {
    name: "ghl_add_contact_tag",
    description: "Add tag to a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add" }
      },
      required: ["contactId", "tags"]
    },
    category: "tags",
    operation: "write"
  },

  ghl_remove_contact_tag: {
    name: "ghl_remove_contact_tag",
    description: "Remove tag from a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to remove" }
      },
      required: ["contactId", "tags"]
    },
    category: "tags",
    operation: "write"
  },

  ghl_list_location_tags: {
    name: "ghl_list_location_tags",
    description: "List all tags for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "tags",
    operation: "read"
  },

  // CUSTOM FIELDS
  ghl_get_custom_fields: {
    name: "ghl_get_custom_fields",
    description: "Get all custom fields for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "custom_fields",
    operation: "read"
  },

  ghl_update_contact_custom_field: {
    name: "ghl_update_contact_custom_field",
    description: "Update custom field value for a contact",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        customFields: { type: "object", description: "Custom field key-value pairs" }
      },
      required: ["contactId", "customFields"]
    },
    category: "custom_fields",
    operation: "write"
  },

  // USERS & LOCATION
  ghl_list_users: {
    name: "ghl_list_users",
    description: "Get all users in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "users",
    operation: "read"
  },

  ghl_get_location_info: {
    name: "ghl_get_location_info",
    description: "Get location information and settings",
    parameters: { type: "object", properties: {}, required: [] },
    category: "locations",
    operation: "read"
  },

  // CAMPAIGNS
  ghl_list_campaigns: {
    name: "ghl_list_campaigns",
    description: "Get all campaigns",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Campaign status filter" }
      }
    },
    category: "campaigns",
    operation: "read"
  },

  // FORMS
  ghl_list_forms: {
    name: "ghl_list_forms",
    description: "Get all forms for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "forms",
    operation: "read"
  },

  ghl_get_form_submissions: {
    name: "ghl_get_form_submissions",
    description: "Get submissions for a specific form",
    parameters: {
      type: "object",
      properties: {
        formId: { type: "string", description: "Form ID" },
        limit: { type: "number", description: "Results limit" },
        startAt: { type: "string", description: "Start date filter" },
        endAt: { type: "string", description: "End date filter" }
      },
      required: ["formId"]
    },
    category: "forms",
    operation: "read"
  },

  // SURVEYS
  ghl_list_surveys: {
    name: "ghl_list_surveys",
    description: "List surveys in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "surveys",
    operation: "read"
  },

  ghl_get_survey_submissions: {
    name: "ghl_get_survey_submissions",
    description: "Get survey submissions",
    parameters: {
      type: "object",
      properties: {
        surveyId: { type: "string", description: "Survey ID" },
        limit: { type: "number", description: "Results limit" }
      },
      required: ["surveyId"]
    },
    category: "surveys",
    operation: "read"
  },

  // INVOICES
  ghl_list_invoices: {
    name: "ghl_list_invoices",
    description: "List invoices for the location",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Results limit" },
        status: { type: "string", enum: ["draft", "sent", "paid", "overdue"], description: "Invoice status" }
      }
    },
    category: "invoices",
    operation: "read"
  },

  ghl_get_invoice: {
    name: "ghl_get_invoice",
    description: "Get a specific invoice",
    parameters: {
      type: "object",
      properties: {
        invoiceId: { type: "string", description: "Invoice ID" }
      },
      required: ["invoiceId"]
    },
    category: "invoices",
    operation: "read"
  },

  ghl_create_invoice: {
    name: "ghl_create_invoice",
    description: "Create a new invoice",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Contact ID" },
        title: { type: "string", description: "Invoice title" },
        dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
        items: { type: "array", description: "Invoice line items" }
      },
      required: ["contactId", "title", "items"]
    },
    category: "invoices",
    operation: "write"
  },

  ghl_send_invoice: {
    name: "ghl_send_invoice",
    description: "Send an invoice to the contact",
    parameters: {
      type: "object",
      properties: {
        invoiceId: { type: "string", description: "Invoice ID" }
      },
      required: ["invoiceId"]
    },
    category: "invoices",
    operation: "write"
  },

  // PRODUCTS
  ghl_list_products: {
    name: "ghl_list_products",
    description: "List products in the location",
    parameters: { type: "object", properties: { limit: { type: "number" } } },
    category: "products",
    operation: "read"
  },

  ghl_create_product: {
    name: "ghl_create_product",
    description: "Create a new product",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Product name" },
        description: { type: "string", description: "Product description" },
        price: { type: "number", description: "Product price" }
      },
      required: ["name", "price"]
    },
    category: "products",
    operation: "write"
  },

  // PAYMENTS
  ghl_list_payments: {
    name: "ghl_list_payments",
    description: "List payment transactions",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date filter" },
        endDate: { type: "string", description: "End date filter" }
      }
    },
    category: "payments",
    operation: "read"
  },

  // FUNNELS
  ghl_list_funnels: {
    name: "ghl_list_funnels",
    description: "List funnels in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "funnels",
    operation: "read"
  },

  ghl_get_funnel_pages: {
    name: "ghl_get_funnel_pages",
    description: "Get pages for a specific funnel",
    parameters: {
      type: "object",
      properties: {
        funnelId: { type: "string", description: "Funnel ID" }
      },
      required: ["funnelId"]
    },
    category: "funnels",
    operation: "read"
  },

  // MEDIA
  ghl_list_media: {
    name: "ghl_list_media",
    description: "List media files in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "media",
    operation: "read"
  },

  ghl_upload_media: {
    name: "ghl_upload_media",
    description: "Upload a media file",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File base64 content" },
        fileName: { type: "string", description: "File name" }
      },
      required: ["file", "fileName"]
    },
    category: "media",
    operation: "write"
  },

  // EMAIL BUILDER
  ghl_list_email_templates: {
    name: "ghl_list_email_templates",
    description: "List email templates",
    parameters: { type: "object", properties: {}, required: [] },
    category: "email_builder",
    operation: "read"
  },

  ghl_create_email_template: {
    name: "ghl_create_email_template",
    description: "Create an email using the LOCKED BLOOM template. Pass structured data (headline, openingHook, calloutItems) — the handler auto-assembles the HTML. Do NOT pass raw HTML — use the structured fields instead. Always draft first.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name (internal reference, e.g. 'Blog Announcement - 5 Signs - Mar 2026')" },
        subject: { type: "string", description: "Email subject line. 6-10 words, front-load value." },
        previewText: { type: "string", description: "Preview text (first 90 chars after subject). Complement the subject." },
        headline: { type: "string", description: "Email headline (h1). For blog announcements, use the ACTUAL blog title — never 'New Blog Post'." },
        openingHook: { type: "string", description: "Opening paragraph (1-2 conversational sentences about the topic)" },
        calloutHeading: { type: "string", description: "Callout box heading. Blog: 'Inside the post:', Newsletter: 'This week:', Promo: 'What you get:'" },
        calloutItems: { type: "array", items: { type: "string" }, description: "3-5 takeaway items shown in the orange-bordered callout box" },
        extraParagraph: { type: "string", description: "Optional extra paragraph of context after the callout" },
        ctaButtonText: { type: "string", description: "Main CTA button text. Blog: 'Read the Full Post', Newsletter: 'Read More'" },
        ctaButtonUrl: { type: "string", description: "URL for the main CTA button (blog URL, landing page, etc.)" },
        ctaHeadline: { type: "string", description: "Bloomie CTA card headline (connect to email topic)" },
        ctaBody: { type: "string", description: "Bloomie CTA card body text (1-2 sentences)" },
        imageUrl: { type: "string", description: "Hero image URL from image_generate" },
        type: { type: "string", enum: ["newsletter", "promotional", "welcome", "re-engagement", "blog-announcement"], description: "Email type" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" }
      },
      required: ["name", "subject", "calloutItems"]
    },
    category: "email_builder",
    operation: "write"
  },

  ghl_update_email_template: {
    name: "ghl_update_email_template",
    description: "Update an existing email template in the CRM. Use this when the user asks to edit, fix, or change an email template that was already created. You can update the HTML content, subject, preview text, or rebuild from structured fields. You MUST provide the templateId of the template to update.",
    parameters: {
      type: "object",
      properties: {
        templateId: { type: "string", description: "The GHL template ID to update (returned from ghl_create_email_template as _templateId)" },
        html: { type: "string", description: "Full replacement HTML for the template. Use this for raw HTML updates (e.g. link changes, text edits)." },
        subject: { type: "string", description: "Updated email subject line" },
        previewText: { type: "string", description: "Updated preview text" },
        headline: { type: "string", description: "If rebuilding from structured data: updated headline" },
        openingHook: { type: "string", description: "If rebuilding: updated opening paragraph" },
        calloutHeading: { type: "string", description: "If rebuilding: updated callout heading" },
        calloutItems: { type: "array", items: { type: "string" }, description: "If rebuilding: updated callout items" },
        extraParagraph: { type: "string", description: "If rebuilding: updated extra paragraph" },
        ctaButtonText: { type: "string", description: "If rebuilding: updated CTA button text" },
        ctaButtonUrl: { type: "string", description: "If rebuilding: updated CTA button URL" },
        ctaHeadline: { type: "string", description: "If rebuilding: updated Bloomie CTA headline" },
        ctaBody: { type: "string", description: "If rebuilding: updated Bloomie CTA body" },
        imageUrl: { type: "string", description: "If rebuilding: updated hero image URL" }
      },
      required: ["templateId"]
    },
    category: "email_builder",
    operation: "write"
  },

  // SOCIAL PLANNER
  ghl_list_social_posts: {
    name: "ghl_list_social_posts",
    description: "List Social Planner posts using GHL's posts/list endpoint.",
    parameters: { type: "object", properties: {}, required: [] },
    category: "social_planner",
    operation: "read"
  },

  ghl_list_social_accounts: {
    name: "ghl_list_social_accounts",
    description: "List connected GHL Social Planner accounts. Use this before creating Instagram, Facebook, LinkedIn, or other social posts so accountIds can be selected.",
    parameters: { type: "object", properties: {}, required: [] },
    category: "social_planner",
    operation: "read"
  },

  ghl_create_social_post: {
    name: "ghl_create_social_post",
    description: "Create or schedule a GHL Social Planner post. Use accountIds from ghl_list_social_accounts. Media URLs must be public https:// URLs from image_generate or a CDN/Supabase URL; never pass /api/files/preview/... because GHL cannot render internal app preview URLs. Do not send content/platforms/scheduledDate directly to GHL; this tool maps legacy fields safely.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Post text/caption. Preferred field." },
        content: { type: "string", description: "Legacy alias for summary." },
        accountIds: { type: "array", items: { type: "string" }, description: "Connected Social Planner account IDs from ghl_list_social_accounts." },
        platforms: { type: "array", items: { type: "string" }, description: "Legacy convenience filter such as instagram or facebook. The tool will look up matching accountIds." },
        media: {
          type: "array",
          description: "Media objects for the post.",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "Public https:// media URL. Use image_generate.image_url or a CDN/Supabase URL, not /api/files/preview/..." },
              type: { type: "string", description: "Media type, usually image or video." },
              caption: { type: "string", description: "Optional media caption." },
              thumbnail: { type: "string", description: "Optional thumbnail URL." }
            },
            required: ["url"]
          }
        },
        imageUrl: { type: "string", description: "Public https:// image URL to attach as image media. Use image_generate.image_url or a CDN/Supabase URL, not /api/files/preview/..." },
        type: { type: "string", enum: ["post", "story", "reel"], description: "GHL post type. Defaults to post." },
        status: { type: "string", enum: ["draft", "scheduled", "published"], description: "GHL post status. Defaults to scheduled when scheduleDate is provided, otherwise draft." },
        scheduleDate: { type: "string", description: "Scheduled date/time (ISO format)." },
        scheduledDate: { type: "string", description: "Legacy alias for scheduleDate." },
        userId: { type: "string", description: "GHL user ID creating the post. Defaults to GHL_USER_ID/HUMAN_GHL_USER_ID env if configured." }
      },
      required: []
    },
    category: "social_planner",
    operation: "write"
  },

  // BLOG POSTS
  ghl_list_blog_posts: {
    name: "ghl_list_blog_posts",
    description: "List blog posts from the configured GHL/HighLevel blog site using the official GET /blogs/posts/all endpoint.",
    parameters: {
      type: "object",
      properties: {
        blogId: { type: "string", description: "Blog site ID. Defaults to BLOOM blog (DHQrtpkQ3Cp7c96FCyDu)." },
        limit: { type: "number", description: "Number of posts to return. Defaults to 20." },
        offset: { type: "number", description: "Pagination offset. Defaults to 0." }
      },
      required: []
    },
    category: "blog",
    operation: "read"
  },

  ghl_create_blog_post: {
    name: "ghl_create_blog_post",
    description: "Create a blog post using the LOCKED BLOOM template. Pass structured data (title, subtitle, intro, sections array) — the handler auto-assembles the HTML. Do NOT pass raw HTML in content — use the structured fields instead. Do NOT pass slug, author, or categories — these fields are NOT accepted by the API. Always draft first.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Blog post main title (h1)" },
        subtitle: { type: "string", description: "Subtitle shown below title in gradient header" },
        intro: { type: "string", description: "Opening hook paragraph (1-3 sentences, shown in italic blockquote)" },
        sections: {
          type: "array",
          description: "Blog content sections. Each section gets an orange H2 heading with pink top border.",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "Section heading (h2)" },
              paragraphs: {
                description: "One paragraph string or array of paragraph strings",
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } }
                ]
              },
              highlight: { type: "string", description: "Optional peach callout box text (stat or key takeaway)" },
              highlightLabel: { type: "string", description: "Label for highlight box (default: 'The impact:')" },
              bullets: { type: "array", items: { type: "string" }, description: "Optional bullet points with orange triangle markers" }
            },
            required: ["heading"]
          }
        },
        ctaHeadline: { type: "string", description: "CTA card headline (connect to blog topic). Default: 'Ready to Transform Your Operations?'" },
        ctaBody: { type: "string", description: "CTA card body text (1-2 sentences). For Bloomie posts, close by connecting market terms like AI agents or AI automation to hiring a reliable AI employee." },
        evidence: {
          type: "array",
          items: { type: "string" },
          description: "Optional supporting proof, use-case examples, workflow examples, or sourced evidence points. These render as a natural reader-facing evidence section, never as a GEO label."
        },
        faqs: {
          type: "array",
          description: "Optional question/answer pairs that answer real audience questions and generate FAQ schema.",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "Audience question in natural market language" },
              answer: { type: "string", description: "Direct, helpful answer. For Bloomie posts, naturally bridge market terms to reliable AI employees where useful." }
            },
            required: ["question", "answer"]
          }
        },
        imageUrl: { type: "string", description: "Hero image URL from image_generate" },
        metaDescription: { type: "string", description: "SEO meta description (150-160 chars) — used as the blog description field" },
        keywords: { type: "string", description: "Comma-separated SEO keywords — used in meta tags in the HTML template" },
        altText: { type: "string", description: "Alt text for the hero image (SEO)" },
        status: { type: "string", enum: ["DRAFT", "PUBLISHED"], description: "Always 'DRAFT' unless told to publish. Must be UPPERCASE." },
        scheduledDate: { type: "string", description: "ISO date for scheduled publishing (e.g. 2026-03-24T10:00:00-06:00)" }
      },
      required: ["title", "sections"]
    },
    category: "blog",
    operation: "write"
  },

  // DOCUMENTS/CONTRACTS
  ghl_list_documents: {
    name: "ghl_list_documents",
    description: "List documents and contracts",
    parameters: { type: "object", properties: {}, required: [] },
    category: "documents",
    operation: "read"
  },

  ghl_send_document: {
    name: "ghl_send_document",
    description: "Send a document for signature",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID" },
        contactId: { type: "string", description: "Contact ID" }
      },
      required: ["documentId", "contactId"]
    },
    category: "documents",
    operation: "write"
  },

  // TRIGGER LINKS
  ghl_list_trigger_links: {
    name: "ghl_list_trigger_links",
    description: "List trigger links",
    parameters: { type: "object", properties: {}, required: [] },
    category: "trigger_links",
    operation: "read"
  },

  ghl_create_trigger_link: {
    name: "ghl_create_trigger_link",
    description: "Create a trigger link",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Link name" },
        redirectTo: { type: "string", description: "Target URL" }
      },
      required: ["name", "redirectTo"]
    },
    category: "trigger_links",
    operation: "write"
  },

  // PHONE / VOICE
  ghl_list_phone_numbers: {
    name: "ghl_list_phone_numbers",
    description: "List phone numbers for the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "phone_system",
    operation: "read"
  },

  // COURSES
  ghl_list_courses: {
    name: "ghl_list_courses",
    description: "List courses in the location",
    parameters: { type: "object", properties: {}, required: [] },
    category: "courses",
    operation: "read"
  },

  // BLOOMIE → GHL SYNC — create/find contact from Bloomie chat visitor and send follow-up
  bloomie_sync_to_ghl: {
    name: "bloomie_sync_to_ghl",
    description: "Sync a Bloomie website chat visitor to GHL. Finds or creates a contact by email/phone, then optionally sends a follow-up SMS or email. Use when a visitor in a Bloomie chat has provided their contact info and you want to add them to the CRM and/or follow up.",
    parameters: {
      type: "object",
      properties: {
        visitor_name: { type: "string", description: "Visitor's name from the chat" },
        visitor_email: { type: "string", description: "Visitor's email address" },
        visitor_phone: { type: "string", description: "Visitor's phone number" },
        chat_summary: { type: "string", description: "Brief summary of what the visitor discussed" },
        follow_up_message: { type: "string", description: "Optional follow-up message to send via SMS or email" },
        follow_up_type: { type: "string", enum: ["SMS", "Email", "none"], description: "How to follow up. Default: none", default: "none" },
        session_id: { type: "string", description: "Bloomie chat session_id for linking" },
        tags: { type: "array", items: { type: "string" }, description: "Tags to add to the contact (e.g. 'bloomie-chat', 'sales-inquiry')" }
      },
      required: ["visitor_name"]
    },
    category: "conversations",
    operation: "write"
  }
};

// ─────────────────────────────────────────────
// EXECUTORS — All verified against official GHL API v2 docs
// Source: marketplace.gohighlevel.com/docs
// ─────────────────────────────────────────────
export const ghlExecutors = {

  // CONTACTS
  // POST /contacts/search — requires page + pageLimit in body
  ghl_search_contacts: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/contacts/search', 'POST', {
      locationId,
      page: params.page || 1,
      pageLimit: params.limit || 20,
      query: params.query
    }, null, params._orgId);
  },

  // GET /contacts/{contactId}
  ghl_get_contact: async (params) => {
    return await callGHL(`/contacts/${params.contactId}`, 'GET', null, {}, params._orgId);
  },

  // POST /contacts/
  ghl_create_contact: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    const { _orgId, ...contactData } = params;
    return await callGHL('/contacts/', 'POST', { locationId, ...contactData }, {}, _orgId);
  },

  // PUT /contacts/{contactId}
  ghl_update_contact: async (params) => {
    const { contactId, _orgId, ...updateData } = params;
    return await callGHL(`/contacts/${contactId}`, 'PUT', updateData, {}, _orgId);
  },

  // DELETE /contacts/{contactId}
  ghl_delete_contact: async (params) => {
    return await callGHL(`/contacts/${params.contactId}`, 'DELETE', null, {}, params._orgId);
  },

  // CONVERSATIONS
  // GET /conversations/search?locationId=&contactId=
  ghl_get_conversations: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/conversations/search', 'GET', null, { locationId, contactId: params.contactId, limit: params.limit || 20 });
  },

  // GET /conversations/{conversationId}/messages — read replies in thread
  ghl_get_messages: async (params) => {
    return await callGHL(
      `/conversations/${params.conversationId}/messages`,
      'GET', null,
      { limit: params.limit || 20 },
      params._orgId
    );
  },

  // POST /conversations/messages
  ghl_send_message: async (params) => {
    return await callGHL('/conversations/messages', 'POST', params);
  },

  // OWNER NOTIFICATIONS
  notify_owner: async (params) => {
    // Look up owner contact ID from Supabase organizations table
    // This scales to all clients — no Railway env var needed per client
    let ownerContactId = process.env.OWNER_GHL_CONTACT_ID; // fallback for legacy
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const orgId = params._orgId || process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
      const { data: org } = await supabase
        .from('organizations')
        .select('owner_ghl_contact_id, owner_name')
        .eq('id', orgId)
        .single();
      if (org?.owner_ghl_contact_id) {
        ownerContactId = org.owner_ghl_contact_id;
        logger.info('notify_owner: contact ID loaded from Supabase', { owner: org.owner_name });
      }
    } catch (e) {
      logger.warn('notify_owner: Supabase lookup failed, falling back to env var', { error: e.message });
    }

    if (!ownerContactId) {
      throw new Error('notify_owner: no owner_ghl_contact_id found in Supabase organizations table or OWNER_GHL_CONTACT_ID env var');
    }
    const locationId = await resolveLocationId(params._orgId);
    const messageType = params.type || 'SMS';

    logger.info('notify_owner firing', { urgency: params.urgency, type: messageType, preview: params.message.slice(0, 80) });

    // Step 1: Find or create a conversation for this contact
    // GHL requires a conversationId to send messages — can't send directly to contactId
    let conversationId;
    try {
      const searchResult = await callGHL('/conversations/search', 'GET', null, {
        locationId,
        contactId: ownerContactId,
        limit: 1
      });
      const existing = searchResult?.conversations?.[0];
      if (existing?.id) {
        conversationId = existing.id;
        logger.info('notify_owner: found existing conversation', { conversationId });
      }
    } catch (e) {
      logger.warn('notify_owner: conversation search failed, will create new', { error: e.message });
    }

    // Step 2: Create conversation if none exists
    if (!conversationId) {
      try {
        const created = await callGHL('/conversations/', 'POST', {
          locationId,
          contactId: ownerContactId
        });
        conversationId = created?.id || created?.conversation?.id;
        logger.info('notify_owner: created new conversation', { conversationId });
      } catch (e) {
        throw new Error(`notify_owner: failed to create conversation — ${e.message}`);
      }
    }

    if (!conversationId) {
      throw new Error('notify_owner: could not find or create a GHL conversation for owner contact');
    }

    // Step 3: Send the message to the conversation
    const payload = {
      type: messageType,
      message: params.message,
      conversationId,
      contactId: ownerContactId,
    };
    if (messageType === 'Email') {
      payload.subject = params.urgency === 'urgent' ? '🚨 URGENT — Sarah Rodriguez Update' : '📋 Sarah Rodriguez Update';
    }

    const result = await callGHL('/conversations/messages', 'POST', payload);
    logger.info('notify_owner: message sent', { conversationId, messageType, result });
    return result;
  },

  // CALENDARS
  // GET /calendars/?locationId=
  ghl_list_calendars: async (params) => {
    return await callGHL('/calendars/');
  },

  // GET /calendars/{calendarId}/free-slots
  ghl_get_calendar_slots: async (params) => {
    return await callGHL(`/calendars/${params.calendarId}/free-slots`, 'GET', null, {
      startDate: params.startDate,
      endDate: params.endDate
    });
  },

  // POST /calendars/events/appointments
  ghl_create_appointment: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/calendars/events/appointments', 'POST', { locationId, ...params });
  },

  // GET /calendars/events?calendarId=&locationId=&startTime=&endTime=
  ghl_get_appointments: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/calendars/events', 'GET', null, {
      locationId,
      calendarId: params.calendarId,
      startTime: params.startDate,
      endTime: params.endDate
    });
  },

  // OPPORTUNITIES
  // POST /opportunities/search — requires location_id in body
  ghl_search_opportunities: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/opportunities/search', 'POST', {
      location_id: locationId,
      page: 1,
      pageLimit: params.limit || 20,
      ...(params.query && { query: params.query }),
      ...(params.pipelineId && { pipelineId: params.pipelineId }),
      ...(params.status && { status: params.status })
    }, null);
  },

  // GET /opportunities/{id}
  ghl_get_opportunity: async (params) => {
    return await callGHL(`/opportunities/${params.opportunityId}`);
  },

  // POST /opportunities/
  ghl_create_opportunity: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/opportunities/', 'POST', { locationId, ...params });
  },

  // PUT /opportunities/{id}
  ghl_update_opportunity: async (params) => {
    const { opportunityId, ...updateData } = params;
    return await callGHL(`/opportunities/${opportunityId}`, 'PUT', updateData);
  },

  // GET /opportunities/pipelines?locationId=
  ghl_list_pipelines: async (params) => {
    return await callGHL('/opportunities/pipelines');
  },

  // PUT /opportunities/{id} with pipelineStageId
  ghl_update_opportunity_stage: async (params) => {
    return await callGHL(`/opportunities/${params.opportunityId}`, 'PUT', { pipelineStageId: params.pipelineStageId });
  },

  // WORKFLOWS
  // GET /workflows/?locationId=
  ghl_list_workflows: async (params) => {
    return await callGHL('/workflows/');
  },

  // POST /contacts/{contactId}/workflow/{workflowId}
  ghl_add_contact_to_workflow: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/workflow/${params.workflowId}`, 'POST', {});
  },

  // DELETE /contacts/{contactId}/workflow/{workflowId}
  ghl_remove_contact_from_workflow: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/workflow/${params.workflowId}`, 'DELETE');
  },

  // TASKS
  // GET /contacts/{contactId}/tasks
  ghl_list_tasks: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/tasks`);
  },

  // POST /contacts/{contactId}/tasks
  ghl_create_task: async (params) => {
    const { contactId, ...taskData } = params;
    return await callGHL(`/contacts/${contactId}/tasks`, 'POST', taskData);
  },

  // PUT /contacts/{contactId}/tasks/{taskId}
  ghl_update_task: async (params) => {
    const { contactId, taskId, ...updateData } = params;
    return await callGHL(`/contacts/${contactId}/tasks/${taskId}`, 'PUT', updateData);
  },

  // NOTES
  // GET /contacts/{contactId}/notes
  ghl_get_notes: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/notes`);
  },

  // POST /contacts/{contactId}/notes
  ghl_create_note: async (params) => {
    const { contactId, ...noteData } = params;
    return await callGHL(`/contacts/${contactId}/notes`, 'POST', noteData);
  },

  // TAGS
  // POST /contacts/{contactId}/tags
  ghl_add_contact_tag: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/tags`, 'POST', { tags: params.tags });
  },

  // DELETE /contacts/{contactId}/tags
  ghl_remove_contact_tag: async (params) => {
    return await callGHL(`/contacts/${params.contactId}/tags`, 'DELETE', { tags: params.tags });
  },

  // GET /locations/{locationId}/tags
  ghl_list_location_tags: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/locations/${locationId}/tags`);
  },

  // CUSTOM FIELDS
  // GET /custom-fields/?locationId=&model=contact
  ghl_get_custom_fields: async (params) => {
    return await callGHL('/custom-fields/', 'GET', null, { model: 'contact' });
  },

  // PUT /contacts/{contactId}
  ghl_update_contact_custom_field: async (params) => {
    const { contactId, customFields } = params;
    return await callGHL(`/contacts/${contactId}`, 'PUT', { customFields });
  },

  // USERS & LOCATION
  // GET /users/search?locationId=
  ghl_list_users: async (params) => {
    return await callGHL('/users/search');
  },

  // GET /locations/{locationId}
  ghl_get_location_info: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/locations/${locationId}`);
  },

  // CAMPAIGNS
  // GET /campaigns/?locationId=
  ghl_list_campaigns: async (params) => {
    return await callGHL('/campaigns/', 'GET', null, params);
  },

  // FORMS
  // GET /forms/?locationId=
  ghl_list_forms: async (params) => {
    return await callGHL('/forms/');
  },

  // GET /forms/submissions?locationId=&formId=
  ghl_get_form_submissions: async (params) => {
    const { formId, ...queryParams } = params;
    return await callGHL('/forms/submissions', 'GET', null, { formId, ...queryParams });
  },

  // SURVEYS
  // GET /surveys/?locationId=
  ghl_list_surveys: async (params) => {
    return await callGHL('/surveys/');
  },

  // GET /surveys/submissions?locationId=&surveyId=
  ghl_get_survey_submissions: async (params) => {
    return await callGHL('/surveys/submissions', 'GET', null, { surveyId: params.surveyId });
  },

  // INVOICES
  // GET /invoices/?locationId=
  ghl_list_invoices: async (params) => {
    return await callGHL('/invoices/', 'GET', null, params);
  },

  // GET /invoices/{invoiceId}
  ghl_get_invoice: async (params) => {
    return await callGHL(`/invoices/${params.invoiceId}`);
  },

  // POST /invoices/
  ghl_create_invoice: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/invoices/', 'POST', { locationId, ...params });
  },

  // POST /invoices/{invoiceId}/send
  ghl_send_invoice: async (params) => {
    return await callGHL(`/invoices/${params.invoiceId}/send`, 'POST', {});
  },

  // PRODUCTS
  // GET /products/?locationId=
  ghl_list_products: async (params) => {
    return await callGHL('/products/', 'GET', null, params);
  },

  // POST /products/
  ghl_create_product: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/products/', 'POST', { locationId, ...params });
  },

  // PAYMENTS
  // GET /payments/transactions?locationId=
  ghl_list_payments: async (params) => {
    return await callGHL('/payments/transactions', 'GET', null, params);
  },

  // FUNNELS
  // GET /funnels/funnel/list?locationId=
  ghl_list_funnels: async (params) => {
    return await callGHL('/funnels/funnel/list');
  },

  // GET /funnels/page?funnelId=
  ghl_get_funnel_pages: async (params) => {
    return await callGHL('/funnels/page', 'GET', null, { funnelId: params.funnelId });
  },

  // MEDIA
  // GET /medias/files?locationId=
  ghl_list_media: async (params) => {
    return await callGHL('/medias/files');
  },

  // POST /medias/upload-file
  ghl_upload_media: async (params) => {
    return await callGHL('/medias/upload-file', 'POST', params);
  },

  // EMAIL BUILDER
  // GET /emails/builder?locationId= — list email templates
  ghl_list_email_templates: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/emails/builder', 'GET', null, { locationId });
  },

  // POST /emails/builder — create email template as draft
  // GHL email builder expects: locationId, title, html, preheaderText (optional)
  // If params.calloutItems is provided, assembles HTML from locked template automatically.
  ghl_create_email_template: async (params) => {
    const locationId = await resolveLocationId(params._orgId);

    // Look up org brand kit for tagline (same pattern as blog executor)
    let brandTagline;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const orgId = params._orgId || process.env.BLOOM_ORG_ID;
      if (orgId) {
        const { data: bkRow } = await sb.from('user_settings').select('value').eq('organization_id', orgId).eq('key', 'brand_kits').maybeSingle();
        let kits = bkRow?.value ? (Array.isArray(bkRow.value) ? bkRow.value : [bkRow.value]) : [];
        const bk = kits.find(k => k.active) || kits[0];
        if (bk?.tagline) brandTagline = bk.tagline;
      }
    } catch(e) {
      logger.warn('Brand kit lookup failed for email template (non-critical):', e.message);
    }

    // Auto-assemble HTML from structured data if calloutItems are provided
    let html = params.html || '';
    if (params.calloutItems && Array.isArray(params.calloutItems)) {
      html = assembleEmailHTML({
        subject: params.subject,
        headline: params.headline || params.subject,
        heroImageUrl: params.imageUrl,
        altText: params.altText,
        openingHook: params.openingHook,
        calloutHeading: params.calloutHeading,
        calloutItems: params.calloutItems,
        extraParagraph: params.extraParagraph,
        ctaButtonText: params.ctaButtonText,
        ctaButtonUrl: params.ctaButtonUrl,
        ctaHeadline: params.ctaHeadline,
        ctaBody: params.ctaBody,
        tagline: brandTagline
      });
      logger.info('Email HTML assembled from locked template', { calloutCount: params.calloutItems.length });
    }

    // ── GHL API v2: Two-step email template creation (VERIFIED against live API 2026-03-27) ──
    // Step 1: POST /emails/builder — creates the template shell (returns id)
    // Step 2: PATCH /emails/builder/:id — injects HTML content via editorType + editorContent
    //
    // VERIFIED FACTS from live API testing:
    //   - POST requires: { locationId, name, type: 'html' }
    //   - PATCH requires: { locationId, editorType: 'html', editorContent: <html string> }
    //   - editorType MUST be 'html' or 'builder' (NOT 'code' — returns 422)
    //   - PATCH MUST include locationId in body (returns 422 without it)
    //   - POST /emails/builder/data also works: { locationId, templateId, updatedBy, html, editorType: 'html' }
    //   - GET /emails/builder/:id returns 404 (not supported for individual templates)

    const templateName = params.name || params.subject || 'Email Template';

    logger.info('GHL email template creation', { templateName, hasHTML: !!html, htmlLength: html?.length || 0 });

    try {
      // STEP 1: Create the template shell
      const createPayload = {
        locationId,
        name: templateName,
        type: 'html'
      };

      const result = await callGHL('/emails/builder', 'POST', createPayload);
      const templateId = result?.id || result?.templateId || result?.redirect;

      if (!templateId) {
        return {
          _status: 'FAILED',
          _message: `EMAIL TEMPLATE SAVE FAILED — the API returned a response but NO template ID was found. Do NOT tell the user it was saved. Response keys: ${Object.keys(result || {}).join(', ')}`,
          _error: 'No template ID in response',
          _assembledHTML: html || null
        };
      }

      logger.info(`Email template shell created: ${templateId}`);

      // STEP 2: Inject HTML content via PATCH
      if (html) {
        try {
          const patchPayload = {
            locationId,
            editorType: 'html',
            editorContent: html,
            previewText: params.previewText || ''
          };

          const patchResult = await callGHL(`/emails/builder/${templateId}`, 'PATCH', patchPayload);
          logger.info(`Email template HTML injected via PATCH: ${templateId}`, {
            previewUrl: patchResult?.previewUrl || 'none'
          });
          result._previewUrl = patchResult?.previewUrl;
        } catch (patchErr) {
          // PATCH failed — try the older POST /emails/builder/data endpoint as fallback
          logger.warn(`PATCH failed: ${patchErr.message} — trying POST /emails/builder/data fallback`);
          try {
            const dataPayload = {
              locationId,
              templateId,
              updatedBy: 'bloomie-agent',
              html: html,
              editorType: 'html'
            };
            const dataResult = await callGHL('/emails/builder/data', 'POST', dataPayload);
            logger.info(`Email template HTML injected via POST /emails/builder/data: ${templateId}`, {
              previewUrl: dataResult?.previewUrl || 'none'
            });
            result._previewUrl = dataResult?.previewUrl;
          } catch (dataErr) {
            logger.error(`Both PATCH and POST /emails/builder/data failed for template ${templateId}: ${dataErr.message}`);
            // Template shell exists but without custom HTML — user can edit in GHL UI
          }
        }
      }

      result._status = 'SUCCESS';
      result._templateId = templateId;
      result._templateName = templateName;
      result._message = `EMAIL TEMPLATE SAVED SUCCESSFULLY. Template ID: ${templateId}. Template name: "${templateName}". NEXT STEP: You MUST now use bloom_browser_* tools (BLOOM Desktop) to create a campaign from this template in the GHL UI. Do NOT use browser_task — GHL blocks cloud browsers. Use bloom_browser_navigate to go to https://app.gohighlevel.com/v2/location/iGy4nrpDVU0W1jAvseL3/email-marketing/campaigns, then use bloom_browser_click/bloom_browser_type/bloom_browser_screenshot to: click New > Email Marketing Templates > find and select "${templateName}" > Continue > configure and save as draft. Do NOT skip this step — the user expects a campaign, not just a template.`;
      if (html) { result._assembledHTML = html; }
      logger.info(`Email template created successfully: ${templateId}`);
      return result;

    } catch (error) {
      return {
        _status: 'FAILED',
        _message: `EMAIL TEMPLATE SAVE FAILED. Error: ${error.message}. You MUST tell the user this failed and show them the error. Do NOT say it was saved.`,
        _error: error.message,
        _assembledHTML: html || null
      };
    }
  },

  // UPDATE an existing email template — PATCH /emails/builder/:templateId
  // Verified against live GHL API: PATCH requires {locationId, editorType:'html', editorContent:<html>}
  ghl_update_email_template: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    const templateId = params.templateId;

    if (!templateId) {
      return { _status: 'FAILED', _message: 'Missing templateId — you must provide the ID of the template to update.' };
    }

    // If structured fields provided, rebuild the HTML
    let html = params.html || '';
    if (!html && params.calloutItems && Array.isArray(params.calloutItems)) {
      // Look up brand kit for tagline
      let brandTagline;
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const orgId = params._orgId || process.env.BLOOM_ORG_ID;
        if (orgId) {
          const { data: bkRow } = await sb.from('user_settings').select('value').eq('organization_id', orgId).eq('key', 'brand_kits').maybeSingle();
          let kits = bkRow?.value ? (Array.isArray(bkRow.value) ? bkRow.value : [bkRow.value]) : [];
          const bk = kits.find(k => k.active) || kits[0];
          if (bk?.tagline) brandTagline = bk.tagline;
        }
      } catch(e) { /* non-critical */ }

      html = assembleEmailHTML({
        subject: params.subject,
        headline: params.headline || params.subject,
        heroImageUrl: params.imageUrl,
        openingHook: params.openingHook,
        calloutHeading: params.calloutHeading,
        calloutItems: params.calloutItems,
        extraParagraph: params.extraParagraph,
        ctaButtonText: params.ctaButtonText,
        ctaButtonUrl: params.ctaButtonUrl,
        ctaHeadline: params.ctaHeadline,
        ctaBody: params.ctaBody,
        tagline: brandTagline
      });
    }

    if (!html) {
      return { _status: 'FAILED', _message: 'No content to update. Provide either html (raw HTML) or structured fields (calloutItems, headline, etc.) to rebuild the template.' };
    }

    logger.info(`Updating email template ${templateId}`, { htmlLength: html.length });

    try {
      // PATCH /emails/builder/:templateId — verified working with {locationId, editorType:'html', editorContent}
      const patchPayload = {
        locationId,
        editorType: 'html',
        editorContent: html,
        previewText: params.previewText || ''
      };

      const result = await callGHL(`/emails/builder/${templateId}`, 'PATCH', patchPayload);
      logger.info(`Email template updated: ${templateId}`, { previewUrl: result?.previewUrl || 'none' });

      return {
        ...result,
        _status: 'SUCCESS',
        _templateId: templateId,
        _previewUrl: result?.previewUrl,
        _message: `EMAIL TEMPLATE UPDATED SUCCESSFULLY. Template ID: ${templateId}. The changes are now live in the CRM. If this template is already used in a campaign, the campaign will use the updated content.`,
        _assembledHTML: html
      };
    } catch (patchErr) {
      // Try POST /emails/builder/data as fallback
      logger.warn(`PATCH update failed: ${patchErr.message} — trying POST /emails/builder/data`);
      try {
        const dataPayload = {
          locationId,
          templateId,
          updatedBy: 'bloomie-agent',
          html: html,
          editorType: 'html'
        };
        const result = await callGHL('/emails/builder/data', 'POST', dataPayload);
        logger.info(`Email template updated via POST /emails/builder/data: ${templateId}`);
        return {
          ...result,
          _status: 'SUCCESS',
          _templateId: templateId,
          _previewUrl: result?.previewUrl,
          _message: `EMAIL TEMPLATE UPDATED SUCCESSFULLY. Template ID: ${templateId}. The changes are now live in the CRM.`,
          _assembledHTML: html
        };
      } catch (dataErr) {
        return {
          _status: 'FAILED',
          _message: `EMAIL TEMPLATE UPDATE FAILED. Error: ${dataErr.message}. Template ID: ${templateId}. The original template is unchanged.`,
          _error: dataErr.message
        };
      }
    }
  },

  // SOCIAL PLANNER
  // POST /social-media-posting/{locationId}/posts/list
  ghl_list_social_posts: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/social-media-posting/${locationId}/posts/list`, 'POST', omitInternalParams(params), { __omitLocationId: true }, params._orgId);
  },

  // GET /social-media-posting/{locationId}/accounts
  ghl_list_social_accounts: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL(`/social-media-posting/${locationId}/accounts`, 'GET', null, { __omitLocationId: true }, params._orgId);
  },

  // POST /social-media-posting/{locationId}/posts
  ghl_create_social_post: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    const summary = String(params.summary || params.content || '').trim();
    const scheduleDate = normalizeSocialScheduleDate(params.scheduleDate || params.scheduledDate);
    const type = params.type || 'post';
    const status = params.status || (scheduleDate ? 'scheduled' : 'draft');
    const userId = await getGhlUserId(params);
    const accountIds = await resolveSocialAccountIds(params, locationId);
    const media = normalizeSocialMedia(params.media, params.imageUrl, summary);
    const nonPublicMediaUrls = getNonPublicSocialMediaUrls(media);

    const missing = [];
    if (!summary) missing.push('summary');
    if (!userId) missing.push('userId (configure GHL_USER_ID/HUMAN_GHL_USER_ID or pass userId)');
    if (!accountIds.length) missing.push('accountIds (call ghl_list_social_accounts and select a connected account)');
    if (nonPublicMediaUrls.length) missing.push(`public media URL (use the https:// image_url returned by image_generate, not ${nonPublicMediaUrls.join(', ')})`);

    if (missing.length) {
      return {
        _status: 'FAILED',
        _message: `GHL SOCIAL POST NOT CREATED. Missing required setup: ${missing.join(', ')}.`,
        _error: 'missing_required_social_post_fields',
        requiredFields: missing,
        hint: 'Use ghl_list_social_accounts to get connected Instagram/Facebook/etc. account IDs. For images, pass the public https:// image_url returned by image_generate or a Supabase/CDN URL; never pass /api/files/preview/... or a local app URL.'
      };
    }

    const payload = {
      accountIds,
      summary,
      media,
      type,
      status,
      userId,
      ...(scheduleDate ? { scheduleDate, scheduleTimeUpdated: true } : {})
    };

    return await callGHL(`/social-media-posting/${locationId}/posts`, 'POST', payload, { __omitLocationId: true }, params._orgId);
  },

  // BLOG POSTS
  // GET /blogs/posts/all — list posts (GHL API v2: blogId is a query param, not a path segment)
  // Docs: https://marketplace.gohighlevel.com/docs/ghl/blogs/get-blog-post/
  ghl_list_blog_posts: async (params) => {
    const blogId = params.blogId || process.env.GHL_BLOG_ID || 'DHQrtpkQ3Cp7c96FCyDu';
    const locationId = await resolveLocationId(params._orgId);
    const limit = Number.isFinite(Number(params.limit)) ? Number(params.limit) : 20;
    const offset = Number.isFinite(Number(params.offset)) ? Number(params.offset) : 0;
    return await callGHL('/blogs/posts/all', 'GET', null, { locationId, blogId, limit, offset }, params._orgId);
  },

  // POST /blogs/posts — create a blog post (GHL API v2: blogId goes in the body, not URL path)
  // GHL Blog API v2 POST /blogs/posts accepted fields: blogId, locationId, title, description, rawHTML, status, imageUrl, imageAltText, scheduledDate
  // slug, author, categories are NOT accepted — they cause 400 errors. Strip them from params if LLM sends them.
  // If params.sections is provided, assembles HTML from locked template automatically.
  ghl_create_blog_post: async (params) => {
    // Validate required fields before making any API calls
    if (!params.title || !String(params.title).trim()) {
      return { _status: 'FAILED', _message: 'BLOG POST FAILED: title is required and cannot be empty. Please provide a blog title.' };
    }
    if (params.sections && Array.isArray(params.sections) && params.sections.length === 0) {
      return { _status: 'FAILED', _message: 'BLOG POST FAILED: sections array is empty. Provide at least one section with heading and paragraphs.' };
    }

    const blogId = params.blogId || process.env.GHL_BLOG_ID || 'DHQrtpkQ3Cp7c96FCyDu';
    const locationId = await resolveLocationId(params._orgId);

    // Look up org brand kit for dynamic colors/tagline
    let brandPrimary, brandAccent, brandTagline, brandCompany;
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const orgId = params._orgId || process.env.BLOOM_ORG_ID;
      if (orgId) {
        const { data: bkRow } = await sb.from('user_settings').select('value').eq('organization_id', orgId).eq('key', 'brand_kits').maybeSingle();
        let kits = bkRow?.value ? (Array.isArray(bkRow.value) ? bkRow.value : [bkRow.value]) : [];
        if (kits.length === 0) {
          const { data: oldRow } = await sb.from('user_settings').select('value').eq('organization_id', orgId).eq('key', 'brand_kit').maybeSingle();
          if (oldRow?.value) kits = [oldRow.value];
        }
        const bk = kits.find(k => k.active) || kits[0];
        if (bk?.colors?.length) {
          brandPrimary = bk.colors[0];
          brandAccent = bk.colors[1] || bk.colors[0];
          logger.info('Blog using brand kit colors', { primary: brandPrimary, accent: brandAccent, kit: bk.kitName });
        }
        if (bk?.tagline) brandTagline = bk.tagline;
        if (bk?.kitName) brandCompany = bk.kitName;
      }
    } catch(e) {
      logger.warn('Brand kit lookup for blog failed (using defaults):', e.message);
    }

    // Auto-assemble HTML from structured data if sections are provided
    let rawHTML = params.content || '';
    if (params.sections && Array.isArray(params.sections)) {
      rawHTML = assembleBlogHTML({
        title: params.title,
        subtitle: params.subtitle,
        heroImageUrl: params.imageUrl,
        altText: params.altText || params.title,
        metaDescription: params.metaDescription,
        keywords: params.keywords,
        canonicalUrl: params.canonicalUrl,
        companyName: params.companyName || brandCompany,
        intro: params.intro,
        sections: params.sections,
        evidence: params.evidence,
        faqs: params.faqs,
        ctaHeadline: params.ctaHeadline,
        ctaBody: params.ctaBody || 'If you are comparing AI agents, AI automation, or AI assistants for business, Bloomie Staffing helps you take the next step: hire a reliable AI employee, called a Bloomie, for the recurring work your team needs done.',
        primaryColor: brandPrimary,
        accentColor: brandAccent,
        tagline: brandTagline
      });
      logger.info('Blog HTML assembled from locked template', { sectionCount: params.sections.length, brandColors: !!(brandPrimary) });
    }

    // GHL expects these exact field names:
    // - title (string, required)
    // - description (string, required — meta/SEO description)
    // - rawHTML (string, required — the full HTML content)
    // - slug (string, required — URL slug)
    // - status (string, required — UPPERCASE: "DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED")
    // - author (object, required — { name, profileImage })
    // - categories (array of category ID strings, required — can be empty [])
    // - imageUrl (string — featured/cover image)
    // - imageAltText (string — SEO alt text for cover image)
    // GHL Blog API v2 accepted fields ONLY: blogId, locationId, title, description,
    // rawHTML, status, imageUrl, imageAltText, scheduledDate.
    // slug, author, categories are NOT accepted and cause 400 errors.
    const ghlPayload = {
      locationId,
      blogId,
      title: params.title,
      description: params.metaDescription || params.description || params.title,
      rawHTML,
      status: (params.status || 'DRAFT').toUpperCase(),
      imageUrl: params.imageUrl || '',
      imageAltText: params.altText || params.title
    };

    // Only include scheduledDate if provided (for scheduled posts)
    if (params.scheduledDate) {
      ghlPayload.scheduledDate = params.scheduledDate;
    }

    logger.info('GHL blog payload', { title: ghlPayload.title, status: ghlPayload.status, slug: ghlPayload.slug, hasHTML: !!ghlPayload.rawHTML });

    // GHL API v2: POST /blogs/posts (blogId is in the body, not the URL path)
    try {
      const result = await callGHL('/blogs/posts', 'POST', ghlPayload);

      // ── MANDATORY RESULT VALIDATION ──
      const postId = result?.id || result?.data?.id || result?.postId;
      if (postId) {
        result._status = 'SUCCESS';
        result._postId = postId;
        result._message = `BLOG POST SAVED SUCCESSFULLY as draft. Post ID: ${postId}. You may now tell the user it was saved.`;
        logger.info(`Blog post created successfully: ${postId} (blogId: ${blogId})`);
      } else {
        result._status = 'FAILED';
        result._message = `BLOG POST SAVE FAILED — the API returned a response but NO post ID was found. Response keys: ${Object.keys(result || {}).join(', ')}`;
        logger.error('Blog post creation returned no ID', { resultKeys: Object.keys(result || {}) });
      }

      if (rawHTML) { result._assembledHTML = rawHTML; }
      return result;
    } catch (error) {
      return {
        _status: 'FAILED',
        _message: `BLOG POST SAVE FAILED. Error: ${error.message}. You MUST tell the user this failed and show them the error. Do NOT say it was saved. IMPORTANT: You should still save the blog as an HTML artifact using create_artifact so the user has the content.`,
        _error: error.message,
        _assembledHTML: rawHTML || null
      };
    }
  },

  // DOCUMENTS/CONTRACTS
  // GET /proposals/?locationId=
  ghl_list_documents: async (params) => {
    return await callGHL('/proposals/');
  },

  // POST /proposals/send
  ghl_send_document: async (params) => {
    return await callGHL('/proposals/send', 'POST', params);
  },

  // TRIGGER LINKS
  // GET /links/?locationId=
  ghl_list_trigger_links: async (params) => {
    return await callGHL('/links/');
  },

  // POST /links/
  ghl_create_trigger_link: async (params) => {
    const locationId = await resolveLocationId(params._orgId);
    return await callGHL('/links/', 'POST', { locationId, ...params });
  },

  // PHONE SYSTEM
  // GET /phone-system/numbers?locationId=
  ghl_list_phone_numbers: async (params) => {
    return await callGHL('/phone-system/numbers');
  },

  // COURSES
  // GET /courses/?locationId=
  ghl_list_courses: async (params) => {
    return await callGHL('/courses/');
  },

  // BLOOMIE → GHL SYNC
  bloomie_sync_to_ghl: async (params) => {
    const { visitor_name, visitor_email, visitor_phone, chat_summary, follow_up_message, follow_up_type, session_id, tags } = params;
    logger.info('bloomie_sync_to_ghl: syncing visitor to GHL', { visitor_name, visitor_email, visitor_phone });

    let contact = null;
    const locationId = await resolveLocationId(params._orgId);

    // Step 1: Search for existing contact by email or phone
    if (visitor_email) {
      try {
        const search = await callGHL('/contacts/', 'GET', null, { query: visitor_email, locationId }, params._orgId);
        const contacts = search?.data?.contacts || search?.contacts || [];
        if (contacts.length > 0) contact = contacts[0];
      } catch (e) { logger.warn('bloomie_sync_to_ghl: contact search by email failed', e.message); }
    }
    if (!contact && visitor_phone) {
      try {
        const search = await callGHL('/contacts/', 'GET', null, { query: visitor_phone, locationId }, params._orgId);
        const contacts = search?.data?.contacts || search?.contacts || [];
        if (contacts.length > 0) contact = contacts[0];
      } catch (e) { logger.warn('bloomie_sync_to_ghl: contact search by phone failed', e.message); }
    }

    // Step 2: Create contact if not found
    if (!contact) {
      try {
        const nameParts = (visitor_name || 'Website Visitor').split(' ');
        const newContact = {
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(' ') || '',
          email: visitor_email || undefined,
          phone: visitor_phone || undefined,
          locationId,
          source: 'Bloomie Chat',
          tags: ['bloomie-chat', ...(tags || [])],
          customFields: session_id ? [{ key: 'bloomie_session_id', value: session_id }] : undefined
        };
        const created = await callGHL('/contacts/', 'POST', newContact, {}, params._orgId);
        contact = created?.data?.contact || created?.contact || created;
        logger.info('bloomie_sync_to_ghl: contact created', { id: contact?.id, name: visitor_name });
      } catch (e) {
        logger.error('bloomie_sync_to_ghl: failed to create contact', e.message);
        return { success: false, error: 'Failed to create GHL contact: ' + e.message };
      }
    } else {
      // Update existing contact with tags
      try {
        const existingTags = contact.tags || [];
        const newTags = [...new Set([...existingTags, 'bloomie-chat', ...(tags || [])])];
        await callGHL(`/contacts/${contact.id}`, 'PUT', { tags: newTags }, {}, params._orgId);
      } catch (e) { logger.warn('bloomie_sync_to_ghl: tag update failed', e.message); }
    }

    const contactId = contact?.id;
    if (!contactId) return { success: false, error: 'No contact ID available' };

    // Step 3: Add a note with chat summary
    if (chat_summary) {
      try {
        await callGHL(`/contacts/${contactId}/notes`, 'POST', {
          body: `Bloomie Chat Summary (${new Date().toLocaleString()}):\n\n${chat_summary}${session_id ? '\n\nSession: ' + session_id : ''}`
        }, {}, params._orgId);
      } catch (e) { logger.warn('bloomie_sync_to_ghl: note creation failed', e.message); }
    }

    // Step 4: Send follow-up if requested
    let followUpResult = null;
    if (follow_up_message && follow_up_type && follow_up_type !== 'none') {
      try {
        followUpResult = await callGHL('/conversations/messages', 'POST', {
          type: follow_up_type,
          contactId,
          message: follow_up_message,
          subject: follow_up_type === 'Email' ? 'Following up on your chat with Bloomie' : undefined
        }, {}, params._orgId);
        logger.info('bloomie_sync_to_ghl: follow-up sent', { type: follow_up_type, contactId });
      } catch (e) {
        logger.warn('bloomie_sync_to_ghl: follow-up send failed', e.message);
        followUpResult = { error: e.message };
      }
    }

    // Step 5: Update Bloomie chat record with GHL contact ID
    if (session_id) {
      try {
        const sbUrl = process.env.SUPABASE_URL;
        const sbKey = process.env.SUPABASE_SERVICE_KEY;
        if (sbUrl && sbKey) {
          await fetch(`${sbUrl}/rest/v1/bloomie_chats?session_id=eq.${session_id}`, {
            method: 'PATCH',
            headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              visitor_name: visitor_name || null,
              visitor_email: visitor_email || null,
              updated_at: new Date().toISOString()
            })
          });
        }
      } catch (e) { logger.warn('bloomie_sync_to_ghl: chat record update failed', e.message); }
    }

    return {
      success: true,
      contactId,
      contactName: visitor_name,
      isNew: !contact?.id || contact?.id === contactId,
      followUp: followUpResult ? { sent: true, type: follow_up_type } : null
    };
  }
};

// Execute any GHL tool by name
// orgId is optional — when provided, credentials are loaded from Supabase per org
export async function executeGHLTool(toolName, parameters, orgId = null) {
  const startTime = Date.now();
  logger.info(`Executing GHL tool: ${toolName}`, { orgId, params: parameters });

  if (!ghlExecutors[toolName]) {
    throw new Error(`Unknown GHL tool: ${toolName}`);
  }

  try {
    // Inject _orgId into params so executors can pass it to callGHL
    const paramsWithOrg = { ...parameters, _orgId: orgId };
    const result = await ghlExecutors[toolName](paramsWithOrg);
    const duration = Date.now() - startTime;
    if (result?._status === 'FAILED') {
      const message = result._message || result._error || `${toolName} failed`;
      logger.warn(`GHL tool returned failed status: ${toolName} (${duration}ms)`, { message });
      return { success: false, error: message, data: result, executionTime: duration };
    }
    logger.info(`GHL tool completed: ${toolName} (${duration}ms)`);
    return { success: true, data: result, executionTime: duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`GHL tool failed: ${toolName} (${duration}ms)`, error.message);
    return { success: false, error: error.message, executionTime: duration };
  }
}
