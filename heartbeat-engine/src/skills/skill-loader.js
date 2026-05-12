// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Skill System — Progressive Disclosure for Sarah
//
// Inspired by Claude's skill system:
// 1. Metadata (name + description) — always in system prompt (~100 words each)
// 2. Full skill body — injected when task matches a skill
// 3. Reference files — loaded on demand (future)
//
// The router classifies a task → skill loader finds matching skill →
// skill content gets injected into the specialist/system prompt
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('skill-loader');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = path.join(__dirname, 'catalog');

// ── Skill Registry ─────────────────────────────────────────────────────────
// Built on startup by reading all .md files in catalog/

let _skills = null;
const _questionLedCache = new Map();

function parseSkillFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    
    // Parse YAML frontmatter
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) return null;
    
    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();
    
    // Simple YAML parsing
    const nameMatch = frontmatter.match(/name:\s*(.+)/);
    if (!nameMatch) return null;
    
    // Handle quoted descriptions (single or double quotes)
    let description = '';
    const descQuotedMatch = frontmatter.match(/description:\s*"([\s\S]*?)"/);
    const descSingleMatch = frontmatter.match(/description:\s*'([\s\S]*?)'/);
    const descPlainMatch = frontmatter.match(/description:\s*([^\n"']+)/);
    
    if (descQuotedMatch) description = descQuotedMatch[1];
    else if (descSingleMatch) description = descSingleMatch[1];
    else if (descPlainMatch) description = descPlainMatch[1];
    
    return {
      name: nameMatch[1].trim(),
      description: description.trim(),
      body,
      filePath,
    };
  } catch (e) {
    logger.warn(`Failed to parse skill file ${filePath}: ${e.message}`);
    return null;
  }
}

function loadSkillCatalog() {
  if (_skills) return _skills;
  
  _skills = [];
  
  try {
    if (!fs.existsSync(CATALOG_DIR)) {
      logger.warn('No skill catalog directory found');
      return _skills;
    }
    
    const files = fs.readdirSync(CATALOG_DIR).filter(f => f.endsWith('.md'));
    
    for (const file of files) {
      const skill = parseSkillFile(path.join(CATALOG_DIR, file));
      if (skill) {
        _skills.push(skill);
        logger.debug(`Loaded skill: ${skill.name}`);
      }
    }
    
    logger.info(`Loaded ${_skills.length} skills: ${_skills.map(s => s.name).join(', ')}`);
  } catch (e) {
    logger.error('Failed to load skill catalog:', e.message);
  }
  
  return _skills;
}

// ── Skill Matching ─────────────────────────────────────────────────────────
// Maps task types (from router) to skill names

const TASK_TO_SKILL_MAP = {
  writing:  ['blog-content'],
  email:    ['email-marketing'],
  coding:   ['website-creation'],
  docx:     ['docx', 'professional-documents'],   // FIX: was 'docx-documents' — file declares name: 'docx'
  crm:      ['ghl-crm'],
  scraping: ['lead-scraper'],
  refund:   ['refund-handler'],
  design:   ['marketing-graphics', 'image-generation'],  // image-generation is the core prompting engine
  research: [],
  data:     [],
  chat:     [],
};

// Additional keyword matching for more specific skill selection
const KEYWORD_SKILL_MAP = [
  { keywords: /\b(blog|article|post|content marketing|seo)\b/i, skill: 'blog-content' },
  { keywords: /\b(email|newsletter|drip|sequence|subject line|sms)\b/i, skill: 'email-marketing' },
  { keywords: /\b(social|instagram|tiktok|facebook|linkedin|twitter|caption|hashtag)\b/i, skill: 'social-media' },
  { keywords: /\b(contact|lead|crm|ghl|pipeline|deal|appointment|invoice|workflow)\b/i, skill: 'ghl-crm' },
  { keywords: /\b(website|landing page|dashboard|component|ui|ux|frontend|html|react|web page|sales page|opt.?in page|mockup)\b/i, skill: 'website-creation' },
  { keywords: /\b(document|report|memo|letter|word doc|docx|proposal|quarterly|grant|sop)\b/i, skill: 'professional-documents' },
  { keywords: /\b(lead|leads|prospect|prospects|scrape|directory|contact list|find emails|build a list|financial advisor|NAPFA|CFP|FINRA|RIA|chamber of commerce|lead generation|lead scraping)\b/i, skill: 'lead-scraper' },
  { keywords: /\b(refund|money back|cancel|cancellation|complaint|dissatisfied|unhappy|not what I paid|doesn't work|doesn't work|want my money|speak to a manager|charged me|billing issue|overcharged|rip.?off|scam|waste of money)\b/i, skill: 'refund-handler' },
  { keywords: /\b(graphic|thumbnail|youtube thumbnail|banner|cover image|cover photo|quote card|ad creative|promo image|social graphic|instagram graphic|carousel design|story graphic|header image|profile banner|pinterest pin|create a graphic|make a graphic|design a post|visual asset|marketing image)\b/i, skill: 'marketing-graphics' },
  { keywords: /\b(flyer|poster|event flyer|promotional flyer|print material|concert flyer|event poster)\b/i, skill: 'flyer-generation' },
  // Orphaned skills — now reachable via keyword matching
  { keywords: /\b(book|novel|manuscript|chapter|ebook|write a book|memoir|nonfiction book|fiction book)\b/i, skill: 'book-writing' },
  { keywords: /\b(pdf|convert to pdf|merge pdf|split pdf|fill pdf|pdf form)\b/i, skill: 'pdf' },
  { keywords: /\b(powerpoint|pptx|slide deck|slides|presentation|pitch deck|keynote)\b/i, skill: 'pptx' },
  { keywords: /\b(excel|xlsx|spreadsheet|workbook|pivot table|vlookup|sheet)\b/i, skill: 'xlsx' },
  { keywords: /\b(generate image|ai image|create image|image prompt|midjourney|dall-?e|stable diffusion|generate a photo|create a photo)\b/i, skill: 'image-generation' },
  { keywords: /\b(schedule|scheduled task|recurring task|automate task|cron|run daily|run weekly|run every)\b/i, skill: 'task-scheduling' },
  { keywords: /\b(draft an email|compose an email|write an email|cold email|outbound email|email template|email copy)\b/i, skill: 'email-creator' },
  { keywords: /\b(elevenlabs|eleven labs|tts|text to speech|voiceover|voice over|audio script|generate audio|narration|ad read|voice id|voice settings)\b/i, skill: 'elevenlabs-audio' },
];

// ── Companion skills — auto-loaded alongside a primary skill ──────────────
// When skill X loads, its companions also load so the agent has full context.
// Example: marketing-graphics needs the core prompting engine from image-generation.
const COMPANION_SKILL_MAP = {
  'marketing-graphics':  ['image-generation'],
  'flyer-generation':    ['image-generation'],
  'website-creation':    ['image-generation'],  // websites need hero images
  'social-media':        ['image-generation'],  // social posts often need graphics
};

/**
 * Find matching skills for a task.
 * Uses task type mapping, keyword matching, AND companion skill loading.
 * Returns array of skill objects (usually 1-3 for complex tasks).
 */
export function findSkills(taskType, instruction = '') {
  const catalog = loadSkillCatalog();
  const matched = new Set();

  // 1. Match by task type
  const taskSkills = TASK_TO_SKILL_MAP[taskType] || [];
  for (const skillName of taskSkills) {
    matched.add(skillName);
  }

  // 2. Match by keywords in instruction (more specific)
  for (const { keywords, skill } of KEYWORD_SKILL_MAP) {
    if (keywords.test(instruction)) {
      matched.add(skill);
    }
  }

  // 3. Load companion skills — if X is matched, also load X's companions
  const companions = new Set();
  for (const name of matched) {
    const deps = COMPANION_SKILL_MAP[name];
    if (deps) {
      for (const dep of deps) companions.add(dep);
    }
  }
  for (const dep of companions) {
    matched.add(dep);
  }

  // Look up full skill objects
  const results = [];
  for (const name of matched) {
    const skill = catalog.find(s => s.name === name);
    if (skill) results.push(skill);
  }

  return results;
}

/**
 * Get skill context to inject into a prompt.
 * Returns a formatted string with skill instructions.
 */
export function getSkillContext(taskType, instruction = '') {
  const skills = findSkills(taskType, instruction);
  
  if (skills.length === 0) return '';
  
  const sections = skills.map(skill => 
    `<skill name="${skill.name}">\n${skill.body}\n</skill>`
  );
  
  logger.info(`Injecting ${skills.length} skill(s): ${skills.map(s => s.name).join(', ')}`);
  
  return `\n\n<available_skills>\nThe following expert knowledge has been loaded for this task. Follow these guidelines:\n${sections.join('\n\n')}\n</available_skills>`;
}

async function getQuestionLedContentSettings(organizationId = null) {
  const defaults = { blog: false, email: false, video: false };
  if (!organizationId || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return defaults;

  const now = Date.now();
  const cached = _questionLedCache.get(organizationId);
  if (cached && now < cached.expiry) return cached.settings;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data, error } = await supabase.from('user_settings')
      .select('value')
      .eq('organization_id', organizationId)
      .eq('key', 'question_led_content')
      .maybeSingle();
    if (error) throw new Error(error.message);

    const stored = data?.value || {};
    const settings = {
      blog: Boolean(stored.blog ?? stored.enabled),
      email: Boolean(stored.email ?? stored.enabled),
      video: Boolean(stored.video)
    };
    _questionLedCache.set(organizationId, { settings, expiry: now + 60_000 });
    return settings;
  } catch (e) {
    logger.warn('Failed to load question-led content setting', { orgId: organizationId, error: e.message });
    _questionLedCache.set(organizationId, { settings: defaults, expiry: now + 15_000 });
    return defaults;
  }
}

