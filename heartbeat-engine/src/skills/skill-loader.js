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
  docx:     ['docx-documents', 'professional-documents'],
  crm:      ['ghl-crm'],
  scraping: ['lead-scraper'],
  refund:   ['refund-handler'],
  design:   ['marketing-graphics'],
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
];

/**
 * Find matching skills for a task.
 * Uses both task type mapping AND keyword matching.
 * Returns array of skill objects (usually 1, occasionally 2 for complex tasks).
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

export default { findSkills, getSkillContext, getSkillCatalogSummary, getAllSkills };