function getQuestionLedContentGate(contentType) {
  const label = contentType === 'video' ? 'video script' : contentType;
  return `

<question_led_content_strategy>
This organization has enabled Question-Led Content Strategy for ${label} creation. This is a mandatory gate for this content type.

Do NOT create or publish this ${label} content unless it answers a real question the ideal audience has already asked or the user explicitly provides the source question.

Before drafting, establish and preserve:
1. Exact audience question, in the audience's natural language.
2. Source of the question: Reddit, Quora, Google autocomplete/People Also Ask, Perplexity, YouTube comments, Facebook groups, CRM/GHL conversations, sales calls, support tickets, community posts, or another real audience source.
3. Audience segment and search intent.
4. Direct answer in the first useful paragraph.
5. The next likely question the reader will ask, plus a clear answer to that next question.
6. A natural CTA connected to the question's business problem.

If no real question/source is available, ask for it or research it before writing. Do not fall back to a generic topic calendar when this strategy is enabled for this content type.
</question_led_content_strategy>`;
}

function resolveQuestionLedContentType(taskType, skillNames, instruction = '') {
  if (taskType === 'video' || /\b(video script|reel script|youtube script|shorts script|tiktok script|script for (a )?video|video content)\b/i.test(instruction)) {
    return 'video';
  }
  if (taskType === 'email' || skillNames.some(name => ['email-marketing', 'email-creator'].includes(name))) {
    return 'email';
  }
  if (skillNames.includes('blog-content')) {
    return 'blog';
  }
  return null;
}

export async function getSkillContextForOrg(taskType, instruction = '', organizationId = null) {
  const skills = findSkills(taskType, instruction).map(skill => skill.name);
  const contentType = resolveQuestionLedContentType(taskType, skills, instruction);
  const context = getSkillContext(taskType, instruction);
  if (!contentType) return context;

  const settings = await getQuestionLedContentSettings(organizationId);
  return settings[contentType] ? context + getQuestionLedContentGate(contentType) : context;
}

export function invalidateQuestionLedContentCache(organizationId = null) {
  if (organizationId) _questionLedCache.delete(organizationId);
  else _questionLedCache.clear();
}

/**
 * Get the skill catalog metadata (for system prompt / dashboard display).
 * Returns compact descriptions — always in context.
 */
export function getSkillCatalogSummary() {
  const catalog = loadSkillCatalog();
  
  if (catalog.length === 0) return '';
  
  const lines = catalog.map(s => `- **${s.name}**: ${s.description}`);
  
  return `\n\nYou have access to specialized skills that enhance your capabilities:\n${lines.join('\n')}\nWhen a task matches a skill, expert guidelines will be provided to help you produce the best possible output.`;
}

/**
 * Get all skills (for API/dashboard)
 */
export function getAllSkills() {
  return loadSkillCatalog().map(s => ({
    name: s.name,
    description: s.description,
  }));
}

export default { findSkills, getSkillContext, getSkillContextForOrg, getSkillCatalogSummary, getAllSkills };
