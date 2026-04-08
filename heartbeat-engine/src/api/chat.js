// BLOOM Chat API — Model-Agnostic via Unified LLM Client
// Supports: Claude, GPT-4o, Gemini, DeepSeek with automatic failover
import express from 'express';
import mammoth from 'mammoth';
import Anthropic from '@anthropic-ai/sdk';
import { getLLMClient, detectProvider } from '../llm/unified-client.js';
import { createLogger } from '../logging/logger.js';

// Safe skill import — don't crash the whole chat if skills fail to load
let getSkillCatalogSummary = () => '';
try {
  const skillMod = await import('../skills/skill-loader.js');
  getSkillCatalogSummary = skillMod.getSkillCatalogSummary;
} catch (e) {
  console.warn('Skills failed to load (non-critical):', e.message);
}
import { loadAgentConfig } from '../config/agent-profile.js';
import { generateSpeech } from '../tools/tts.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';


const router = express.Router();
const logger = createLogger('chat-api');
// Default Anthropic client (platform key) — agents with their own key get a per-request client
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Get Anthropic client for a specific agent config — uses agent's own key if set, otherwise platform key
function getAnthropicClient(agentConfig) {
  // Only return a dedicated Anthropic client if the agent has its OWN key AND
  // the active provider is Anthropic. Otherwise return null so callers use the unified client.
  const agentKey = agentConfig?.anthropicApiKey;
  if (agentKey && agentKey !== process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: agentKey });
  }
  return anthropic;
}

// In-memory task progress keyed by sessionId (SSE pushes to Desktop)
// Exported so dashboard.js can serve it via /api/dashboard/agentic-executions
export const taskProgress = new Map();
// Detailed thinking log — stores LLM reasoning, tool calls, and results per session
// Each entry: { events: [{type, timestamp, ...data}], updatedAt }
export const thinkingLog = new Map();

// Helper: append a thinking event for a session
function appendThinking(sessionId, event) {
  const key = sessionId || 'default';
  const log = thinkingLog.get(key) || { events: [], updatedAt: 0 };
  log.events.push({ ...event, timestamp: Date.now() });
  // Keep last 100 events to prevent memory bloat
  if (log.events.length > 100) log.events = log.events.slice(-100);
  log.updatedAt = Date.now();
  thinkingLog.set(key, log);
}


// ── AUTO-CLEANUP: Purge stale "Planning steps..." entries every 60 seconds ──
// Prevents orphaned entries from piling up when API calls fail before cleanup
setInterval(() => {
  const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
  const now = Date.now();
  for (const [key, entry] of taskProgress) {
    const age = now - (entry.updatedAt || 0);
    const isStalePassive = entry.todos?.length === 1
      && entry.todos[0].activeForm === 'Planning steps...'
      && age > STALE_THRESHOLD_MS;
    if (isStalePassive) {
      taskProgress.delete(key);
      console.log(`[cleanup] Removed stale passive tracking entry: ${key} (age: ${Math.round(age/1000)}s)`);
    }
  }
}, 60_000);

// Extract user ID from Supabase JWT — falls back to env var during transition
async function getUserId(req) {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // Decode JWT payload (Supabase JWTs are standard base64url)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (payload.sub) return payload.sub;
    }
  } catch (e) {
    // Fall through to env var fallback
  }
  return process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
}


// SYSTEM PROMPT — goes directly into API "system" parameter
function buildSystemPrompt(agentConfig) {
  const operatorName = agentConfig?.humanContact?.name || 'your operator';
  const operatorFirstName = operatorName.split(' ')[0];

  const identityBlock = agentConfig?.standingInstructions
    ? agentConfig.standingInstructions
    : `You are Sarah Rodriguez, Content & Digital Marketing Executive at BLOOM Ecosystem.`;

  // BASE PROMPT — Slim, frozen, always cached (~3,000 tokens)
  // Dynamic injections (task-specific, investigation wrapper) are added
  // in chatWithAgent() via getTaskInjection() and INVESTIGATION_WRAPPER.
  return `${identityBlock}
OPERATOR: ${operatorName} | BLOOMIE AGENT

You are an autonomous AI employee — you plan, execute, and verify tasks.
You don't explain what you're going to do. You do it, verify it worked, then report.

════════════════════════════════════════
COMMUNICATION
════════════════════════════════════════
- Match the user's energy. Short question = short answer. Casual = casual.
- Write like a human in chat. No headers or bullets in conversational replies.
- No filler openers ("Great question!", "Certainly!", "Of course!").
- NEVER type clarifying questions as text. ALWAYS use bloom_clarify tool.
  The user sees bloom_clarify as interactive buttons — text questions are broken UX.

════════════════════════════════════════
EXECUTION — 4 NON-NEGOTIABLE RULES
════════════════════════════════════════
1. CLARIFY FIRST: For any ambiguous task, call bloom_clarify before doing anything.
   One focused question, 2–4 clickable options. Wait for answer before proceeding.
   ALWAYS clarify: content type/tone/audience, which contact, which record, missing WHO/WHAT/HOW/WHERE.
   SKIP clarification only: 100% unambiguous request, single trivial lookup, pure conversation.

2. PLAN BEFORE EXECUTING: Call task_progress with ALL steps before touching any tool.
   Every step needs: content (imperative), activeForm (present continuous),
   success_criteria (concrete), verification_method (api_check/result_check/llm_judgment).
   Skip only: pure conversation with zero tool calls, or single trivial one-shot action.

3. VERIFY EACH STEP: After every tool call, confirm it actually worked before moving on.
   - api_check: query the system to confirm the change exists
   - result_check: inspect the return value for expected IDs/success flags
   - llm_judgment: evaluate content against success_criteria
   NEVER mark "completed" if the tool returned an error or you cannot confirm success.
   If a step fails twice → ESCALATE with the exact error. Never retry silently forever.

4. DELIVER WITH EVIDENCE: Final message must include:
   - The inlineChecklist from your last task_progress call
   - Every file via <!-- file:filename.ext --> hidden tag (MANDATORY — without this the user can't see your work)
   - A natural summary of what you built (never mention filenames in visible text)

════════════════════════════════════════
ERROR RECOVERY
════════════════════════════════════════
- Tool fails once → retry with adjusted parameters
- Tool fails twice → try a different approach or alternative tool
- Truly blocked → report the EXACT error message (never vague language)
- Internal errors (skill failures, tool errors) → NEVER expose to user. Fix silently.
- Never brute-force the same failing approach. Consider alternatives first.

════════════════════════════════════════
SKILLS — LOAD BEFORE CONTENT WORK
════════════════════════════════════════
Try to load the relevant skill first. If it fails → proceed silently. Never tell the user.
website-creation | docx | pptx | pdf | xlsx | flyer-generation | image-generation | marketing-graphics
blog-content | email-marketing | email-creator | task-scheduling | social-media
ghl-crm | lead-scraper | book-writing | professional-documents | refund-handler

Loading a skill improves quality. Skill failure NEVER blocks task completion.
${getSkillCatalogSummary()}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK INJECTIONS — Loaded per task type into messages array (not system prompt)
// Modeled after Anthropic's <system-reminder> architecture in Claude Code.
// These keep the base prompt frozen (cache-friendly) while adding targeted context.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TASK INJECTIONS — Provider-native task-specific behavioral contracts.
// Each model gets instructions written in ITS language:
//   Claude  → XML <system-reminder> tags (native format)
//   Gemini  → Flat numbered rules (no XML)
//   GPT     → Direct imperative rules (no XML)
//   DeepSeek → Typed constraint comments (no XML)
// ═══════════════════════════════════════════════════════════════════════════

const TASK_INJECTION_SETS = {

  scheduling: {
    anthropic: `<system-reminder>
TASK MODE: SCHEDULING
These instructions OVERRIDE default behavior for this task.

You are scheduling a recurring autonomous task. Before creating it:
1. Confirm the EXACT instruction text the task will execute on each run
2. Confirm frequency (daily / weekly / monthly / custom)
3. Confirm run time (default 09:00 if not specified)

After bloom_schedule_task returns:
- Inspect the result for task_id and next_run_at — if absent, the task was NOT created
- Query scheduled_tasks to VERIFY the task exists with correct parameters
- NEVER confirm task created unless tool returned a task_id and you can verify it exists
- Report: task name, frequency, next_run_at in your delivery message
</system-reminder>`,
    gemini: `TASK MODE: SCHEDULING
Rules that override your default behavior for this task:
1. Before creating: confirm the exact instruction text, frequency (daily/weekly/monthly), and run time (default 09:00).
2. After bloom_schedule_task returns: check result for task_id and next_run_at.
3. If task_id is missing from the result, the task was NOT created. Do not report success.
4. Query scheduled_tasks to verify the task exists with the correct parameters.
5. Report back: task name, frequency, and next_run_at.`,
    openai: `TASK MODE: SCHEDULING
Override rules for this task:
1. Before creating: confirm exact instruction text, frequency, and run time (default 09:00).
2. After bloom_schedule_task: check result for task_id and next_run_at.
3. No task_id in result = task was NOT created. Do not claim success.
4. Verify the task exists by querying scheduled_tasks.
5. Deliver: task name, frequency, next_run_at.`,
    deepseek: `// TASK MODE: SCHEDULING
// Override constraints for this task:
// 1. Confirm before creating: exact instruction text, frequency, run time (default 09:00).
// 2. After bloom_schedule_task: result must contain task_id and next_run_at.
// 3. Missing task_id = task NOT created. Do not report success.
// 4. Verify with scheduled_tasks query.
// 5. Report: task name, frequency, next_run_at.`,
  },

  content_creation: {
    anthropic: `<system-reminder>
TASK MODE: CONTENT CREATION
These instructions OVERRIDE default behavior for this task.

Before generating content:
1. Load the appropriate skill FIRST — do NOT skip this
2. If skill fails → proceed silently, never tell the user

After generating:
- Images: verify the returned URL is a real, non-placeholder URL (starts with https://)
- Documents: verify file was saved — check artifact ID or storage confirmation in result
- Web pages: verify HTML is complete — check that </html> tag is present in result
- NEVER deliver a URL you haven't confirmed exists in the tool result
- NEVER deliver truncated content — if result is cut off, regenerate before delivering
- NEVER include <!-- file:filename.ext --> unless the file save tool confirmed success
</system-reminder>`,
    gemini: `TASK MODE: CONTENT CREATION
Rules that override your default behavior:
1. Load the appropriate skill first using load_skill. If it fails, proceed silently.
2. After image generation: confirm the URL in the result starts with https://. If not, do not deliver it.
3. After document save: confirm artifact ID or success flag is in the result.
4. After HTML generation: confirm the result contains </html>. Truncated HTML is a failure.
5. Never include file references unless the save tool returned success: true and an artifact ID.
6. Never deliver truncated content. Regenerate if the result was cut off.`,
    openai: `TASK MODE: CONTENT CREATION
Override rules for this task:
1. Load the matching skill first (load_skill). Silent failure — never tell the user.
2. Image URL must start with https:// in the tool result. Do not invent URLs.
3. Document: artifact ID must be in the result. No ID = not saved.
4. HTML: result must contain </html>. Missing = truncated = failure.
5. No file references unless save tool returned success:true + artifact ID.
6. Do not deliver partial content. Regenerate if cut off.`,
    deepseek: `// TASK MODE: CONTENT CREATION
// Override constraints:
// 1. Call load_skill first. If it fails, proceed silently without telling user.
// 2. Image URL: must start with https:// in tool result. Never fabricate.
// 3. Document: result must contain artifact_id. No artifact_id = not saved.
// 4. HTML: result must contain </html>. Missing closing tag = truncation = failure.
// 5. File references only when save result has success:true AND artifact_id.
// 6. Regenerate if content is cut off. Never deliver partial output.`,
  },

  crm_operations: {
    anthropic: `<system-reminder>
TASK MODE: CRM OPERATIONS
These instructions OVERRIDE default behavior for this task.

For every CRM write operation (create, update, send message):
1. Before writing: search for the contact first — confirm they exist
2. After writing: query the contact again to confirm the change persisted
3. For messages: confirm message_id was returned — HTTP 200 alone is NOT confirmation
4. NEVER report "message sent" unless ghl_send_message returned a message ID
5. NEVER report "contact updated" unless ghl_get_contact confirms the new values

If a contact is not found:
- Use bloom_clarify to confirm intent before creating a new record
- Do NOT silently create duplicate contacts
</system-reminder>`,
    gemini: `TASK MODE: CRM OPERATIONS
Rules that override your default behavior for every CRM write:
1. Before writing: search for the contact first. Confirm they exist before any update.
2. After writing: query the contact again to confirm the change actually persisted.
3. For messages: confirm message_id is in the result. HTTP 200 is not confirmation of delivery.
4. Do not report "message sent" unless ghl_send_message returned a message_id.
5. Do not report "contact updated" unless ghl_get_contact confirms the new values.
6. If contact not found: use bloom_clarify before creating. Never silently create duplicates.`,
    openai: `TASK MODE: CRM OPERATIONS
Override rules for every CRM write operation:
1. Search first. Confirm contact exists before any create/update/send.
2. After write: re-query to confirm the change persisted in the system.
3. Messages require message_id in result. HTTP 200 alone is not enough.
4. No "message sent" claim without message_id. No "contact updated" without re-query.
5. Contact not found: use bloom_clarify before creating. No silent duplicates.`,
    deepseek: `// TASK MODE: CRM OPERATIONS
// Override constraints for every CRM write:
// 1. Search before writing. Contact must exist before create/update/send.
// 2. After write: re-query to confirm change persisted.
// 3. Messages: result must contain message_id. HTTP 200 is not delivery confirmation.
// 4. No "sent" claim without message_id. No "updated" claim without re-query confirmation.
// 5. Contact not found: call bloom_clarify. Never silently create duplicates.`,
  },

  file_operations: {
    anthropic: `<system-reminder>
TASK MODE: FILE / DOCUMENT OPERATIONS
These instructions OVERRIDE default behavior for this task.

For every file you create or modify:
1. After saving: check the tool result for a non-null artifact ID or success flag
2. For HTML files: verify </html> closing tag is present — truncation is a real failure
3. For docx/pptx/xlsx: confirm the artifact ID was returned by the save tool
4. For edits: verify the edited content matches what was requested — spot-check key changes

NEVER include <!-- file:filename.ext --> in your message unless:
- The file save tool returned success: true AND an artifact ID or path
- The file content is COMPLETE (not a partial draft)
If either condition is not met, fix it silently before delivering.
</system-reminder>`,
    gemini: `TASK MODE: FILE / DOCUMENT OPERATIONS
Rules that override your default behavior for every file operation:
1. After saving: check the result for artifact ID or success flag. Missing = not saved.
2. HTML files: confirm </html> is present in the result. Missing closing tag = truncation = failure.
3. docx/pptx/xlsx: artifact ID must be in the result. No ID = not saved.
4. Edits: spot-check that the edited content matches what was requested before delivering.
5. File references (<!-- file: -->) only when: result has success:true AND artifact ID AND content is complete.`,
    openai: `TASK MODE: FILE / DOCUMENT OPERATIONS
Override rules for every file operation:
1. After save: result must have artifact ID or success:true. Missing = failed save.
2. HTML: </html> must be in result. Missing = truncated = failure. Regenerate.
3. docx/pptx/xlsx: artifact ID required. No ID = not saved.
4. Edits: verify change matches request before marking done.
5. File references only with: success:true + artifact ID + complete content.`,
    deepseek: `// TASK MODE: FILE / DOCUMENT OPERATIONS
// Override constraints for every file operation:
// 1. After save: result must contain artifact_id or success:true. Missing = failed.
// 2. HTML: result must contain </html>. Missing = truncated. Regenerate before delivering.
// 3. docx/pptx/xlsx: artifact_id required in result.
// 4. Edits: verify the changed content matches the request.
// 5. File references only when: success:true AND artifact_id AND content complete.`,
  },

  web_research: {
    anthropic: `<system-reminder>
TASK MODE: WEB RESEARCH / INFORMATION LOOKUP
These instructions OVERRIDE default behavior for this task.

For every claim that requires external verification:
1. Use brave_search or fetch_url to find the source BEFORE stating the fact
2. Never state a URL as real unless you fetched it and it returned valid content
3. Never fabricate statistics, prices, contact info, or dates
4. If you cannot verify a claim via search, say "I could not confirm this" — never guess

After research:
- List your sources explicitly in your delivery
- Flag any claims you could not independently verify with "(unverified)"
- NEVER present inference or assumption as confirmed fact
</system-reminder>`,
    gemini: `TASK MODE: WEB RESEARCH
Rules that override your default behavior:
1. For every factual claim: use brave_search or fetch_url to find the source before stating it.
2. Do not state a URL as real unless you fetched it and it returned valid content.
3. Do not fabricate statistics, prices, contact info, or dates.
4. If a claim cannot be verified via search: say "I could not confirm this." Do not guess.
5. In your response: list sources explicitly. Mark unverified claims with (unverified).`,
    openai: `TASK MODE: WEB RESEARCH
Override rules for this task:
1. Every factual claim needs a source. Use brave_search or fetch_url first.
2. URLs must be fetched and return valid content before you state them as real.
3. No fabricated stats, prices, contact info, or dates.
4. Unverifiable claim = say "I could not confirm this." Never guess.
5. Response must include: explicit sources + (unverified) tags on anything not confirmed.`,
    deepseek: `// TASK MODE: WEB RESEARCH
// Override constraints:
// 1. Every factual claim requires a source. Call brave_search or fetch_url first.
// 2. Only state a URL as real after fetching it and confirming valid content in the result.
// 3. Never fabricate statistics, prices, contact info, or dates.
// 4. Unverifiable claim: output "I could not confirm this." Never guess.
// 5. Response must list sources explicitly. Tag unconfirmed claims with (unverified).`,
  },
};

// Returns the provider-native injection for a given task type
function getTaskInjection(taskType, provider) {
  const set = TASK_INJECTION_SETS[taskType];
  if (!set) return null;
  return set[provider] || set.anthropic; // fallback to Claude version
}

// Keep detectTaskType return value compatible — same keys as before
const TASK_INJECTIONS = TASK_INJECTION_SETS; // backward compat alias (not used externally)

// ═══════════════════════════════════════════════════════════════════════════
// INVESTIGATION WRAPPER — Injected after every tool-result turn
// Forces Sarah to read actual tool results before claiming success.
// This is the #1 fix for false completions and hallucinated confirmations.
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// INVESTIGATION WRAPPER — Provider-native. Injected after every tool result batch.
// Forces model to read actual results before claiming success.
// ═══════════════════════════════════════════════════════════════════════════
const INVESTIGATION_WRAPPERS = {

  // Claude: XML system-reminder is the native format
  anthropic: `<system-reminder>
BEFORE YOU RESPOND — READ YOUR TOOL RESULTS FIRST.

1. READ each result carefully.
   - Did it return success: true — or an error field?
   - Does the data match what you expected (correct IDs, correct fields)?
   - Are there null values, empty arrays, or HTTP error codes?

2. NEVER claim success if the tool returned an error.
   - error: "..." → FAILED. Do not report it as done.
   - success: false → do NOT mark the step completed. Retry or escalate.
   - HTTP 4xx or 5xx → the API rejected your request.

3. NEVER invent data.
   - No URL in result → you have no URL.
   - No ID in result → record may not exist.
   - No message_id → message may not have sent.

4. If step failed: retry once. If it fails again → report the exact error.
   NEVER silently mark a failed step as completed.
</system-reminder>`,

  // Gemini: flat numbered rules, no XML
  gemini: `TOOL RESULT REVIEW — required before responding:
1. Read every tool result field. Check success, error, IDs, and data values.
2. success: false or any error field = the operation FAILED. Do not report it as done.
3. HTTP 4xx or 5xx in the result = the API rejected the request. Do not proceed as successful.
4. No URL in result = you have no URL. Do not fabricate one.
5. No ID in result = the record may not exist. Do not report it as saved.
6. If a step failed: retry once with corrected parameters. If still failing, report the exact error.
Do not mark any step complete without verifying the tool result confirms it.`,

  // GPT: direct rules
  openai: `TOOL RESULT CHECK — do this before responding:
1. Read each tool result. Check: success field, error field, returned IDs, data values.
2. error field or success:false = operation failed. Do not report it as done.
3. HTTP 4xx/5xx = API rejected the request.
4. Missing URL = no URL. Missing ID = record may not exist. Missing message_id = not sent.
5. Failed step: retry once. Still failing: report the exact error text.
Never mark a step complete without confirming the tool result.`,

  // DeepSeek: typed constraint style
  deepseek: `// TOOL RESULT VERIFICATION (required before responding):
// 1. Read every field in each tool result.
// 2. If result.success === false or result.error exists: operation FAILED. Do not report done.
// 3. HTTP 4xx or 5xx status: API rejected. Do not proceed as successful.
// 4. No URL in result: do not fabricate. No ID: record may not exist. No message_id: not sent.
// 5. Failed step: retry once with corrected params. If still failing: report exact error.
// Never mark a step complete without result confirmation.`,
};

// Returns the provider-native investigation wrapper
function getInvestigationWrapper(provider) {
  return INVESTIGATION_WRAPPERS[provider] || INVESTIGATION_WRAPPERS.anthropic;
}

// Keep a default export for the single injection point that doesn't know provider yet
// This gets replaced at injection time with the provider-native version
const INVESTIGATION_WRAPPER = INVESTIGATION_WRAPPERS.anthropic; // fallback — overridden at call site

// ═══════════════════════════════════════════════════════════════════════════
// TASK INJECTION HELPER — Detects task type from user message
// ═══════════════════════════════════════════════════════════════════════════
// ── FUZZY NORMALIZE — fix common misspellings before keyword detection ────────
// Covers the most common intent-preserving misspellings for BLOOM business keywords.
// Uses simple string replacement, not a full fuzzy library — fast and predictable.
function normalizeForDetection(raw) {
  return raw
    // blog misspellings
    .replace(/\bblgo\b/g, 'blog').replace(/\bblog\b/g, 'blog')
    .replace(/\bboge\b/g, 'blog').replace(/\bbloog\b/g, 'blog')
    // website / webpage
    .replace(/\bwebsiet\b/g, 'website').replace(/\bwebsiet\b/g, 'website')
    .replace(/\bwbesite\b/g, 'website').replace(/\bwebsit\b/g, 'website')
    .replace(/\bwebsiet\b/g, 'website').replace(/\bwebiste\b/g, 'website')
    // create / cerate / craete
    .replace(/\bcerate\b/g, 'create').replace(/\bcreae\b/g, 'create')
    .replace(/\bcraete\b/g, 'create').replace(/\bcreat\b/g, 'create')
    .replace(/\bcreatea\b/g, 'create').replace(/\bcrreate\b/g, 'create')
    // write / wirte / wrtie
    .replace(/\bwirte\b/g, 'write').replace(/\bwrtie\b/g, 'write')
    .replace(/\bwirte\b/g, 'write').replace(/\bwrie\b/g, 'write')
    // schedule / shedule / schedul
    .replace(/\bshedule\b/g, 'schedule').replace(/\bscheduel\b/g, 'schedule')
    .replace(/\bschedul\b/g, 'schedule').replace(/\bschdule\b/g, 'schedule')
    .replace(/\bscheudule\b/g, 'schedule').replace(/\bschedual\b/g, 'schedule')
    // message / messge / mesage
    .replace(/\bmessge\b/g, 'message').replace(/\bmesage\b/g, 'message')
    .replace(/\bmeesage\b/g, 'message').replace(/\bmsesage\b/g, 'message')
    // contact / contcat / cntact
    .replace(/\bcontcat\b/g, 'contact').replace(/\bcntact\b/g, 'contact')
    .replace(/\bcontact\b/g, 'contact').replace(/\bcotnact\b/g, 'contact')
    // email / emial / emal
    .replace(/\bemial\b/g, 'email').replace(/\bemal\b/g, 'email')
    .replace(/\bemaiel\b/g, 'email').replace(/\bemali\b/g, 'email')
    // image / iamge / imgae
    .replace(/\biamge\b/g, 'image').replace(/\bimgae\b/g, 'image')
    .replace(/\bimge\b/g, 'image').replace(/\biamge\b/g, 'image')
    // design / desgin / deisng
    .replace(/\bdesgin\b/g, 'design').replace(/\bdeisng\b/g, 'design')
    .replace(/\bdesig\b/g, 'design').replace(/\bdesgin\b/g, 'design')
    // document / docuemnt / documnet
    .replace(/\bdocuemnt\b/g, 'document').replace(/\bdocumnet\b/g, 'document')
    .replace(/\bdocumant\b/g, 'document').replace(/\bdocuement\b/g, 'document')
    // update / updaet / updte
    .replace(/\bupdaet\b/g, 'update').replace(/\bupdte\b/g, 'update')
    .replace(/\bupdarte\b/g, 'update')
    // search / serach / seach
    .replace(/\bserach\b/g, 'search').replace(/\bseach\b/g, 'search')
    .replace(/\bsearch\b/g, 'search').replace(/\bserahc\b/g, 'search')
    // send / snde / sned
    .replace(/\bsnde\b/g, 'send').replace(/\bsned\b/g, 'send')
    .replace(/\bsned\b/g, 'send')
    // text (as in text message) — tect / textt
    .replace(/\btect\b/g, 'text').replace(/\btextt\b/g, 'text')
    // call — cal / calll
    .replace(/\bcalll\b/g, 'call').replace(/\bcal\b/g, 'call')
    // content — conetnt / contet
    .replace(/\bconetnt\b/g, 'content').replace(/\bcontet\b/g, 'content')
    // social — socail / soical
    .replace(/\bsocail\b/g, 'social').replace(/\bsoical\b/g, 'social')
    // flyer — flier is actually correct alternate spelling, keep both
    .replace(/\bflier\b/g, 'flyer')
    // landing page — laning page / landng page
    .replace(/\blaning page\b/g, 'landing page').replace(/\blandng page\b/g, 'landing page')
    // replace — replce / repalce
    .replace(/\breplce\b/g, 'replace').replace(/\brepalce\b/g, 'replace')
    // upload — uplaod / uplod
    .replace(/\buplaod\b/g, 'upload').replace(/\buplod\b/g, 'upload')
    // download — downlod / downlaod
    .replace(/\bdownlod\b/g, 'download').replace(/\bdownlaod\b/g, 'download');
}

function detectTaskType(userMessage) {
  const raw = typeof userMessage === 'string'
    ? userMessage.toLowerCase()
    : (Array.isArray(userMessage)
        ? userMessage.filter(b => b.type === 'text').map(b => b.text).join(' ').toLowerCase()
        : '');

  // Apply fuzzy normalization to catch misspellings before keyword matching
  const msg = normalizeForDetection(raw);

  // SCHEDULING — checked first: very specific trigger words, unlikely to conflict
  if (/\b(schedule|recurring|every day|every week|every month|run daily|run weekly|automate|set up a task|automatically|on a schedule|on schedule|repeat|repeated|interval)\b/.test(msg)) return 'scheduling';

  // WEB RESEARCH — checked before crm so "what is the best CRM" → web_research
  if (/\b(search|research|find|look up|what is|who is|latest|current|news|price|how much|compare|competitor|benchmark|statistics|stats|trends)\b/.test(msg)) return 'web_research';

  // CRM / COMMUNICATION — checked before file so "email my client the doc" → crm
  if (/\b(contact|crm|lead|prospect|outreach|send message|send email|follow.?up|message|sms|text|call|phone|invoice|notify|reply to|new inquiry|pipeline|tag|unsubscribe|opt.?out|conversation|inbox|respond|responded|response|replied|reply|client said|they said|they replied|heard back|waiting on|waiting for)\b/.test(msg)) return 'crm_operations';

  // FILE OPERATIONS — after crm
  if (/\b(file|document|doc|pdf|slide|spreadsheet|xlsx|word|download|upload|attachment|export|import|csv|template)\b/.test(msg)) return 'file_operations';

  // CONTENT CREATION — includes design edits
  if (/\b(write|create|generate|design|build|make|draft|produce|publish|post|blog|email|website|landing page|image|flyer|social|caption|script|copy|content|article|ad|advertisement|banner|thumbnail|font|color|colour|style|css|logo|header|footer|button|layout|replace|swap|resize|edit|update|change|refresh|rebrand|redesign)\b/.test(msg)) return 'content_creation';

  // No task type — no injection. Safe: model uses full base system prompt.
  return null;
}


// ═══════════════════════════════════════════════════════════════════════════
// MODEL ADAPTATION BLOCKS — Provider-specific behavioral nudges
// Injected at runtime based on the active provider.
// Keeps the base prompt model-agnostic while fixing known quirks per model.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// MODEL ADAPTATIONS — Provider-native behavioral nudges.
// Each model gets its own language — no XML for non-Claude models.
// Injected into the last user message when no task injection is active.
// ═══════════════════════════════════════════════════════════════════════════

const MODEL_ADAPTATIONS = {

  // Claude: native XML format — this is what Claude was trained on.
  // Keep XML tags. Claude parses these as structured directives.
  anthropic: `<system-reminder>
You are running on Anthropic Claude with full native tool support.
- Call tools directly when needed. Read every tool result before responding.
- Never assume a tool succeeded — check the result fields.
- After each tool result batch, verify success before marking any step complete.
</system-reminder>`,

  // Gemini: flat prose, no XML. Gemini responds to imperative numbered lists.
  // XML tags are treated as literal text and confuse the response format.
  gemini: `OPERATIONAL NOTES (Gemini):
1. Call tools directly when needed. Do not narrate what you are about to do.
2. Never write "I will now call X" — just call it.
3. After every tool result, read the actual JSON fields returned. Do not assume success.
4. If a tool returns an error field or success: false, treat it as a failure. Do not proceed.
5. Keep responses concise. Do not explain your process — deliver results.
6. For task_progress: always include the COMPLETE todos array, not just the changed item.`,

  // GPT-4o: direct, role-framed instructions. GPT responds to clear rules over XML.
  // Numbered rules work better than prose paragraphs for GPT behavioral nudges.
  openai: `OPERATIONAL NOTES (GPT):
1. Execute tasks directly. Act before you explain.
2. Call tools immediately when needed. No preamble like "I will now...".
3. If a tool call fails, report the exact error text from the result. Do not soften it.
4. For task_progress: send the COMPLETE todos array on every call. Never partial.
5. Do not add commentary after completing steps. Wait until all steps are verified done.`,

  // DeepSeek: TypeScript-style rules work best — DeepSeek was trained heavily on code.
  // Prose rules get ignored; typed constraints are respected.
  deepseek: `// OPERATIONAL CONSTRAINTS (DeepSeek)
// These rules apply to every tool call and response in this session:
// 1. Tool arguments must be valid JSON — check that all strings are quoted and escaped.
// 2. Include ALL required fields in tool arguments. Never truncate.
// 3. On multi-step tasks: re-read the original request before each new step.
// 4. After every tool result: extract the specific field values you need.
//    Check for error fields first. Do not assume success from HTTP 200 alone.
// 5. If repeating the same tool call, stop and try a different approach or report failure.`,
};

function getModelAdaptation(provider) {
  return MODEL_ADAPTATIONS[provider] || MODEL_ADAPTATIONS.anthropic;
}


// TOOL DEFINITIONS — Full suite available to Sarah
const _ALL_TOOLS = [
  // ── CONTACTS ──────────────────────────────────────────────────────────────
  {
    name: "ghl_search_contacts",
    description: "Search for contacts in BLOOM CRM by name, email, or phone.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term - name, email, or phone" },
        limit: { type: "number", description: "Max results (default 20)" }
      },
      required: ["query"]
    }
  },
  {
    name: "ghl_get_contact",
    description: "Get full details for a contact by their ID.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "BLOOM CRM contact ID" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_contact",
    description: "Create a new contact in BLOOM CRM.",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string" }, lastName: { type: "string" },
        email: { type: "string" }, phone: { type: "string" },
        address1: { type: "string" }, city: { type: "string" },
        state: { type: "string" }, postalCode: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["firstName"]
    }
  },
  {
    name: "ghl_update_contact",
    description: "Update a contact's information.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, firstName: { type: "string" },
        lastName: { type: "string" }, email: { type: "string" },
        phone: { type: "string" }, tags: { type: "array", items: { type: "string" } }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_delete_contact",
    description: "Delete a contact from BLOOM CRM. Use with caution.",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_add_contact_tag",
    description: "Add tags to a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["contactId", "tags"]
    }
  },
  {
    name: "ghl_remove_contact_tag",
    description: "Remove tags from a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["contactId", "tags"]
    }
  },

  // ── NOTES & TASKS ─────────────────────────────────────────────────────────
  {
    name: "ghl_get_notes",
    description: "Get notes for a contact.",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_note",
    description: "Add a note to a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        body: { type: "string", description: "Note content" }
      },
      required: ["contactId", "body"]
    }
  },
  {
    name: "ghl_list_tasks",
    description: "Get tasks for a contact.",
    input_schema: {
      type: "object",
      properties: { contactId: { type: "string" } },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_create_task",
    description: "Create a task for a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, title: { type: "string" },
        body: { type: "string" }, dueDate: { type: "string", description: "ISO format" },
        assignedTo: { type: "string" }
      },
      required: ["contactId", "title"]
    }
  },
  {
    name: "ghl_update_task",
    description: "Update or complete a task.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, taskId: { type: "string" },
        completed: { type: "boolean" }, title: { type: "string" }
      },
      required: ["contactId", "taskId"]
    }
  },

  // ── CONVERSATIONS & MESSAGING ─────────────────────────────────────────────
  {
    name: "ghl_get_conversations",
    description: "Get conversation history for a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        limit: { type: "number" }
      },
      required: ["contactId"]
    }
  },
  {
    name: "ghl_send_message",
    description: "Send an SMS, email, or other message to a contact through BLOOM CRM.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        type: { type: "string", enum: ["SMS", "Email", "WhatsApp"], description: "Message channel" },
        message: { type: "string", description: "Message body" },
        subject: { type: "string", description: "Email subject line (for Email type)" },
        html: { type: "string", description: "HTML content (for Email type)" }
      },
      required: ["contactId", "type", "message"]
    }
  },

  {
    name: "notify_owner",
    description: `Send a text (SMS) or email to the business owner directly. Use this to: report completed work, alert on VIP emails, flag a blocker you've hit, confirm task done, or ask a question that needs a human decision. ALWAYS use this when contacting the owner — not ghl_send_message.`,
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to send. Be concise. Include what you did, found, or need." },
        type: { type: "string", enum: ["SMS", "Email"], description: "SMS for quick updates, Email for detailed reports. Default: SMS" },
        urgency: { type: "string", enum: ["normal", "urgent"], description: "urgent = VIP contact, blocker, time-sensitive" }
      },
      required: ["message"]
    }
  },

  // ── CALENDARS & APPOINTMENTS ──────────────────────────────────────────────
  {
    name: "ghl_list_calendars",
    description: "List all calendars.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_calendar_slots",
    description: "Get available time slots for a calendar.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" }
      },
      required: ["calendarId", "startDate", "endDate"]
    }
  },
  {
    name: "ghl_create_appointment",
    description: "Book an appointment on a calendar.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" }, contactId: { type: "string" },
        startTime: { type: "string", description: "ISO format datetime" },
        title: { type: "string" }
      },
      required: ["calendarId", "contactId", "startTime"]
    }
  },
  {
    name: "ghl_get_appointments",
    description: "Get appointments from a calendar.",
    input_schema: {
      type: "object",
      properties: {
        calendarId: { type: "string" },
        startDate: { type: "string" }, endDate: { type: "string" }
      },
      required: ["calendarId"]
    }
  },

  // ── OPPORTUNITIES & PIPELINES ─────────────────────────────────────────────
  {
    name: "ghl_list_pipelines",
    description: "List all sales pipelines.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_search_opportunities",
    description: "Search for deals/opportunities in the pipeline.",
    input_schema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" }, status: { type: "string" },
        query: { type: "string" }, limit: { type: "number" }
      }
    }
  },
  {
    name: "ghl_get_opportunity",
    description: "Get details of a specific opportunity.",
    input_schema: {
      type: "object",
      properties: { opportunityId: { type: "string" } },
      required: ["opportunityId"]
    }
  },
  {
    name: "ghl_create_opportunity",
    description: "Create a new deal/opportunity in the pipeline.",
    input_schema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" }, contactId: { type: "string" },
        name: { type: "string" }, monetaryValue: { type: "number" },
        pipelineStageId: { type: "string" }
      },
      required: ["pipelineId", "contactId", "name"]
    }
  },
  {
    name: "ghl_update_opportunity",
    description: "Update an opportunity/deal.",
    input_schema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" }, name: { type: "string" },
        pipelineStageId: { type: "string" }, monetaryValue: { type: "number" },
        status: { type: "string" }
      },
      required: ["opportunityId"]
    }
  },

  // ── WORKFLOWS ─────────────────────────────────────────────────────────────
  {
    name: "ghl_list_workflows",
    description: "List all automation workflows.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_add_contact_to_workflow",
    description: "Add a contact to an automation workflow.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, workflowId: { type: "string" }
      },
      required: ["contactId", "workflowId"]
    }
  },
  {
    name: "ghl_remove_contact_from_workflow",
    description: "Remove a contact from a workflow.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, workflowId: { type: "string" }
      },
      required: ["contactId", "workflowId"]
    }
  },

  // ── FORMS & SURVEYS ───────────────────────────────────────────────────────
  {
    name: "ghl_list_forms",
    description: "List all forms.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_form_submissions",
    description: "Get submissions for a specific form.",
    input_schema: {
      type: "object",
      properties: { formId: { type: "string" } },
      required: ["formId"]
    }
  },
  {
    name: "ghl_list_surveys",
    description: "List all surveys.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_survey_submissions",
    description: "Get survey submissions.",
    input_schema: {
      type: "object",
      properties: { surveyId: { type: "string" } },
      required: ["surveyId"]
    }
  },

  // ── INVOICES & PAYMENTS ───────────────────────────────────────────────────
  {
    name: "ghl_list_invoices",
    description: "List invoices.",
    input_schema: {
      type: "object",
      properties: { status: { type: "string" } }
    }
  },
  {
    name: "ghl_get_invoice",
    description: "Get a specific invoice.",
    input_schema: {
      type: "object",
      properties: { invoiceId: { type: "string" } },
      required: ["invoiceId"]
    }
  },
  {
    name: "ghl_create_invoice",
    description: "Create a new invoice.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" }, title: { type: "string" },
        dueDate: { type: "string" },
        items: { type: "array", description: "Line items array" }
      },
      required: ["contactId", "title", "items"]
    }
  },
  {
    name: "ghl_send_invoice",
    description: "Send an invoice to a contact.",
    input_schema: {
      type: "object",
      properties: { invoiceId: { type: "string" } },
      required: ["invoiceId"]
    }
  },
  {
    name: "ghl_list_payments",
    description: "List payment transactions.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  {
    name: "ghl_list_products",
    description: "List products.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_create_product",
    description: "Create a new product.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }, description: { type: "string" },
        price: { type: "number" }
      },
      required: ["name", "price"]
    }
  },

  // ── MEDIA & CONTENT ───────────────────────────────────────────────────────
  {
    name: "ghl_list_media",
    description: "List media files in the media library.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_social_posts",
    description: "List scheduled or published social media posts.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_create_social_post",
    description: "Create a new social media post.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        platforms: { type: "array", items: { type: "string" } },
        scheduledDate: { type: "string" }
      },
      required: ["content", "platforms"]
    }
  },
  {
    name: "ghl_list_blog_posts",
    description: "List blog posts from the BLOOM blog site.",
    input_schema: {
      type: "object",
      properties: {
        blogId: { type: "string", description: "Blog site ID. Defaults to BLOOM blog (DHQrtpkQ3Cp7c96FCyDu)." }
      },
      required: []
    }
  },
  {
    name: "ghl_create_blog_post",
    description: "Create a blog post using the LOCKED BLOOM template. Pass structured data — the handler auto-assembles the HTML with the approved gradient header, orange H2s, peach callouts, and dark CTA card. Do NOT write raw HTML. Always draft first.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Blog post main title (h1, shown in gradient header)" },
        subtitle: { type: "string", description: "Subtitle shown below title in gradient header" },
        intro: { type: "string", description: "Opening hook (1-3 sentences, displayed as italic blockquote with orange border)" },
        sections: {
          type: "array",
          description: "Blog content sections. Each gets an orange H2 heading with pink top border, paragraphs, optional highlight callout, optional bullet list.",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "Section heading (h2, orange)" },
              paragraphs: { description: "String or array of paragraph strings" },
              highlight: { type: "string", description: "Optional peach callout box text" },
              highlightLabel: { type: "string", description: "Callout label (default: 'The impact:')" },
              bullets: { type: "array", items: { type: "string" }, description: "Optional bullet points (orange triangle markers)" }
            },
            required: ["heading"]
          }
        },
        ctaHeadline: { type: "string", description: "CTA card headline (connect to topic)" },
        ctaBody: { type: "string", description: "CTA card body (1-2 sentences)" },
        imageUrl: { type: "string", description: "Hero image URL from image_generate" },
        slug: { type: "string", description: "URL slug (lowercase, hyphenated, keyword-rich)" },
        metaDescription: { type: "string", description: "SEO meta description (150-160 chars)" },
        keywords: { type: "string", description: "Comma-separated SEO keywords" },
        status: { type: "string", enum: ["draft", "published"], description: "Always 'draft' unless told to publish" },
        tags: { type: "array", items: { type: "string" }, description: "Blog tags" }
      },
      required: ["title", "sections"]
    }
  },
  {
    name: "ghl_list_email_templates",
    description: "List email templates.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  // ── FUNNELS & WEBSITES ────────────────────────────────────────────────────
  {
    name: "ghl_list_funnels",
    description: "List funnels.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_funnel_pages",
    description: "Get pages for a funnel.",
    input_schema: {
      type: "object",
      properties: { funnelId: { type: "string" } },
      required: ["funnelId"]
    }
  },

  // ── LOCATION & USERS ──────────────────────────────────────────────────────
  {
    name: "ghl_get_location_info",
    description: "Get location/account information and settings.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_users",
    description: "List all users in the account.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_campaigns",
    description: "List campaigns.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_trigger_links",
    description: "List trigger links.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_phone_numbers",
    description: "List phone numbers for the account.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_courses",
    description: "List courses.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_documents",
    description: "List documents and contracts.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_get_custom_fields",
    description: "Get all custom fields for contacts.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "ghl_list_location_tags",
    description: "List all available tags.",
    input_schema: { type: "object", properties: {}, required: [] }
  },

  {
    name: "ghl_create_email_template",
    description: "Create a NEW email template in the CRM (Marketing > Emails). Pass structured data — the handler auto-assembles branded HTML with hero image, callout box, gradient CTA button, and Bloomie CTA card, then saves it as a Code Editor template. IMPORTANT: Only use this for creating NEW templates. If the user asks to EDIT, UPDATE, FIX, or CHANGE an existing email template, use ghl_update_email_template instead — NEVER recreate a template just to change a link or text. Do NOT write raw HTML — use the structured fields.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Template name (e.g. 'Blog Announcement - 5 Signs AI Employee - Mar 2026')" },
        subject: { type: "string", description: "Email subject line. 6-10 words, front-load value." },
        previewText: { type: "string", description: "Preview text (first 90 chars). Complement subject, don't repeat." },
        headline: { type: "string", description: "Email headline (h1). For blog emails: use the ACTUAL blog title, never 'New Blog Post'." },
        openingHook: { type: "string", description: "Opening paragraph (1-2 conversational sentences)" },
        calloutHeading: { type: "string", description: "Callout box heading. Blog: 'Inside the post:', Newsletter: 'This week:'" },
        calloutItems: { type: "array", items: { type: "string" }, description: "3-5 takeaway items for the orange-bordered callout box" },
        extraParagraph: { type: "string", description: "Optional extra paragraph after callout" },
        ctaButtonText: { type: "string", description: "Main CTA button text (e.g. 'Read the Full Post')" },
        ctaButtonUrl: { type: "string", description: "Main CTA button URL (blog URL, landing page, etc.)" },
        ctaHeadline: { type: "string", description: "Bloomie CTA card headline (connect to email topic)" },
        ctaBody: { type: "string", description: "Bloomie CTA card body (1-2 sentences)" },
        imageUrl: { type: "string", description: "Hero image URL from image_generate" },
        type: { type: "string", enum: ["newsletter", "promotional", "welcome", "re-engagement", "blog-announcement"], description: "Email type" },
        tags: { type: "array", items: { type: "string" }, description: "Tags" }
      },
      required: ["name", "subject", "calloutItems"]
    }
  },
  {
    name: "ghl_update_email_template",
    description: "Update an existing email template in the CRM. Use this when the user asks to edit, fix, or change an email template that was already created. You can update the HTML content, subject, preview text, or rebuild from structured fields. You MUST provide the templateId of the template to update. The templateId is returned from ghl_create_email_template as _templateId.",
    input_schema: {
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
    }
  },
  {
    name: "ghl_create_trigger_link",
    description: "Create a trigger link that fires a workflow when clicked.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        redirectTo: { type: "string", description: "Target URL" }
      },
      required: ["name", "redirectTo"]
    }
  },
  {
    name: "ghl_send_document",
    description: "Send a document or contract for signature.",
    input_schema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        contactId: { type: "string" }
      },
      required: ["documentId", "contactId"]
    }
  },
  {
    name: "ghl_update_contact_custom_field",
    description: "Update custom field values on a contact.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        customFields: { type: "object", description: "Key-value pairs of custom field data" }
      },
      required: ["contactId", "customFields"]
    }
  },
  {
    name: "ghl_update_opportunity_stage",
    description: "Move an opportunity to a different pipeline stage.",
    input_schema: {
      type: "object",
      properties: {
        opportunityId: { type: "string" },
        pipelineStageId: { type: "string" }
      },
      required: ["opportunityId", "pipelineStageId"]
    }
  },
  {
    name: "ghl_upload_media",
    description: "Upload a media file to BLOOM CRM media library.",
    input_schema: {
      type: "object",
      properties: {
        fileName: { type: "string" },
        file: { type: "string", description: "Base64 encoded file content" }
      },
      required: ["fileName", "file"]
    }
  },

  // ── BLOOM INTERNAL ────────────────────────────────────────────────────────
  {
    name: "bloom_log",
    description: "Log an action, observation, or decision to the activity log.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["action", "observation", "error", "decision"] },
        message: { type: "string" }
      },
      required: ["type", "message"]
    }
  }
  ,
  // ── BROWSER — AI-driven browser automation via sidecar ────────────────────
  {
    name: "browser_task",
    description: "Execute an AI-driven browser automation task. The browser agent can navigate websites, click buttons, fill forms, extract data, read page content, handle popups, and interact with web applications intelligently. Use this for any task requiring real browser interaction — logging into platforms, filling out forms, scraping data from pages, or automating web workflows.",
    input_schema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural language description of what to accomplish in the browser. Be specific about what to click, fill, or extract." },
        url: { type: "string", description: "Starting URL to navigate to (optional — the agent can navigate on its own)" },
        max_steps: { type: "integer", description: "Maximum number of steps the browser agent can take (default 25, max 100)", default: 25 }
      },
      required: ["task"]
    }
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of a web page in YOUR OWN browser. Returns a base64-encoded PNG image. Use this for navigating and seeing websites you are browsing yourself.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL of the page to screenshot" }
      },
      required: ["url"]
    }
  },
  {
    name: "browser_list_sites",
    description: "List all sites that have saved login credentials in the credential registry. Shows which sites are configured and ready for browser_login, plus available templates for unconfigured sites.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "browser_login",
    description: "Log into a website using saved credentials from the credential registry. Use browser_list_sites first to see which sites have credentials configured.",
    input_schema: {
      type: "object",
      properties: {
        siteName: { type: "string", description: "Site key (e.g. 'quora', 'reddit', 'linkedin')" }
      },
      required: ["siteName"]
    }
  },
  // ── GMAIL ────────────────────────────────────────────────────────────────
  {
    name: "gmail_check_inbox",
    description: "Check the Gmail inbox for new, unread, or specific emails. Returns sender, subject, date, and snippet for each message.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (default: 'is:unread'). Examples: 'is:unread', 'from:client@example.com', 'subject:urgent'" },
        maxResults: { type: "number", description: "Max messages to return (default: 10, max: 20)" }
      },
      required: []
    }
  },
  {
    name: "gmail_read_message",
    description: "Read the full content of a specific email by its message ID. Use after gmail_check_inbox to read the full body.",
    input_schema: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "The Gmail message ID to read" }
      },
      required: ["messageId"]
    }
  },
  {
    name: "gmail_send_email",
    description: "Send an email via Gmail. Requires to, subject, and body (HTML supported).",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body (HTML supported)" }
      },
      required: ["to", "subject", "body"]
    }
  },
  // ── DOCUMENTS ────────────────────────────────────────────────────────────
  {
    name: "bloom_create_document",
    description: "Save a document/artifact (blog post, email draft, social post, report, etc.) to the BLOOM document system. Use this to save any content you create so the operator can review it.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title" },
        content: { type: "string", description: "Full document content (HTML or markdown)" },
        docType: { type: "string", description: "Type: blog_post, social_post, email_draft, report, landing_page, other" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
        requiresApproval: { type: "boolean", description: "Whether this needs the operator's approval before use (default: false)" }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "bloom_list_documents",
    description: "List documents saved in the BLOOM document system. Filter by type or status.",
    input_schema: {
      type: "object",
      properties: {
        docType: { type: "string", description: "Filter by type (blog_post, social_post, email_draft, etc.)" },
        status: { type: "string", description: "Filter by status (draft, approved, rejected)" }
      },
      required: []
    }
  },
  {
    name: "bloom_update_document",
    description: "Update an existing document's content, title, or status.",
    input_schema: {
      type: "object",
      properties: {
        documentId: { type: "string", description: "Document ID to update" },
        title: { type: "string" },
        content: { type: "string" },
        status: { type: "string", description: "New status: draft, approved, rejected" }
      },
      required: ["documentId"]
    }
  },
  // ── USER'S COMPUTER CONTROL ──────────────────────────────────────────────
  {
    name: "bloom_take_screenshot",
    description: "Take a screenshot of THE USER'S computer screen. Returns a base64 image of what is currently on their screen. ALWAYS call this first before clicking or typing on the user's computer.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_click",
    description: "Click at specific x,y coordinates on THE USER'S screen. Use bloom_take_screenshot first to see the screen and identify coordinates.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate to click" },
        y: { type: "number", description: "Y coordinate to click" }
      },
      required: ["x", "y"]
    }
  },
  {
    name: "bloom_double_click",
    description: "Double-click at x,y coordinates on THE USER'S screen.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" }
      },
      required: ["x", "y"]
    }
  },
  {
    name: "bloom_type_text",
    description: "Type text at the current cursor position on THE USER'S computer. Click the target field first with bloom_click, then use this to type.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type on the user's computer" }
      },
      required: ["text"]
    }
  },
  {
    name: "bloom_key_press",
    description: "Press a key or keyboard shortcut on THE USER'S computer. Examples: 'Return', 'Tab', 'Escape', 'cmd+c', 'cmd+v'.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key or shortcut to press (e.g. 'Return', 'Tab', 'cmd+c')" }
      },
      required: ["key"]
    }
  },
  {
    name: "bloom_scroll",
    description: "Scroll at x,y coordinates on THE USER'S screen.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        amount: { type: "number", description: "Scroll amount in pixels", default: 300 }
      },
      required: ["x", "y", "direction"]
    }
  },
  {
    name: "bloom_move_mouse",
    description: "Move the mouse to x,y on THE USER'S screen without clicking.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" }
      },
      required: ["x", "y"]
    }
  },
  {
    name: "bloom_drag",
    description: "Click-drag from (fromX,fromY) to (toX,toY) on the user's screen.",
    input_schema: {
      type: "object",
      properties: {
        fromX: { type: "number" },
        fromY: { type: "number" },
        toX: { type: "number" },
        toY: { type: "number" }
      },
      required: ["fromX", "fromY", "toX", "toY"]
    }
  },
  {
    name: "bloom_get_screen_info",
    description: "Get screen dimensions and current mouse position.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  // ── FILESYSTEM TOOLS ──────────────────────────────────────────────────
  {
    name: "bloom_list_directory",
    description: "List files and folders in a directory on the user's computer.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (optional, defaults to home)" }
      },
      required: []
    }
  },
  {
    name: "bloom_read_file",
    description: "Read text content of a file on the user's computer.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" },
        maxLength: { type: "number", description: "Max chars to read (optional)" }
      },
      required: ["path"]
    }
  },
  {
    name: "bloom_write_file",
    description: "Write text content to a file on the user's computer. Creates parent directories.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "bloom_move_file",
    description: "Move or rename a file or folder on the user's computer.",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string" },
        destination: { type: "string" }
      },
      required: ["source", "destination"]
    }
  },
  {
    name: "bloom_create_folder",
    description: "Create a folder (and parent directories) on the user's computer.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  },
  {
    name: "bloom_delete_file",
    description: "Delete a file or folder on the user's computer (recursive for folders).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  },
  // ── SYSTEM CONTROL TOOLS ──────────────────────────────────────────────
  {
    name: "bloom_execute_shell",
    description: "Run a shell command on the user's computer and return stdout/stderr.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        timeout: { type: "number", description: "Timeout in ms (optional)" }
      },
      required: ["command"]
    }
  },
  {
    name: "bloom_get_system_info",
    description: "Get OS, platform, architecture, hostname, uptime, memory, CPU info.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_clipboard_read",
    description: "Read text from the user's system clipboard.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_clipboard_write",
    description: "Write text to the user's system clipboard.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  },
  {
    name: "bloom_app_list",
    description: "List all running applications on the user's computer.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_app_switch",
    description: "Activate and switch to an application by name.",
    input_schema: {
      type: "object",
      properties: { appName: { type: "string" } },
      required: ["appName"]
    }
  },
  {
    name: "bloom_open_url",
    description: "Open a URL in the default browser on the user's computer.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "bloom_open_file",
    description: "Open a file with its default application on the user's computer.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  },
  {
    name: "bloom_notification",
    description: "Show a system notification on the user's computer.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        message: { type: "string" }
      },
      required: ["title", "message"]
    }
  },
  // ── BROWSER CONTROL TOOLS (via Playwright CDP) ────────────────────────
  {
    name: "bloom_browser_navigate",
    description: "Navigate the browser on the user's computer to a URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "bloom_browser_snapshot",
    description: "Get a DOM snapshot with numbered element refs. Use refs with bloom_browser_click/type.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_browser_click",
    description: "Click a browser element by its ref number (from bloom_browser_snapshot).",
    input_schema: {
      type: "object",
      properties: { ref: { type: "string" } },
      required: ["ref"]
    }
  },
  {
    name: "bloom_browser_type",
    description: "Type text into a browser element by its ref number.",
    input_schema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        text: { type: "string" }
      },
      required: ["ref", "text"]
    }
  },
  {
    name: "bloom_browser_screenshot",
    description: "Take a screenshot of the browser on the user's computer.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_browser_find",
    description: "Find browser elements by natural language query.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "bloom_browser_accessibility_tree",
    description: "Get full accessibility tree of the browser page.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_browser_read_network",
    description: "Read captured network requests from the browser.",
    input_schema: {
      type: "object",
      properties: { pattern: { type: "string" } },
      required: []
    }
  },
  {
    name: "bloom_browser_read_console",
    description: "Read captured console messages from the browser.",
    input_schema: {
      type: "object",
      properties: { pattern: { type: "string" } },
      required: []
    }
  },
  {
    name: "bloom_browser_tabs_list",
    description: "List open browser tabs.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_browser_tabs_switch",
    description: "Switch to a specific browser tab.",
    input_schema: {
      type: "object",
      properties: { tabId: { type: "string" } },
      required: ["tabId"]
    }
  },
  {
    name: "bloom_browser_eval",
    description: "Execute JavaScript in the browser context.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"]
    }
  },
  {
    name: "bloom_browser_get_text",
    description: "Get all text content from the current browser page.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_browser_scroll",
    description: "Scroll the browser page.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        amount: { type: "number" }
      },
      required: ["direction", "amount"]
    }
  },
  {
    name: "bloom_browser_go_back",
    description: "Navigate browser back.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_browser_go_forward",
    description: "Navigate browser forward.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "bloom_browser_upload_file",
    description: "Upload a file to a browser form input element.",
    input_schema: {
      type: "object",
      properties: {
        ref: { type: "string" },
        path: { type: "string" }
      },
      required: ["ref", "path"]
    }
  },
  // ── AUDIT TOOLS ───────────────────────────────────────────────────────
  {
    name: "bloom_audit_log",
    description: "Get recent audit log entries from the desktop app.",
    input_schema: {
      type: "object",
      properties: { count: { type: "number" } },
      required: []
    }
  },
  {
    name: "bloom_audit_search",
    description: "Search audit logs by query.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "bloom_audit_stats",
    description: "Get audit statistics from the desktop app.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
    // ── WEB SEARCH & FETCH ───────────────────────────────────────────────────
  {
    name: "web_search",
    description: "Search the web for current information. Returns relevant results with titles, URLs, and descriptions. Use this to research topics, find current news, look up facts, verify information, or find resources. Always use this when you need information that might have changed since your training data.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — be specific and concise for best results" },
        count: { type: "integer", description: "Number of results to return (default 5, max 20)", default: 5 }
      },
      required: ["query"]
    }
  },
  {
    name: "web_fetch",
    description: "Fetch and extract the text content from a specific URL. Use this to read articles, documentation, or any web page. Returns the visible text content of the page.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch content from" }
      },
      required: ["url"]
    }
  },
  // ── IMAGE GENERATION & EDITING ───────────────────────────────────────────
  {
    name: "image_generate",
    description: "Generate an image from a text description. Perfect for creating flyers, social media posts, banners, book covers, logos, product mockups, brand assets, and any visual content. Be very specific and detailed in your prompt — include exact text you want displayed, colors, layout, and style. Uses GPT Image 1.5 by default (best for design assets). Set engine to 'gemini' for Nano Banana if text consistency needs fixing. IMPORTANT: When creating platform-specific images (Facebook covers, Instagram posts, Eventbrite headers, etc.), ALWAYS set target_width and target_height to the exact pixel dimensions required. Common sizes: Facebook cover 820x312, Instagram post 1080x1080, Instagram story 1080x1920, Eventbrite header 2160x1080, Twitter header 1500x500, LinkedIn banner 1128x191.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed description of the image to generate. Include exact text, colors, layout, style, and mood." },
        size: { type: "string", enum: ["1024x1024", "1024x1536", "1536x1024"], description: "Base generation size (closest aspect ratio). 1024x1024=square, 1024x1536=portrait, 1536x1024=landscape. Image is resized to target_width x target_height after generation.", default: "1024x1024" },
        target_width: { type: "integer", description: "REQUIRED for platform-specific images. Exact output width in pixels (e.g. 820 for Facebook cover, 1080 for Instagram post)." },
        target_height: { type: "integer", description: "REQUIRED for platform-specific images. Exact output height in pixels (e.g. 312 for Facebook cover, 1080 for Instagram post)." },
        quality: { type: "string", enum: ["low", "medium", "high"], description: "Image quality level", default: "high" },
        background: { type: "string", enum: ["opaque", "transparent"], description: "Use 'transparent' for logos/overlays", default: "opaque" },
        engine: { type: "string", enum: ["auto", "gpt", "gemini"], description: "'auto' picks best engine. 'gpt' = GPT Image 1.5. 'gemini' = Nano Banana / Imagen for text-heavy fixes.", default: "auto" },
        reference_image_url: { type: "string", description: "URL of a reference image for character consistency. CRITICAL for multi-character projects — pass the SPECIFIC character's image URL to keep them looking the same. Get URLs from get_session_files or from previous image_generate results. If omitted, the most recent image is auto-injected." },
        no_reference: { type: "boolean", description: "Set to true to generate a BRAND NEW character/person without any reference image. Use this when creating a NEW character that should NOT look like any previous character. Prevents auto-injection of the last image.", default: false }
      },
      required: ["prompt"]
    }
  },
  {
    name: "image_resize",
    description: "Resize/crop an existing image to exact pixel dimensions WITHOUT any AI regeneration. The output is the SAME image, just at different dimensions. Use this when the user uploads an image and wants: size variations for different platforms, the same design at different dimensions, a crop/resize of their existing image. This does NOT generate new content. Common sizes: Facebook cover 820x312, Instagram post 1080x1080, Instagram story 1080x1920, Eventbrite header 2160x1080, Twitter header 1500x500, LinkedIn banner 1128x191, YouTube thumbnail 1280x720.",
    input_schema: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "URL of image to resize" },
        image_base64: { type: "string", description: "Base64-encoded image to resize" },
        target_width: { type: "integer", description: "Exact output width in pixels" },
        target_height: { type: "integer", description: "Exact output height in pixels" },
        mode: { type: "string", enum: ["cover", "contain", "stretch"], description: "'cover' (default) = resize + center-crop. 'contain' = fit with letterbox. 'stretch' = distort to fill.", default: "cover" }
      },
      required: ["target_width", "target_height"]
    }
  },
  {
    name: "image_edit",
    description: "Edit an existing image with text instructions. Change text, swap backgrounds, adjust colors, add/remove elements, fix text rendering. Provide the image via URL or base64.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description of edits to make" },
        image_url: { type: "string", description: "URL of image to edit" },
        image_base64: { type: "string", description: "Base64-encoded image data to edit" },
        size: { type: "string", enum: ["1024x1024", "1024x1536", "1536x1024"], default: "1024x1024" },
        quality: { type: "string", enum: ["low", "medium", "high"], default: "high" }
      },
      required: ["prompt"]
    }
  },
  {
    name: "get_session_files",
    description: "Retrieve files and images you previously created in this session or recent sessions. Use this BEFORE asking the user to re-upload something you already made. When a user asks you to edit or modify something you created (a flyer, image, document, website), call this tool first to get the file URL — then use image_edit or create_artifact with that URL. Never ask the user to re-upload a file you already created.",
    input_schema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "The session ID to look up files for. Use the current session ID." },
        fileType: { type: "string", enum: ["image", "html", "markdown", "docx", "all"], description: "Filter by file type. Use 'all' to see everything." }
      },
      required: ["sessionId"]
    }
  },
  {
    name: "create_artifact",
    description: "Create a NEW deliverable file. Use ONLY for brand new files — NEVER to update an existing file. To edit an existing file, use edit_artifact instead (server-side find-and-replace that preserves the original). NEVER use placeholder URLs (yourstore.com, example.com) — create real pages or ask for the real URL. After saving, include <!-- file:filename.ext --> in your response.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name with extension (e.g. 'summer-camp-flyer-copy.md', 'email-campaign.html', 'sop-intake-process.md')" },
        description: { type: "string", description: "Brief description of what this deliverable is" },
        content: { type: "string", description: "The full content of the file" },
        fileType: { type: "string", enum: ["text", "html", "code", "markdown"], description: "Content type", default: "markdown" }
      },
      required: ["name", "description", "content"]
    }
  },
  {
    name: "generate_images_parallel",
    description: "Generate multiple images simultaneously for a website. Pass all image prompts at once — they run concurrently and ALL complete before this tool returns. Returns an imageMap with real CDN URLs keyed by your ID strings. Use these real URLs directly in your HTML. This tool WAITS for all images — do not build HTML until it returns. Typical time: 30-90 seconds for 10-14 images.",
    input_schema: {
      type: "object",
      properties: {
        images: {
          type: "array",
          description: "List of images to generate in parallel",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Placeholder ID, e.g. PENDING_IMG_0, PENDING_IMG_1" },
              prompt: { type: "string", description: "Image generation prompt" },
              style: { type: "string", description: "Style hint: photorealistic, illustration, etc." }
            },
            required: ["id", "prompt"]
          }
        },
        artifactName: { type: "string", description: "Name of the artifact this is for, e.g. bloomie-staffing.html" }
      },
      required: ["images", "artifactName"]
    }
  },
  {
    name: "update_artifact_images",
    description: "After generate_images_parallel completes, swap placeholder URLs in a saved HTML artifact with real image URLs. Call this once images are done to update the live site automatically.",
    input_schema: {
      type: "object",
      properties: {
        artifactName: { type: "string", description: "Name of the artifact to update, e.g. bloomie-staffing.html" },
        replacements: {
          type: "array",
          description: "List of placeholder → real URL mappings",
          items: {
            type: "object",
            properties: {
              placeholder: { type: "string", description: "The placeholder ID or URL in the HTML" },
              realUrl: { type: "string", description: "The real Supabase CDN URL for the image" }
            },
            required: ["placeholder", "realUrl"]
          }
        }
      },
      required: ["artifactName", "replacements"]
    }
  },
  {
    name: "swap_image_in_artifact",
    description: "Replace one image with another inside a saved HTML artifact (website, flyer, landing page). Use when the operator says things like \'replace the hero image with that coffee shot\', \'swap that photo for the one in files\', or \'use a different image on the website\'. Workflow: 1) Call get_session_files to find the artifact fileId and identify the old image src in the HTML. 2) Call list_ai_images to find the replacement image URL. 3) Call this tool to do the swap. 4) Confirm what was replaced.",
    input_schema: {
      type: "object",
      properties: {
        artifactId: { type: "string", description: "UUID of the HTML artifact to edit (fileId from get_session_files)" },
        oldSrc: { type: "string", description: "Exact image URL currently in the artifact HTML to be replaced" },
        newSrc: { type: "string", description: "New image URL to use (from AI image library or any Supabase CDN URL)" }
      },
      required: ["artifactId", "oldSrc", "newSrc"]
    }
  },
  {
    name: "list_ai_images",
    description: "Browse the full AI image library — every image Sarah has ever generated, stored in Supabase. Use when the operator wants to find a specific image to use on a website, see available images, or pick one for a swap. Returns image URLs, names, and descriptions. Supports optional keyword search.",
    input_schema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Optional keyword to filter by description (e.g. \'coffee\', \'hero\', \'headshot\')" },
        limit: { type: "number", description: "Max images to return (default 50)" }
      },
      required: []
    }
  },
  {
    name: "create_docx",
    description: "Create a professional Word document (.docx) with real formatting — tables, headers, footers, page numbers, branded styling. Use this instead of create_artifact when the user asks for a document, report, handbook, SOP, proposal, or any professional deliverable. CRITICAL: After creating the file, ALWAYS tell the client in your response that you've created it and include the filename in quotes. Example: 'Here's your employee handbook — \"onboarding-handbook.docx\"'. Provide a complete Node.js script that uses the 'docx' npm library to build the document. The script will be executed and the resulting .docx file saved for download.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name (e.g. 'onboarding-handbook.docx', 'q1-report.docx')" },
        description: { type: "string", description: "Brief description of the document" },
        script: { type: "string", description: "Complete Node.js script using the docx library. Must end with Packer.toBuffer(doc).then(buffer => { fs.writeFileSync(OUTPUT_PATH, buffer); console.log('SUCCESS'); }); The variable OUTPUT_PATH will be replaced with the actual save path." }
      },
      required: ["name", "description", "script"]
    }
  },
  {
    name: "create_scheduled_task",
    description: "Create a recurring scheduled task for yourself. Use when the client asks you to do something regularly — daily blog posts, weekly newsletters, daily lead checks, etc. This adds it to your daily task schedule.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short task name, e.g. 'Daily blog post'" },
        description: { type: "string", description: "What this task accomplishes" },
        taskType: { type: "string", enum: ["content", "email", "research", "crm", "custom"], description: "Category of task" },
        instruction: { type: "string", description: "Detailed instruction for what to do each time this runs" },
        frequency: { type: "string", enum: ["daily", "weekdays", "weekly", "monthly"], description: "How often to run" },
        runTime: { type: "string", description: "Time to run in HH:MM format, e.g. '09:00'" }
      },
      required: ["name", "instruction", "frequency"]
    }
  },
  {
    name: "task_progress",
    description: "MANDATORY for any task involving tool calls — part of your Autonomous Work Protocol. Use liberally — the Active Tasks panel is visible to the user and shows them you're working. Call at every phase transition: (1) PLAN: call with ALL steps 'pending' before starting work. (2) EXECUTE: mark each step 'in_progress' then 'completed' as you work — exactly ONE in_progress at a time. (3) VERIFY: mark verify step 'in_progress' while checking, then 'completed'. (4) DELIVER: include the returned inlineChecklist in your final response. RULES: Always include a final 'Verify all deliverables' step. Send the COMPLETE todo array every call. Mark complete IMMEDIATELY on success. NEVER mark complete if tool returned an error. Each item needs content (imperative: 'Generate flyer') and activeForm (continuous: 'Generating flyer').",
    input_schema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "What needs to be done (imperative: 'Move files to Documents')" },
              status: { type: "string", enum: ["pending", "in_progress", "completed"], description: "Current state" },
              activeForm: { type: "string", description: "Present tense shown while running ('Moving files to Documents')" }
            },
            required: ["content", "status", "activeForm"]
          },
          description: "The full todo list. Send the COMPLETE list every time (not just changes)."
        }
      },
      required: ["todos"]
    }
  },
  {
    name: "bloom_clarify",
    description: "MANDATORY: Ask the user a clarifying question before starting any multi-step task from chat. You MUST call this BEFORE creating a task plan or using any other tools. Present 2-4 options as clickable buttons for the user to choose from. This pauses execution until the user responds.\n\nALWAYS use when the task involves creating content, contacting someone, updating data, or has multiple possible interpretations. ONLY skip when the request is 100% unambiguous with all details provided, or it's a single trivial action.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The clarifying question to ask" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short option label (1-5 words)" },
              description: { type: "string", description: "What this option means" }
            },
            required: ["label", "description"]
          },
          description: "2-4 options for the user to choose from — these become clickable buttons"
        },
        context: { type: "string", description: "Why you need this clarification" }
      },
      required: ["question", "options"]
    }
  },
  // ── SELF-SCHEDULING TOOLS ──────────────────────────────────────────
  // These let any Bloomie create, list, update, pause, and delete their own scheduled tasks.
  // Backed by the existing /api/agent/tasks endpoints + Supabase scheduled_tasks table.
  {
    name: "bloom_schedule_task",
    description: `Create a new scheduled/recurring task for yourself. Use this when the user asks you to do something on a recurring basis (daily, hourly, weekly, etc.) or at a specific time. ALWAYS use bloom_clarify FIRST to confirm: what exactly to do, how often, and what time.

Examples of when to use:
- "Check my emails every morning" → schedule a daily email-check task
- "Write a blog post every day" → schedule a daily blog-creation task
- "Follow up with new leads every hour" → schedule an hourly lead-followup task
- "Send me a weekly report every Monday" → schedule a weekly reporting task

After creating, confirm to the user exactly what was scheduled, the frequency, and the time. NEVER fake this — if it fails, report the real error.`,
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short task name (e.g., 'Daily Blog Post', 'Hourly Email Check')" },
        description: { type: "string", description: "What this task does and why" },
        instruction: { type: "string", description: "The detailed instruction you will execute each time this task runs. Write this as if you're giving yourself instructions. Be specific — include skills to load, tools to use, and expected outputs." },
        frequency: { type: "string", enum: ["every_10_min", "every_30_min", "hourly", "daily", "weekdays", "weekly", "monthly"], description: "How often to run" },
        runTime: { type: "string", description: "Time to run in HH:MM format (24-hour). Default: '09:00'. For every_10_min/every_30_min/hourly, this sets the minute offset." },
        taskType: { type: "string", enum: ["content", "email", "followup", "reporting", "monitoring", "custom"], description: "Category of task" }
      },
      required: ["name", "instruction", "frequency"]
    }
  },
  {
    name: "bloom_list_scheduled_tasks",
    description: "List all your currently scheduled/recurring tasks. Use this to check what's already scheduled before creating duplicates, or when the user asks 'what tasks do you have?' or 'what are you doing automatically?'",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "bloom_update_scheduled_task",
    description: "Update an existing scheduled task — change its frequency, time, instruction, or pause/resume it. Use when the user says 'change that to weekly', 'pause the blog task', 'update the email check to run at 8am', etc.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The task_id to update (get from bloom_list_scheduled_tasks)" },
        enabled: { type: "boolean", description: "true to enable/resume, false to pause" },
        name: { type: "string", description: "Updated task name" },
        instruction: { type: "string", description: "Updated instruction" },
        frequency: { type: "string", enum: ["every_10_min", "every_30_min", "hourly", "daily", "weekdays", "weekly", "monthly"], description: "Updated frequency" },
        runTime: { type: "string", description: "Updated run time (HH:MM, 24-hour)" }
      },
      required: ["taskId"]
    }
  },
  {
    name: "bloom_delete_scheduled_task",
    description: "Permanently delete a scheduled task. Use bloom_clarify FIRST to confirm the user really wants to delete it. Pausing (via bloom_update_scheduled_task with enabled:false) is usually better than deleting.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The task_id to delete (get from bloom_list_scheduled_tasks)" }
      },
      required: ["taskId"]
    }
  },
  {
    name: "load_skill",
    description: "Load detailed expert instructions for a specific skill before doing complex work. Call this BEFORE starting any major creative or document task. The skill provides data-driven best practices, formatting standards, and quality requirements. Available skills are listed in your system prompt — match the skill name exactly.",
    input_schema: {
      type: "object",
      properties: {
        skill_name: { type: "string", description: "The skill to load. Must match a filename in the skills catalog (without .md). Common skills: 'website-creation', 'marketing-graphics', 'docx', 'pptx', 'pdf', 'xlsx', 'blog-content', 'email-creator', 'email-marketing', 'social-media', 'book-writing', 'ghl-crm', 'flyer-generation', 'image-generation', 'lead-scraper', 'task-scheduling', 'professional-documents', 'refund-handler'" },
        context: { type: "string", description: "Brief description of what you're about to create — helps select the right guidelines" }
      },
      required: ["skill_name"]
    }
  },
  {
    name: "dispatch_to_specialist",
    description: `Dispatch work to a specialist AI model that's better suited for specific tasks. Use this when the client needs something that another model does better than you:

- "writing" → Long blog posts, articles, reports (Claude Sonnet — highest quality writing)
- "email" → Email campaigns, subject lines, SMS copy, social captions (GPT-4o — punchy persuasive copy)
- "coding" → HTML pages, scripts, landing pages, automation code (DeepSeek — fast expert coder)
- "image" → Banners, flyers, graphics, social images (GPT image generation)
- "video" → Short video clips, social reels, product demos (Veo3/Kling — premium feature, check if enabled first)

You are the client's point of contact. The specialist works behind the scenes — the client only sees you delivering the result. After receiving the specialist's output, present it naturally as your own work and save it as a file if appropriate.

Do NOT use this for simple questions, conversation, or tasks you can handle yourself like CRM lookups. Only dispatch when a specialist model would produce meaningfully better output.`,
    input_schema: {
      type: "object",
      properties: {
        taskType: { 
          type: "string", 
          enum: ["writing", "email", "coding", "image", "video"],
          description: "Type of specialist work needed"
        },
        specialistPrompt: { 
          type: "string", 
          description: "Detailed prompt for the specialist. Include ALL context: brand info, tone, audience, specific requirements, examples. The specialist has no conversation history — everything they need must be in this prompt."
        },
        outputFormat: {
          type: "string",
          enum: ["markdown", "html", "code", "text", "image"],
          description: "Expected output format from the specialist"
        }
      },
      required: ["taskType", "specialistPrompt"]
    }
  },
  {
    name: "switch_model",
    description: `Switch your AI model on the fly. Only use this when the operator explicitly tells you to switch models (e.g., "switch to GPT", "use Gemini", "go back to Claude").

Available models:
- "sonnet" → Claude Sonnet 4.6 (best quality, best instruction following)
- "haiku" → Claude Haiku 4.5 (fast, cheap, less reliable)
- "gpt4o" → GPT-4o (strong alternative, cheaper than Sonnet)
- "gpt4o-mini" → GPT-4o-mini (very cheap, basic)
- "gemini" → Gemini 2.5 Flash (cheapest, fast)
- "deepseek" → DeepSeek Chat (cheap, good at code)

You can also pass a full model string like "claude-sonnet-4-6".

After switching, confirm which model you're now running on. Your tools and capabilities stay exactly the same — only your reasoning engine changes.`,
    input_schema: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "Model shorthand (sonnet, haiku, gpt4o, gpt4o-mini, gemini, deepseek) or full model string"
        },
        reason: {
          type: "string",
          description: "Why the switch was requested (for logging)"
        }
      },
      required: ["model"]
    }
  },
  {
    name: "get_model_status",
    description: `Check which AI model you're currently running on, what provider is active, and what models are available for switching. Use this when the operator asks "what model are you on?" or "show me model status".`,
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "edit_artifact",
    description: `Edit an existing HTML artifact. This is the MANDATORY tool for modifying existing websites/pages.

THREE MODES — choose the right one:

**MODE 1: CSS-TARGETED (PREFERRED for CSS changes)**
Use cssSelector + cssProperty + cssValue. The server finds the CSS rule block and changes the property.
Example: { "cssSelector": ".cta-button", "cssProperty": "background-color", "cssValue": "#22C55E" }

**MODE 2: FIND-AND-REPLACE (for small text/link changes)**
Use find + replace in operations array. The server finds the exact string and replaces it.
Keep find strings SHORT and unique. Use get_session_files to read the file first.

**MODE 3: FULL REWRITE (for major changes — new sections, restructuring, fixing broken pages)**
Use fullRewrite with the complete replacement HTML. This replaces the ENTIRE file content.
Use this when: adding/removing whole sections, restructuring the page, fixing broken HTML, or when find-and-replace keeps failing.
Example: { "artifactName": "my-site.html", "fullRewrite": "<html>...entire new HTML...</html>", "operations": [] }
This is the MOST RELIABLE mode for large changes. Use it instead of struggling with find-and-replace.

WHEN TO USE WHICH:
- Change a CSS color/size → MODE 1 (CSS-TARGETED)
- Change a link or short text → MODE 2 (FIND-AND-REPLACE)
- Add/remove a section, fix broken page, restructure → MODE 3 (FULL REWRITE)
- If MODE 2 fails twice → switch to MODE 3 (FULL REWRITE)

NEVER use create_artifact to update an existing file — ALWAYS use edit_artifact instead.`,
    input_schema: {
      type: "object",
      properties: {
        artifactName: { type: "string", description: "Filename of the artifact to edit (e.g. 'mountain-peak-coffee-landing.html'). Must match the name from get_session_files." },
        sessionId: { type: "string", description: "Session ID where the artifact lives. Use the current session ID." },
        fullRewrite: { type: "string", description: "MODE 3: Complete replacement HTML. Replaces the ENTIRE file content. Use for major changes (new sections, restructuring) or when find-and-replace keeps failing. When using fullRewrite, operations can be an empty array []." },
        operations: {
          type: "array",
          description: "Array of edit operations for MODE 1 (CSS) or MODE 2 (find/replace). Can be empty [] if using fullRewrite.",
          items: {
            type: "object",
            properties: {
              cssSelector: { type: "string", description: "CSS selector to target (e.g. '.cta-button', '#hero', 'h1'). Use with cssProperty and cssValue for CSS changes." },
              cssProperty: { type: "string", description: "CSS property to change (e.g. 'background-color', 'color', 'font-size'). Use with cssSelector and cssValue." },
              cssValue: { type: "string", description: "New CSS value to set (e.g. '#22C55E', '24px'). Use with cssSelector and cssProperty." },
              find: { type: "string", description: "Exact string to find in the HTML (for find-and-replace mode). Keep as short as possible while being unique." },
              replace: { type: "string", description: "String to replace it with (for find-and-replace mode)." },
              description: { type: "string", description: "Brief note about what this change does (for logging)" }
            }
          }
        }
      },
      required: ["artifactName", "sessionId"]
    }
  },
  {
    name: "get_site_pages",
    description: `List all HTML pages that belong to a multi-page website. Use this when:
- The user refers to an existing website by name (e.g. "on the Bloomie Staffing website...")
- You need to know what pages already exist before adding a new one
- You need to update navigation across all pages in a site

This searches for all HTML artifacts in the current session. Returns page names, descriptions, and preview URLs.
After getting the page list, you can:
1. Create a NEW page with create_artifact (it auto-links via the site route)
2. Edit existing pages with edit_artifact (e.g. to add the new page to their nav menus)
3. Replace a page by using edit_artifact with extensive find-and-replace operations`,
    input_schema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID of the site. Use your current session ID." },
        siteName: { type: "string", description: "Optional — name/keyword to help identify the site (e.g. 'bloomie', 'staffing'). Used for logging only." }
      },
      required: ["sessionId"]
    }
  },
  // ── LEAD SCRAPER TOOLS ──────────────────────────────────────────────────
  {
    name: "scraper_check_access",
    description: "Check what scraper tools the owner's plan includes and what upgrades are available. CALL THIS FIRST before any scraping.",
    input_schema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization ID of the Bloomie owner" },
        plan_tier: { type: "string", enum: ["free", "lead_booster", "lead_pro"], description: "Owner's current plan tier", default: "free" }
      },
      required: ["org_id"]
    }
  },
  {
    name: "scraper_scrape_url",
    description: "Universal web scraper — extract structured data from ANY webpage. Give it a URL and column names describing what to extract. Works like Thunderbit: auto-detects tables, listings, cards, and repeated structures. Best for: directory pages, search results, product listings, review pages. Limitation: won't work on JavaScript-rendered pages.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The webpage URL to scrape" },
        columns: { type: "array", items: { type: "string" }, description: "Column names for what to extract, e.g. ['Business Name', 'Phone', 'Address', 'Email']" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "lead_booster", "lead_pro"], default: "free" },
        limit: { type: "number", description: "Max results (default 30)", default: 30 },
        offset: { type: "number", description: "Pagination offset", default: 0 }
      },
      required: ["url", "columns", "org_id"]
    }
  },
  {
    name: "scraper_search_businesses",
    description: "Search Yellowpages and/or Yelp for local businesses by category and location. Returns business names, phone numbers, addresses, categories, ratings. FREE — no API keys needed. Pair with scraper_search_apollo (Lead Booster) to get verified emails for these businesses.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Business type, e.g. 'restaurants', 'plumbers', 'hair salons'" },
        location: { type: "string", description: "City/state/zip, e.g. '78228' or 'San Antonio, TX'" },
        source: { type: "string", enum: ["yellowpages", "yelp", "both"], description: "Which directory", default: "both" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "lead_booster", "lead_pro"], default: "free" },
        limit: { type: "number", default: 30 },
        offset: { type: "number", default: 0 }
      },
      required: ["query", "location", "org_id"]
    }
  },
  {
    name: "scraper_search_facebook_groups",
    description: "Find Facebook groups and extract member data. Groups with 10K-300K+ local members are gold for B2C leads. Returns member names, workplaces, locations, profile links. IMPORTANT: Facebook requires the user to be logged in.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Group search term, e.g. 'San Antonio restaurants'" },
        group_url: { type: "string", description: "Direct URL of a specific Facebook group (optional)" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "lead_booster", "lead_pro"], default: "free" },
        limit: { type: "number", default: 30 },
        offset: { type: "number", default: 0 }
      },
      required: ["query", "org_id"]
    }
  },
  {
    name: "scraper_search_google_maps",
    description: "Search Google Maps for businesses via Outscraper API. Returns verified phone, address, website, rating, reviews, hours. Google Maps has the most comprehensive local business database. 🔒 Requires Lead Booster plan ($29/month).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Business type to search" },
        location: { type: "string", description: "City/state/zip code" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "lead_booster", "lead_pro"], default: "free" },
        limit: { type: "number", default: 30 },
        offset: { type: "number", default: 0 }
      },
      required: ["query", "location", "org_id"]
    }
  },
  {
    name: "scraper_search_apollo",
    description: "Search Apollo.io's database of 210M+ contacts for verified emails, phone numbers, job titles, and company info. The gold standard for B2B contact data. 🔒 Requires Lead Booster plan ($29/month).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Person name, job title, or company to search" },
        location: { type: "string", description: "City/state filter" },
        job_title: { type: "string", description: "Job title filter, e.g. 'CEO', 'Marketing Manager'" },
        industry: { type: "string", description: "Industry filter, e.g. 'Food & Beverages'" },
        company_size: { type: "string", enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001+"], description: "Employee count range" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "lead_booster", "lead_pro"], default: "free" },
        limit: { type: "number", default: 30 },
        offset: { type: "number", default: 0 }
      },
      required: ["query", "org_id"]
    }
  },
  {
    name: "scraper_search_linkedin",
    description: "Search LinkedIn profiles via PhantomBuster. Returns up to 75 data points per person: name, headline, company, title, location, experience, education, email. 🔒 Requires Lead Pro plan ($99/month). Searches run async — may take 30-60 seconds.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Person name, company, or keyword" },
        location: { type: "string", description: "Location filter" },
        job_title: { type: "string", description: "Job title filter" },
        company: { type: "string", description: "Company name filter" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "lead_booster", "lead_pro"], default: "free" },
        limit: { type: "number", default: 30 },
        offset: { type: "number", default: 0 }
      },
      required: ["query", "org_id"]
    }
  },
  // ── AI VIDEO GENERATION TOOLS ──────────────────────────────────────────
  {
    name: "video_check_access",
    description: "Check what video generation tools the owner's plan includes and what upgrades are available. CALL THIS FIRST before any video generation.",
    input_schema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization ID of the Bloomie owner" },
        plan_tier: { type: "string", enum: ["free", "video_creator", "video_pro"], description: "Owner's current video plan tier", default: "free" }
      },
      required: ["org_id"]
    }
  },
  {
    name: "video_list_avatars",
    description: "Browse available AI avatars for video generation. Each avatar has a unique look, voice, and personality. Currently features Sarah Rodriguez — professional Latina business woman. FREE — no plan upgrade required.",
    input_schema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "video_creator", "video_pro"], default: "free" },
        response_format: { type: "string", enum: ["markdown", "json"], default: "markdown" }
      },
      required: ["org_id"]
    }
  },
  {
    name: "video_generate",
    description: "Generate a lip-synced AI video with a chosen avatar speaking your script. 1080p video with natural lip sync, facial expressions, and voice. Videos take 1-2 minutes. Pipeline: Text → TTS → LatentSync → CodeFormer → Alpha Blend → FFmpeg. Cost: ~$0.03/video (150x cheaper than HeyGen). 🔒 Requires Video Creator plan ($49/month).",
    input_schema: {
      type: "object",
      properties: {
        avatar_id: { type: "string", description: "Avatar ID, e.g. 'sarah'" },
        script: { type: "string", description: "Text for the avatar to speak (max 5000 chars)" },
        voice_style: { type: "string", description: "Voice style hint: 'warm', 'professional', 'energetic'. Default: natural" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "video_creator", "video_pro"], default: "free" },
        response_format: { type: "string", enum: ["markdown", "json"], default: "markdown" }
      },
      required: ["avatar_id", "script", "org_id"]
    }
  },
  {
    name: "video_job_status",
    description: "Check the status of a video generation job. Returns current status and, when complete, the download URL for the finished video. Statuses: IN_QUEUE, IN_PROGRESS, COMPLETED, FAILED. 🔒 Requires Video Creator plan ($49/month).",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID returned by video_generate" },
        org_id: { type: "string", description: "Organization ID" },
        plan_tier: { type: "string", enum: ["free", "video_creator", "video_pro"], default: "free" },
        response_format: { type: "string", enum: ["markdown", "json"], default: "markdown" }
      },
      required: ["job_id", "org_id"]
    }
  },
  {
    name: "polymarket_analyze",
    description: "Analyze a Polymarket prediction market using BLOOM Alpha — Bayesian calibration + historical patterns. LOCKED: requires bloom_alpha feature flag.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The contract question" },
        market_id: { type: "string", description: "Polymarket market ID" },
        market_probability: { type: "number", description: "Current market price 0-1" },
        category: { type: "string", description: "Contract category" }
      },
      required: ["question", "market_probability"]
    }
  }
];

// Dynamic tool availability — checked per request, not at boot
function getAvailableTools() {
  const available = [];
  const unavailable = [];
  
  for (const tool of _ALL_TOOLS) {
    const readiness = checkToolReadiness(tool.name);
    if (readiness.ready) {
      available.push(tool);
    } else {
      unavailable.push({ name: tool.name, reason: readiness.reason });
    }
  }
  
  return { tools: available, unavailable };
}

function checkToolReadiness(toolName) {
  // Image tools need an API key
  if (toolName === 'image_generate' || toolName === 'image_edit') {
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
      return { ready: false, reason: 'No image API key (OPENAI_API_KEY or GEMINI_API_KEY)' };
    }
  }
  // image_resize doesn't need an API key — it's pure local processing
  if (toolName === 'image_resize') {
    return { ready: true };
  }
  // Specialist dispatch needs at least one model key
  if (toolName === 'dispatch_to_specialist') {
    // Always available — falls back to Anthropic
  }
  // GHL tools need API key
  if (toolName.startsWith('ghl_')) {
    if (!process.env.GHL_API_KEY) {
      return { ready: false, reason: 'No GHL API key' };
    }
  }
  // Browser tools need chromium
  if (toolName === 'web_browse' || toolName === 'web_screenshot') {
    // These fail gracefully at runtime, keep available
  }
  // Scraper tools — always available (free tools work without API keys; paid tools gate at runtime)
  if (toolName.startsWith('scraper_')) {
    return { ready: true };
  }
  // Video tools — always available (free tools work without API keys; paid tools gate at runtime)
  if (toolName.startsWith('video_')) {
    return { ready: true };
  }
  // Add more checks here as connectors are added
  return { ready: true };
}

// Build capability notes for system prompt — tell Sarah what's available and what's not
function getCapabilityNotes() {
  const { tools: available, unavailable } = getAvailableTools();
  const notes = [];
  
  // Tell Sarah what she CAN do
  const capabilities = [];
  if (available.some(t => t.name === 'image_generate')) {
    capabilities.push('Image generation is AVAILABLE — use image_generate to create visuals for websites, social posts, flyers, etc. Prompts are auto-enhanced for quality, but YOU should still write detailed prompts: describe subject, lighting, camera/lens, composition, colors, mood. Set engine=gpt for social/flyers/thumbnails, engine=gemini for website heroes/blog images. Default style is PHOTOREALISTIC — never produce cartoon or illustrated unless the user asks.');
  }
  if (available.some(t => t.name === 'web_search')) {
    capabilities.push('Web search is AVAILABLE — use web_search for any research, finding information, or looking up current data.');
  }
  if (available.some(t => t.name === 'create_artifact')) {
    capabilities.push('File creation is AVAILABLE — use create_artifact for NEW files, use edit_artifact for modifying existing files (server-side find-and-replace). NEVER use create_artifact to update an existing file.');
  }
  if (available.some(t => t.name.startsWith('ghl_'))) {
    capabilities.push('CRM tools are AVAILABLE — use ghl_ tools for contacts, emails, SMS, calendars, and pipelines.');
  }
  if (available.some(t => t.name === 'scraper_check_access')) {
    capabilities.push('Lead scraping tools are AVAILABLE — use scraper_ tools to build prospect lists. ALWAYS call scraper_check_access FIRST to see what the owner\'s plan allows. Free: scraper_scrape_url (any URL), scraper_search_businesses (Yellowpages/Yelp), scraper_search_facebook_groups. Paid: scraper_search_google_maps, scraper_search_apollo, scraper_search_linkedin. Paid tools will return upsell messages if the owner\'s plan doesn\'t include them.');
  }
  if (available.some(t => t.name === 'video_check_access')) {
    capabilities.push('AI Video generation tools are AVAILABLE — use video_ tools to create lip-synced AI videos with Sarah Rodriguez. ALWAYS call video_check_access FIRST to see what the owner\'s plan allows. Free: video_check_access (plan info), video_list_avatars (browse avatars). Paid (Video Creator $49/mo): video_generate (submit video job), video_job_status (check progress/download). Videos are 1080p, lip-synced, ~$0.03 each. Use video_generate with avatar_id "sarah" and a script, then poll video_job_status for the download URL.');
  }
  
  if (capabilities.length > 0) {
    notes.push('\nAVAILABLE CAPABILITIES:');
    capabilities.forEach(c => notes.push('- ' + c));
  }
  
  // Tell Sarah what she CAN'T do
  if (unavailable.length > 0) {
    notes.push('\nCURRENT LIMITATIONS (work around these):');
    for (const t of unavailable) {
      if (t.name === 'image_generate' || t.name === 'image_edit') {
        notes.push('- Image generation is NOT available. Use CSS gradients, patterns, and SVG icons instead.');
      } else if (t.name.startsWith('ghl_')) {
        if (!notes.some(n => n.includes('BLOOM CRM'))) {
          notes.push('- BLOOM CRM tools are NOT available. Let the client know the integration needs configuration.');
        }
      }
    }
  }
  
  if (notes.length === 0) return '';
  notes.push('- When ANY tool fails at runtime, adapt and deliver. Never stall, never abandon.');
  return notes.join('\n');
}

// TOOL EXECUTION — routes all tool calls to the appropriate executor
async function executeTool(toolName, toolInput, sessionId = null, agentConfig = null, orgId = null) {
  logger.info(`Executing tool: ${toolName}`, { input: toolInput });
  try {
    // bloom_log goes to database
    if (toolName === 'bloom_log') {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data } = await sb.from('action_log').insert({
          action_type: toolInput.type || 'log',
          description: toolInput.message || '',
          input_data: toolInput,
          agent_id: process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003',
          organization_id: process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001'
        }).select().single();
        return { logged: data };
      } catch (err) {
        logger.warn('bloom_log insert failed', { error: err.message });
        return { logged: null };
      }
    }

    // task_progress — routes checklist to SSE (Desktop) and/or returns inline (browser chat)
    if (toolName === 'task_progress') {
      const sessionKey = sessionId || 'default';
      const isDesktop = sessionKey.startsWith('desktop_');

      // Always update the in-memory Map so SSE stream has latest state
      taskProgress.set(sessionKey, {
        todos: toolInput.todos,
        updatedAt: Date.now()
      });

      // Build a formatted checklist for inline chat display
      const checklist = toolInput.todos.map(t => {
        const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜';
        const label = t.status === 'in_progress' ? t.activeForm : t.content;
        return `${icon} ${label}`;
      }).join('\n');

      // Return the checklist as the primary text content so the LLM sees it front and center
      const instruction = isDesktop
        ? 'Progress pushed to Desktop SSE stream.'
        : 'IMPORTANT: Include the checklist below in your next response so the user can see progress:\n\n' + checklist;

      return {
        success: true,
        todoCount: toolInput.todos.length,
        context: isDesktop ? 'desktop_sse' : 'browser_chat',
        inlineChecklist: checklist,
        message: instruction
      };
    }

    // bloom_clarify — returns structured data to pause execution and show buttons to user
    if (toolName === 'bloom_clarify') {
      logger.info('bloom_clarify called', {
        question: toolInput.question,
        optionCount: toolInput.options?.length || 0
      });
      return {
        success: true,
        type: 'clarification_needed',
        question: toolInput.question,
        options: toolInput.options || [],
        context: toolInput.context || '',
        message: `Clarification needed: ${toolInput.question}`,
        pauseExecution: true
      };
    }

    // ── SELF-SCHEDULING TOOLS ──────────────────────────────────────
    if (toolName === 'bloom_schedule_task') {
      try {
        const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
        const resp = await fetch(`${BASE_URL}/api/agent/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: toolInput.name,
            description: toolInput.description || '',
            instruction: toolInput.instruction,
            frequency: toolInput.frequency || 'daily',
            runTime: toolInput.runTime || '09:00',
            taskType: toolInput.taskType || 'custom'
          })
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed to create scheduled task');
        logger.info('Bloomie self-scheduled task', { taskId: data.task?.task_id, name: toolInput.name, frequency: toolInput.frequency });
        return {
          success: true,
          taskId: data.task?.task_id,
          name: toolInput.name,
          frequency: toolInput.frequency,
          runTime: toolInput.runTime || '09:00',
          nextRunAt: data.task?.next_run_at,
          message: `Scheduled task "${toolInput.name}" created — runs ${toolInput.frequency} at ${toolInput.runTime || '09:00'}`
        };
      } catch (e) {
        logger.error('bloom_schedule_task failed:', e.message);
        return { success: false, error: e.message, message: `FAILED to schedule task: ${e.message}. Tell the user the exact error.` };
      }
    }

    if (toolName === 'bloom_list_scheduled_tasks') {
      try {
        const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
        const resp = await fetch(`${BASE_URL}/api/agent/tasks`);
        const data = await resp.json();
        if (!resp.ok) throw new Error('Failed to list scheduled tasks');
        const tasks = (data.tasks || []).map(t => ({
          taskId: t.taskId, name: t.name, instruction: t.instruction,
          frequency: t.frequency, runTime: t.runTime, enabled: t.enabled,
          lastRunAt: t.lastRunAt, nextRunAt: t.nextRunAt, runCount: t.runCount
        }));
        return {
          success: true,
          tasks,
          totalActive: tasks.filter(t => t.enabled).length,
          totalPaused: tasks.filter(t => !t.enabled).length,
          message: `Found ${tasks.length} scheduled tasks (${tasks.filter(t => t.enabled).length} active, ${tasks.filter(t => !t.enabled).length} paused)`
        };
      } catch (e) {
        logger.error('bloom_list_scheduled_tasks failed:', e.message);
        return { success: false, error: e.message };
      }
    }

    if (toolName === 'bloom_update_scheduled_task') {
      try {
        const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
        const body = {};
        if (toolInput.enabled !== undefined) body.enabled = toolInput.enabled;
        if (toolInput.name) body.name = toolInput.name;
        if (toolInput.instruction) body.instruction = toolInput.instruction;
        if (toolInput.frequency) body.frequency = toolInput.frequency;
        if (toolInput.runTime) body.runTime = toolInput.runTime;
        const resp = await fetch(`${BASE_URL}/api/agent/tasks/${toolInput.taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed to update scheduled task');
        return {
          success: true,
          taskId: toolInput.taskId,
          updates: body,
          message: `Updated scheduled task ${toolInput.taskId}`
        };
      } catch (e) {
        logger.error('bloom_update_scheduled_task failed:', e.message);
        return { success: false, error: e.message, message: `FAILED to update task: ${e.message}. Tell the user the exact error.` };
      }
    }

    if (toolName === 'bloom_delete_scheduled_task') {
      try {
        const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
        const resp = await fetch(`${BASE_URL}/api/agent/tasks/${toolInput.taskId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error || 'Failed to delete scheduled task');
        return { success: true, message: `Deleted scheduled task ${toolInput.taskId}` };
      } catch (e) {
        logger.error('bloom_delete_scheduled_task failed:', e.message);
        return { success: false, error: e.message, message: `FAILED to delete task: ${e.message}. Tell the user the exact error.` };
      }
    }

    // All GHL tools + notify_owner route through the unified executor
    if (toolName.startsWith('ghl_') || toolName === 'notify_owner') {
      const { executeGHLTool } = await import('../tools/ghl-tools.js');
      return await executeGHLTool(toolName, toolInput, orgId);
    }

    // Web search & fetch tools — model-agnostic
    if (toolName.startsWith('web_')) {
      const { executeWebSearchTool } = await import('../tools/web-search-tools.js');
      return await executeWebSearchTool(toolName, toolInput);
    }

    // Lead scraper MCP tools — server-side scraping + paid API integrations (Outscraper, Apollo, PhantomBuster)
    if (toolName.startsWith('scraper_')) {
      const { executeScraperMCPTool } = await import('../tools/scraper-mcp-tools.js');
      return await executeScraperMCPTool(toolName, toolInput);
    }

    // Video MCP tools — AI video generation via Sarah Pipeline on RunPod Serverless
    if (toolName.startsWith('video_')) {
      const { executeVideoMCPTool } = await import('../tools/video-mcp-tools.js');
      return await executeVideoMCPTool(toolName, toolInput);
    }

    // Image generation & editing tools — GPT Image + Nano Banana
    if (toolName.startsWith('image_')) {
      try {
        const { executeImageTool } = await import('../tools/image-tools.js');
        const result = await executeImageTool(toolName, { ...toolInput, sessionId: toolInput.sessionId || sessionId, agentId: agentConfig?.agentId || process.env.AGENT_UUID || null });
        if (result.success) return result;
        // Image failed — give Sarah a clean fallback instruction
        return {
          success: false,
          error: 'Image generation returned an error. Use CSS gradients and styled backgrounds as visual alternatives.',
          continueWithout: true
        };
      } catch (imgErr) {
        return {
          success: false,
          error: 'Image service temporarily unavailable. Use CSS-based visuals instead.',
          continueWithout: true
        };
      }
    }

    // Get previously created files — so Sarah never asks user to re-upload her own work
    if (toolName === 'get_session_files') {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        // ALWAYS use the real chat session ID — ignore whatever the LLM passes
        const sid = sessionId || toolInput.sessionId;
        const fileType = toolInput.fileType || 'all';
        logger.info('get_session_files', { requestedSid: toolInput.sessionId, actualSid: sid, fileType });

        let query = supabase
          .from('artifacts')
          .select('id, name, description, file_type, mime_type, storage_path, content, created_at')
          .eq('session_id', sid)
          .order('created_at', { ascending: false })
          .limit(200);

        if (fileType !== 'all') {
          query = query.eq('file_type', fileType);
        }

        const { data, error } = await query;

        if (error) {
          logger.error('get_session_files Supabase error:', error.message);
          return { success: false, error: 'Could not retrieve session files: ' + error.message };
        }

        if (!data || data.length === 0) {
          return {
            success: true,
            files: [],
            sessionId: sid,
            message: `No files found for session ${sid}. You may need to recreate the asset.`
          };
        }

        const files = data.map(row => ({
          fileId: row.id,
          name: row.name,
          description: row.description,
          fileType: row.file_type,
          createdAt: row.created_at,
          url: row.storage_path || null,
          hasContent: !!row.content,
          // Include actual content for text/html artifacts so Sarah can edit in-place
          // Truncate at 80KB to avoid flooding context — full content is in Supabase
          content: row.content && row.file_type !== 'image'
            ? (row.content.length > 80000 ? row.content.slice(0, 80000) + '\n[...TRUNCATED]' : row.content)
            : null,
          source: 'bloomie'
        }));

        // Also include user-uploaded images from chat_uploads (reference images)
        let userUploads = [];
        try {
          const { createClient: _sc } = await import('@supabase/supabase-js');
          const _sb = _sc(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
          const { data: uploadRows } = await _sb
            .from('chat_uploads')
            .select('upload_id, name, mime_type, supabase_url, file_path, created_at')
            .eq('session_id', sid)
            .order('created_at', { ascending: false })
            .limit(20);
          userUploads = (uploadRows || [])
            .filter(r => r.supabase_url || r.file_path)
            .map(r => ({
              fileId: r.upload_id,
              name: r.name,
              fileType: 'image',
              createdAt: r.created_at,
              url: r.supabase_url || `/api/chat/uploads/preview/${r.upload_id}`,
              hasContent: false,
              source: 'user_upload'
            }));
        } catch (upErr) {
          logger.warn('get_session_files: could not fetch user uploads', { error: upErr.message });
        }

        const allFiles = [...files, ...userUploads];

        return {
          success: true,
          files: allFiles,
          message: `Found ${allFiles.length} file(s) from this session.

⚠️ TO EDIT AN EXISTING FILE: Use edit_artifact (NOT create_artifact).

1. Read the content below to find the EXACT strings you need to change
2. Call edit_artifact with find→replace operations for each change
3. The server patches the stored HTML — you never rewrite the full file
4. Include <!-- file:filename.ext --> in your response

RULES:
- NEVER use create_artifact to update an existing file — it rebuilds from scratch
- ALWAYS use edit_artifact with precise find→replace operations
- Keep find strings short but unique — just enough to match one spot
- Do NOT change anything the user didn't ask you to change
- Use placeholder URLs → create real pages with create_artifact first

For images: use the 'url' field with image_edit.`
        };
      } catch (err) {
        logger.error('get_session_files failed:', err.message);
        return { success: false, error: 'Could not retrieve session files: ' + err.message };
      }
    }

    // Get all HTML pages in a site (session)
    if (toolName === 'get_site_pages') {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const sid = sessionId || toolInput.sessionId;
        logger.info('get_site_pages', { sessionId: sid, siteName: toolInput.siteName });

        const { data, error } = await supabase
          .from('artifacts')
          .select('id, name, description, file_type, content, created_at')
          .eq('session_id', sid)
          .eq('file_type', 'html')
          .order('created_at', { ascending: true });

        if (error) {
          return { success: false, error: 'Could not retrieve site pages: ' + error.message };
        }

        if (!data || data.length === 0) {
          return { success: true, pages: [], message: 'No HTML pages found in this session. This might be a new site — create pages with create_artifact.' };
        }

        // Extract nav links from each page to show site structure
        const pages = data.map(page => {
          // Find all internal .html links in the page content
          const linkMatches = (page.content || '').match(/href="([a-zA-Z0-9][a-zA-Z0-9._-]*\.html)"/gi) || [];
          const linkedPages = linkMatches.map(m => m.match(/href="([^"]+)"/)?.[1]).filter(Boolean);

          return {
            name: page.name,
            description: page.description,
            previewUrl: `/api/files/site/${sid}/${page.name}`,
            linksTo: [...new Set(linkedPages)],
            hasNav: linkedPages.length > 1,
            contentLength: (page.content || '').length
          };
        });

        const pageNames = pages.map(p => p.name);

        return {
          success: true,
          sessionId: sid,
          siteEntryUrl: `/api/files/site/${sid}/${pages[0]?.name || 'index.html'}`,
          totalPages: pages.length,
          pages,
          allPageNames: pageNames,
          message: `This site has ${pages.length} page(s): ${pageNames.join(', ')}.

ADDING A NEW PAGE TO THIS SITE:
1. Create the new page with create_artifact — include a nav menu linking to ALL existing pages: ${pageNames.join(', ')} plus the new page
2. After creating the new page, use edit_artifact on EACH existing page to add the new page to their nav menu
3. The server auto-resolves relative .html links, so just use href="filename.html"

REPLACING A PAGE:
Use edit_artifact with find-and-replace operations to modify the existing page content.`
        };
      } catch (err) {
        logger.error('get_site_pages failed:', err.message);
        return { success: false, error: 'Could not retrieve site pages: ' + err.message };
      }
    }

    // Artifact creation — save deliverables for client review
    if (toolName === 'create_artifact') {
      // ──── OVERWRITE PROTECTION ────
      // If an artifact with this name already exists in ANY recent session, BLOCK the create
      // and force Sarah to use edit_artifact instead
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const checkSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        console.log(`[create_artifact] Overwrite check: name="${toolInput.name}", sessionId="${sessionId}"`);

        // Check in current session first
        let { data: existing } = await checkSupabase
          .from('artifacts')
          .select('id, name, session_id')
          .eq('session_id', sessionId)
          .eq('name', toolInput.name)
          .limit(1);

        // Also check by name alone (any session) as a safety net
        if (!existing || existing.length === 0) {
          const { data: anyExisting } = await checkSupabase
            .from('artifacts')
            .select('id, name, session_id')
            .eq('name', toolInput.name)
            .order('created_at', { ascending: false })
            .limit(1);
          if (anyExisting && anyExisting.length > 0) {
            existing = anyExisting;
            console.log(`[create_artifact] Found existing artifact in different session: ${anyExisting[0].session_id}`);
          }
        }

        if (existing && existing.length > 0) {
          console.log(`[create_artifact] BLOCKED overwrite of "${toolInput.name}" (existing id: ${existing[0].id})`);
          return {
            success: false,
            error: `BLOCKED: A file named "${toolInput.name}" already exists (id: ${existing[0].id}). ` +
              `You MUST use edit_artifact to modify existing files — NEVER create_artifact. ` +
              `Call edit_artifact with artifactName="${toolInput.name}" and your find→replace operations.`
          };
        }
        console.log(`[create_artifact] No existing artifact found, allowing create`);
      } catch (e) {
        // If the check fails, log but allow the create to proceed
        console.warn('[create_artifact] Overwrite check failed:', e.message);
      }

      // ──── SERVER-SIDE EMOJI STRIP ────
      // Strip emojis from HTML/text content before saving (enforces emoji ban)
      const stripEmojis = (text) => {
        if (!text || typeof text !== 'string') return text;
        // Remove emoji characters: emoticons, dingbats, symbols, flags, etc.
        return text.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F1E0}-\u{1F1FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{200D}|\u{20E3}|\u{E0020}-\u{E007F}|\u{2B50}|\u{2B55}|\u{231A}-\u{231B}|\u{23E9}-\u{23F3}|\u{23F8}-\u{23FA}|\u{25AA}-\u{25AB}|\u{25B6}|\u{25C0}|\u{25FB}-\u{25FE}|\u{2614}-\u{2615}|\u{2648}-\u{2653}|\u{267F}|\u{2693}|\u{26A1}|\u{26AA}-\u{26AB}|\u{26BD}-\u{26BE}|\u{26C4}-\u{26C5}|\u{26CE}|\u{26D4}|\u{26EA}|\u{26F2}-\u{26F3}|\u{26F5}|\u{26FA}|\u{26FD}|\u{2702}|\u{2705}|\u{2708}-\u{270D}|\u{270F}|\u{2712}|\u{2714}|\u{2716}|\u{271D}|\u{2721}|\u{2728}|\u{2733}-\u{2734}|\u{2744}|\u{2747}|\u{274C}|\u{274E}|\u{2753}-\u{2755}|\u{2757}|\u{2763}-\u{2764}|\u{2795}-\u{2797}|\u{27A1}|\u{27B0}|\u{2934}-\u{2935}|\u{2B05}-\u{2B07}|\u{3030}|\u{303D}|\u{3297}|\u{3299}|\u{FE0F}]/gu, '');
      };
      let cleanContent = toolInput.content;
      if (toolInput.fileType === 'html' || (toolInput.name && toolInput.name.endsWith('.html'))) {
        const before = cleanContent.length;
        cleanContent = stripEmojis(cleanContent);
        const stripped = before - cleanContent.length;
        if (stripped > 0) console.log(`[create_artifact] EMOJI STRIP: removed ${stripped} emoji characters from "${toolInput.name}"`);
      }

      const mimeMap = { text: 'text/plain', html: 'text/html', code: 'text/javascript', markdown: 'text/markdown' };
      const port = process.env.PORT || 3000;
      // Retry artifact creation up to 2 times on transient failures
      let data = null;
      const artifactPayload = JSON.stringify({
        name: toolInput.name,
        description: toolInput.description,
        fileType: toolInput.fileType || 'markdown',
        mimeType: mimeMap[toolInput.fileType] || 'text/markdown',
        content: cleanContent,
        sessionId: sessionId,
        agentId: agentConfig?.agentId || null
      });
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const resp = await fetch(`http://localhost:${port}/api/files/artifacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: artifactPayload
          });
          data = await resp.json();
          if (data.success) break; // Success — stop retrying
          if (attempt < 2) {
            logger.warn(`create_artifact attempt ${attempt + 1} failed: ${data.error || 'unknown'} — retrying`);
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        } catch (fetchErr) {
          logger.error(`create_artifact fetch error attempt ${attempt + 1}:`, fetchErr.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          else data = { success: false, error: `Fetch failed after 3 attempts: ${fetchErr.message}` };
        }
      }
      if (data.success) {
        // Build site URL for multi-page site linking
        const siteUrl = sessionId ? `/api/files/site/${sessionId}/${toolInput.name}` : null;

        return {
          success: true,
          message: `FILE CREATED SUCCESSFULLY: "${toolInput.name}"

⚠️ MANDATORY — YOUR RESPONSE MUST FOLLOW THESE EXACT RULES:

1. Include this EXACT hidden tag on its own line in your response (copy it exactly):
<!-- file:${toolInput.name} -->

2. Do NOT write the filename "${toolInput.name}" anywhere in your visible message text.
3. Do NOT say "check your Files tab" or "you can find it in your Files tab".
4. Instead, describe what you created naturally without mentioning filenames.

GOOD example response: "Done! I built a promotional email with warm spring colors and a pre-order CTA, plus a matching landing page with your menu highlights."
BAD example response: "I created \\"${toolInput.name}\\" — you can find it in your Files tab."

The hidden tag <!-- file:${toolInput.name} --> automatically creates a clickable card below your message. The user clicks THAT card to view the file. If you mention the filename in text, users will try to click those words and get confused.

REMEMBER: Put <!-- file:${toolInput.name} --> on its own line. Do NOT write "${toolInput.name}" in your visible text.

MULTI-PAGE SITE: This file is part of session "${sessionId}". If you're building a multi-page site, ALL pages in this session are linked at /api/files/site/${sessionId}/{filename}. Use relative href links between pages (e.g. href="about.html", href="services.html") and the server will automatically resolve them within the same session. After creating ALL pages, include this tag in your final response so the user gets a single entry point:
<!-- site:${sessionId}:index.html -->`,
          artifact: data.artifact,
          siteUrl
        };
      }
      return { success: false, error: data.error || 'Failed to create artifact' };
    }

    // Parallel image generation — kick off all images at once, return immediately
    if (toolName === 'generate_images_parallel') {
      const { images = [], artifactName = '' } = toolInput;
      if (!images.length) return { success: false, error: 'No images specified' };

      // FIXED: Actually await all images concurrently — fire-and-forget is broken on Railway
      // (ephemeral processes don't survive long enough for background promises to complete)
      const imagePromises = images.map(async (img) => {
        try {
          const result = await executeImageTool({
            toolName: 'image_generate',
            toolInput: { prompt: img.prompt, style: img.style || 'photorealistic', aspectRatio: img.aspectRatio || '16:9' },
            sessionId,
            organizationId,
            supabase
          });
          return { id: img.id, url: result.image_url || result.url || null, success: !!(result.image_url || result.url) };
        } catch (e) {
          return { id: img.id, url: null, success: false, error: e.message };
        }
      });

      // Wait for ALL images to finish before returning
      const results = await Promise.all(imagePromises);
      const succeeded = results.filter(r => r.success && r.url);
      const failed = results.filter(r => !r.success);

      return {
        success: true,
        message: `All ${images.length} images generated. ${succeeded.length} succeeded, ${failed.length} failed. Use the imageMap below — embed these real URLs directly in your HTML. Do NOT use placeholder URLs.`,
        imageMap: Object.fromEntries(results.map(r => [r.id, r.url || null])),
        results
      };
    }

    // Update artifact images — swap placeholders with real URLs in saved HTML
    if (toolName === 'update_artifact_images') {
      const { artifactName, replacements = [] } = toolInput;
      try {
        // Wait for any pending parallel job to complete
        if (global._pendingImageJobs?.[artifactName]) {
          await global._pendingImageJobs[artifactName];
          delete global._pendingImageJobs[artifactName];
        }
        const { data: art } = await supabase.from('artifacts')
          .select('id, content')
          .eq('name', artifactName)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (!art) return { success: false, error: `Artifact ${artifactName} not found` };
        let updated = art.content || '';
        let swapped = 0;
        for (const r of replacements) {
          if (r.placeholder && r.realUrl && updated.includes(r.placeholder)) {
            updated = updated.split(r.placeholder).join(r.realUrl);
            swapped++;
          }
        }
        if (swapped > 0) {
          await supabase.from('artifacts').update({ content: updated, updated_at: new Date().toISOString() }).eq('id', art.id);
        }
        return { success: true, swapped, message: `Updated ${swapped} image(s) in ${artifactName}` };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    // swap_image_in_artifact — replace one image URL with another in an HTML artifact
    if (toolName === 'swap_image_in_artifact') {
      const { artifactId, oldSrc, newSrc } = toolInput;
      try {
        if (!artifactId || !oldSrc || !newSrc) return { success: false, error: 'artifactId, oldSrc, and newSrc are all required' };
        const { data: art } = await supabase.from('artifacts').select('id, content').eq('id', artifactId).single();
        if (!art?.content) return { success: false, error: `Artifact ${artifactId} not found` };
        const occurrences = (art.content.match(new RegExp(oldSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (occurrences === 0) return { success: false, error: `Image URL not found in artifact. Make sure oldSrc exactly matches the src in the HTML.` };
        const updated = art.content.split(oldSrc).join(newSrc);
        await supabase.from('artifacts').update({ content: updated, updated_at: new Date().toISOString() }).eq('id', art.id);
        return { success: true, replaced: occurrences, artifactId: art.id, message: `Replaced ${occurrences} instance(s) of the image` };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    // edit_artifact — server-side find-and-replace on HTML artifacts (surgical editing)
    if (toolName === 'edit_artifact') {
      const { artifactName, operations = [], fullRewrite } = toolInput;
      try {
        if (!artifactName) return { success: false, error: 'artifactName is required' };
        if (!operations.length && !fullRewrite) return { success: false, error: 'Provide operations (find/replace or CSS edits) OR fullRewrite (complete replacement HTML)' };

        const { createClient } = await import('@supabase/supabase-js');
        const editSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        // ALWAYS use the real chat session ID — ignore whatever the LLM passes as sessionId
        const sid = sessionId;
        console.log(`[edit_artifact] Looking up artifact: name="${artifactName}", session="${sid}"`);

        // Find the artifact by name + session
        let { data: arts, error: findErr } = await editSupabase
          .from('artifacts')
          .select('id, name, content, file_type')
          .eq('session_id', sid)
          .eq('name', artifactName)
          .order('created_at', { ascending: false })
          .limit(1);

        // Fallback: if not found by session, try by name alone (most recent)
        if ((!arts || arts.length === 0) && !findErr) {
          console.log(`[edit_artifact] Not found in session "${sid}", trying name-only fallback`);
          const fallback = await editSupabase
            .from('artifacts')
            .select('id, name, content, file_type, session_id')
            .eq('name', artifactName)
            .order('created_at', { ascending: false })
            .limit(1);
          if (fallback.data && fallback.data.length > 0) {
            arts = fallback.data;
            console.log(`[edit_artifact] Found via fallback in session "${arts[0].session_id}"`);
          }
        }

        if (findErr) return { success: false, error: `DB error: ${findErr.message}` };
        if (!arts || arts.length === 0) return { success: false, error: `Artifact "${artifactName}" not found. Check the filename.` };

        const artifact = arts[0];
        if (!artifact.content && !fullRewrite) return { success: false, error: `Artifact "${artifactName}" has no content to edit.` };

        // ── MODE 3: FULL REWRITE — replace entire content ──
        // Use this when edit_artifact find/replace keeps failing due to string matching issues,
        // or when restructuring large sections of a page.
        if (fullRewrite && typeof fullRewrite === 'string' && fullRewrite.length > 0) {
          let newContent = fullRewrite;
          // Strip emojis from HTML
          if (artifact.name?.endsWith('.html') || artifact.file_type === 'html') {
            newContent = newContent.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F1E0}-\u{1F1FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{200D}|\u{20E3}|\u{E0020}-\u{E007F}]/gu, '');
          }
          const { error: updateErr } = await editSupabase
            .from('artifacts')
            .update({ content: newContent, updated_at: new Date().toISOString() })
            .eq('id', artifact.id);
          if (updateErr) return { success: false, error: `Failed to save: ${updateErr.message}` };
          const fileTag = `<!-- file:${artifactName} -->`;
          console.log(`[edit_artifact] ✅ FULL REWRITE of artifact ${artifact.id} ("${artifactName}") — ${newContent.length} chars`);
          return {
            success: true,
            artifactId: artifact.id,
            artifactName,
            method: 'fullRewrite',
            contentLength: newContent.length,
            fileTag,
            message: `✅ Full rewrite applied to "${artifactName}" (${newContent.length} chars). Include ${fileTag} in your response.`
          };
        }

        let html = artifact.content;
        const results = [];

        // Helper: escape string for use in regex
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Helper: build a whitespace-flexible regex from a find string
        // Collapses each run of whitespace in `find` into \s+ so that
        // "background-color: #0066CC;" matches regardless of indentation
        const buildFlexRegex = (findStr) => {
          const parts = findStr.split(/\s+/);
          const pattern = parts.map(p => escapeRegex(p)).join('\\s+');
          return new RegExp(pattern, 'g');
        };

        // Helper: CSS-targeted edit — find a CSS selector's block and change a single property
        // This avoids the "guessing exact find string" problem entirely.
        // op.cssSelector = ".cta-button" | op.cssProperty = "background-color" | op.cssValue = "#22C55E"
        const applyCssEdit = (htmlStr, selector, property, newValue) => {
          // Escape the selector for regex (handles . # : etc.)
          const escSel = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match the selector block: .class-name { ... }   (handles whitespace variations)
          // This regex finds the selector, then everything up to the closing brace
          const blockRegex = new RegExp(escSel + '\\s*\\{([^}]*?)\\}', 'gs');
          let matched = false;
          const result = htmlStr.replace(blockRegex, (fullMatch, blockContent) => {
            matched = true;
            // Now find the property inside the block
            const propRegex = new RegExp(
              '(' + property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*)([^;!}]+)(\\s*(?:![^;]*)?;?)',
              'i'
            );
            if (propRegex.test(blockContent)) {
              // Replace the property value
              const newBlock = blockContent.replace(propRegex, '$1' + newValue + ';');
              return fullMatch.replace(blockContent, newBlock);
            } else {
              // Property doesn't exist in this block — add it
              const trimmed = blockContent.trimEnd();
              const indent = blockContent.match(/^(\s*)/)?.[1] || '  ';
              const newBlock = trimmed + (trimmed.endsWith(';') ? '' : ';') + '\n' + indent + property + ': ' + newValue + ';\n';
              return fullMatch.replace(blockContent, newBlock);
            }
          });
          return { html: result, matched };
        };

        // Apply each operation in order
        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];

          // Mode 1: CSS-targeted edit (selector + property + value)
          if (op.cssSelector && op.cssProperty && op.cssValue) {
            const { html: newHtml, matched } = applyCssEdit(html, op.cssSelector, op.cssProperty, op.cssValue);
            if (matched) {
              html = newHtml;
              results.push({
                index: i,
                success: true,
                occurrences: 1,
                method: 'css-targeted',
                description: op.description || `Set ${op.cssSelector} { ${op.cssProperty}: ${op.cssValue} }`
              });
            } else {
              results.push({
                index: i,
                success: false,
                error: `CSS selector "${op.cssSelector}" not found in the HTML/CSS.`,
                description: op.description || ''
              });
            }
            continue;
          }

          // Mode 2: find-and-replace (original mode)
          if (!op.find) {
            results.push({ index: i, success: false, error: 'Missing "find" string (or use cssSelector+cssProperty+cssValue for CSS edits)' });
            continue;
          }

          // Try 1: exact match
          let idx = html.indexOf(op.find);
          if (idx !== -1) {
            // Count occurrences
            let count = 0;
            let searchFrom = 0;
            while (true) {
              const pos = html.indexOf(op.find, searchFrom);
              if (pos === -1) break;
              count++;
              searchFrom = pos + op.find.length;
            }
            html = html.split(op.find).join(op.replace);
            results.push({
              index: i,
              success: true,
              occurrences: count,
              method: 'exact',
              description: op.description || `Replaced ${count} occurrence(s)`
            });
            continue;
          }

          // Try 2: whitespace-flexible regex match
          // This handles CSS indentation differences (tabs vs spaces, different indent levels)
          try {
            const flexRegex = buildFlexRegex(op.find);
            const matches = html.match(flexRegex);
            if (matches && matches.length > 0) {
              console.log(`[edit_artifact] Whitespace-flex match for op ${i}: found ${matches.length} match(es). First match: "${matches[0].slice(0, 80)}..."`);
              // For each match, figure out the replacement preserving whitespace intent
              // We replace the matched text with the replacement text
              html = html.replace(flexRegex, op.replace);
              results.push({
                index: i,
                success: true,
                occurrences: matches.length,
                method: 'whitespace-flex',
                description: op.description || `Replaced ${matches.length} occurrence(s) via whitespace-flexible match`
              });
              continue;
            }
          } catch (regexErr) {
            console.log(`[edit_artifact] Flex regex failed for op ${i}: ${regexErr.message}`);
          }

          // Both tries failed
          results.push({
            index: i,
            success: false,
            error: `String not found. STOP using find-and-replace. Use fullRewrite mode instead: call edit_artifact with fullRewrite parameter containing the complete updated HTML.`,
            find_preview: op.find.slice(0, 120),
            description: op.description || ''
          });
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        // Strip emojis from HTML before saving (server-side emoji ban enforcement)
        if (successCount > 0 && (artifact.name?.endsWith('.html') || artifact.file_type === 'html')) {
          const beforeLen = html.length;
          // Reuse stripEmojis pattern — inline for edit_artifact scope
          html = html.replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F1E0}-\u{1F1FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{200D}|\u{20E3}|\u{E0020}-\u{E007F}|\u{2B50}|\u{2B55}|\u{231A}-\u{231B}|\u{23E9}-\u{23F3}|\u{23F8}-\u{23FA}|\u{25AA}-\u{25AB}|\u{25B6}|\u{25C0}|\u{25FB}-\u{25FE}|\u{2614}-\u{2615}|\u{2648}-\u{2653}|\u{267F}|\u{2693}|\u{26A1}|\u{26AA}-\u{26AB}|\u{26BD}-\u{26BE}|\u{26C4}-\u{26C5}|\u{26CE}|\u{26D4}|\u{26EA}|\u{26F2}-\u{26F3}|\u{26F5}|\u{26FA}|\u{26FD}|\u{2702}|\u{2705}|\u{2708}-\u{270D}|\u{270F}|\u{2712}|\u{2714}|\u{2716}|\u{271D}|\u{2721}|\u{2728}|\u{2733}-\u{2734}|\u{2744}|\u{2747}|\u{274C}|\u{274E}|\u{2753}-\u{2755}|\u{2757}|\u{2763}-\u{2764}|\u{2795}-\u{2797}|\u{27A1}|\u{27B0}|\u{2934}-\u{2935}|\u{2B05}-\u{2B07}|\u{3030}|\u{303D}|\u{3297}|\u{3299}|\u{FE0F}]/gu, '');
          const strippedChars = beforeLen - html.length;
          if (strippedChars > 0) console.log(`[edit_artifact] EMOJI STRIP: removed ${strippedChars} emoji characters from "${artifactName}"`);
        }

        // Save the modified HTML back to Supabase
        if (successCount > 0) {
          const { error: updateErr } = await editSupabase
            .from('artifacts')
            .update({ content: html, updated_at: new Date().toISOString() })
            .eq('id', artifact.id);

          if (updateErr) return { success: false, error: `Failed to save: ${updateErr.message}` };
          console.log(`[edit_artifact] ✅ Saved ${successCount} edit(s) to artifact ${artifact.id} ("${artifactName}")`);
        }

        // Build the file tag so frontend shows the updated card
        const fileTag = `<!-- file:${artifactName} -->`;

        return {
          success: successCount > 0,
          artifactId: artifact.id,
          artifactName: artifactName,
          totalOperations: operations.length,
          successful: successCount,
          failed: failCount,
          results,
          fileTag,
          // When ALL operations fail, include the current HTML so the model can do a fullRewrite immediately
          currentHTML: successCount === 0 ? html.slice(0, 60000) : undefined,
          message: successCount > 0
            ? `✅ Applied ${successCount}/${operations.length} edit(s) to "${artifactName}". Include ${fileTag} in your response so the user sees the updated file card.`
            : `❌ FIND-AND-REPLACE FAILED. DO NOT retry find-and-replace — it will fail again. You MUST use fullRewrite mode NOW. The current HTML is included in this response as "currentHTML". Make your changes to it and call edit_artifact with: {"artifactName": "${artifactName}", "sessionId": "${sid}", "fullRewrite": "<the modified HTML>", "operations": []}. This is MANDATORY.`
        };
      } catch (e) {
        return { success: false, error: `edit_artifact error: ${e.message}` };
      }
    }

    // list_ai_images — browse all AI-generated images in the Supabase library
    if (toolName === 'list_ai_images') {
      const { search = '', limit = 50 } = toolInput;
      try {
        let query = supabase
          .from('artifacts')
          .select('id, name, description, storage_path, created_at')
          .eq('file_type', 'image')
          .not('storage_path', 'is', null)
          .order('created_at', { ascending: false })
          .limit(Math.min(parseInt(limit) || 50, 200));
        const { data, error } = await query;
        if (error) throw error;
        let images = (data || []).filter(r => r.storage_path?.startsWith('http'));
        if (search) {
          const term = search.toLowerCase();
          images = images.filter(r => (r.description || r.name || '').toLowerCase().includes(term));
        }
        return {
          success: true,
          total: images.length,
          images: images.map(r => ({
            id: r.id,
            url: r.storage_path,
            name: r.name,
            description: r.description || '',
            created_at: r.created_at
          }))
        };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

        // Load skill — injects expert instructions into the conversation
    if (toolName === 'polymarket_analyze') {
      const features = agentConfig && agentConfig.config && agentConfig.config.features ? agentConfig.config.features : [];
      if (!features.includes('polymarket_alpha')) {
        return { success: false, error: 'BLOOM Alpha is a premium feature. Contact your account manager to upgrade.' };
      }
      const { question, market_id, market_probability, category = 'Uncategorized' } = toolInput;
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        let cal = null;
        const calResult = await sb.schema('polymarket').table('category_calibration').select('*').eq('category', category).single();
        cal = calResult.data;
        if (!cal) {
          const fb = await sb.schema('polymarket').table('category_calibration').select('*').eq('category', 'Uncategorized').single();
          cal = fb.data || { actual_win_rate: 0.43, sample_size: 100, confidence_level: 0.5, bias_coefficient: 0.07 };
        }
        const baseRate = parseFloat(cal.actual_win_rate);
        const sampleSize = parseInt(cal.sample_size);
        const gap = baseRate - market_probability;
        const absGap = Math.abs(gap);
        const histResult = await sb.schema('polymarket').table('contracts').select('question,resolution,volume').eq('category', category).not('resolution', 'is', null).order('volume', { ascending: false }).limit(5);
        const similar = (histResult.data || []).map(c => c.question.slice(0,80) + ': ' + (c.resolution === 1 ? 'YES' : 'NO')).join(' | ');
        const decision = absGap >= 0.08 && sampleSize >= 50 ? (gap > 0 ? 'BET YES' : 'BET NO') : absGap >= 0.05 ? 'WATCH' : 'SKIP';
        return {
          success: true,
          analysis: {
            contract: question, market_id: market_id || 'unknown', category,
            market_probability, historical_base_rate: baseRate, sample_size: sampleSize,
            gap: parseFloat(gap.toFixed(4)), decision,
            confidence: sampleSize >= 100 ? 'HIGH' : sampleSize >= 50 ? 'MEDIUM' : 'LOW',
            reasoning: 'Category [' + category + '] base rate: ' + (baseRate*100).toFixed(1) + '% YES vs market: ' + (market_probability*100).toFixed(1) + '% YES. Gap: ' + (gap*100).toFixed(1) + '%. ' + (gap > 0 ? 'Crowd underpricing YES.' : 'Crowd overpricing YES.'),
            similar_resolved: similar,
            kelly_fraction: absGap >= 0.08 ? parseFloat(Math.min(0.40, Math.max(0.02, absGap * 0.25)).toFixed(4)) : 0
          }
        };
      } catch (err) {
        logger.error('polymarket_analyze error:', err.message);
        return { success: false, error: 'Analysis failed: ' + err.message };
      }
    }

    if (toolName === 'load_skill') {
      try {
        const skillName = toolInput.skill_name;
        
        // Load directly from the catalog file by name — bypasses broken type-mapping indirection
        const skillsDir = new URL('../skills/catalog', import.meta.url).pathname;
        const skillFile = path.join(skillsDir, `${skillName}.md`);
        
        if (!fs.existsSync(skillFile)) {
          // List available skills by scanning the catalog dir
          const available = fs.readdirSync(skillsDir)
            .filter(f => f.endsWith('.md'))
            .map(f => f.replace('.md', ''));
          return { success: false, error: `Skill "${skillName}" not found. Available: ${available.join(', ')}. Do NOT mention this to the user — just proceed with the task using your system prompt instructions.` };
        }
        
        const raw = fs.readFileSync(skillFile, 'utf-8');
        // Strip YAML frontmatter (--- ... ---)
        const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
        const skillBody = fmMatch ? fmMatch[1].trim() : raw.trim();
        
        if (!skillBody) {
          return { success: false, error: `Skill "${skillName}" file is empty` };
        }
        
        // Return skill body in result — caller injects into context via tool result
        // (systemPrompt is out of scope here — this is the correct pattern)
        logger.info('Skill loaded via tool', { skill: skillName, length: skillBody.length });
        return { 
          success: true, 
          skillName,
          skillBody,
          message: `Loaded "${skillName}" skill. Follow these expert guidelines for this task:\n\n${skillBody.slice(0, 2000)}`,
          _injectSkill: true
        };
      } catch(e) {
        return { success: false, error: `Skill loading failed (internal): ${e.message}. IMPORTANT: Do NOT mention this error to the user. Skill failures are internal — proceed with the task using your system prompt instructions. Never say "the skill failed" or "I couldn't load the skill" to the user.` };
      }
    }

    // DOCX document creation — executes a Node.js script using the docx library
    if (toolName === 'create_docx') {
      try {
        const filename = toolInput.name || 'document.docx';
        const tmpDir = '/tmp/bloom-docx';
        const tmpScript = `${tmpDir}/build-${Date.now()}.js`;
        const tmpOutput = `${tmpDir}/${filename}`;
        
        // Ensure tmp directory exists
        const fsMod = await import('fs');
        const pathMod = await import('path');
        if (!fsMod.default.existsSync(tmpDir)) fsMod.default.mkdirSync(tmpDir, { recursive: true });
        
        // Replace OUTPUT_PATH in the script with actual path
        const script = toolInput.script.replace(/OUTPUT_PATH/g, `"${tmpOutput}"`);
        fsMod.default.writeFileSync(tmpScript, script);
        
        // Execute the script
        const { execSync } = await import('child_process');
        const result = execSync(`cd /app && node "${tmpScript}"`, { timeout: 30000, encoding: 'utf8' });
        
        if (fsMod.default.existsSync(tmpOutput)) {
          // Read the docx file and save as artifact
          const docxBuffer = fsMod.default.readFileSync(tmpOutput);
          const base64 = docxBuffer.toString('base64');
          
          // Save to artifacts API
          const port = process.env.PORT || 3000;
          const saveResp = await fetch(`http://localhost:${port}/api/files/artifacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: filename,
              description: toolInput.description,
              fileType: 'binary',
              mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              content: base64,
              sessionId: sessionId,
              organizationId: orgId || agentConfig?.organizationId || agentConfig?.organization_id || process.env.BLOOM_ORG_ID
            })
          });
          const saveData = await saveResp.json();
          
          // Cleanup
          try { fsMod.default.unlinkSync(tmpScript); fsMod.default.unlinkSync(tmpOutput); } catch {}
          
          if (saveData.success) {
            return {
              success: true,
              message: `Created "${filename}" — professional Word document ready for download.`,
              artifact: saveData.artifact,
              downloadUrl: saveData.artifact?.downloadUrl
            };
          }
          return { success: false, error: saveData.error || 'Failed to save docx artifact' };
        }
        return { success: false, error: 'Script ran but no .docx file was created. Check script output: ' + result };
      } catch (docxErr) {
        logger.error('DOCX creation failed', { error: docxErr.message });
        return { success: false, error: `DOCX creation failed: ${docxErr.message}. Try creating as HTML instead using create_artifact.` };
      }
    }

    // Scheduled task creation
    if (toolName === 'create_scheduled_task') {
      const port = process.env.PORT || 3000;
      const resp = await fetch(`http://localhost:${port}/api/agent/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: toolInput.name,
          description: toolInput.description || '',
          taskType: toolInput.taskType || 'custom',
          instruction: toolInput.instruction,
          frequency: toolInput.frequency || 'daily',
          runTime: toolInput.runTime || '09:00'
        })
      });
      const data = await resp.json();
      if (data.success) {
        return {
          success: true,
          message: `Scheduled task "${toolInput.name}" created — runs ${toolInput.frequency || 'daily'} at ${toolInput.runTime || '9:00 AM'}.`
        };
      }
      return { success: false, error: data.error || 'Failed to create scheduled task' };
    }

    // Dispatch to specialist — multi-model routing
    if (toolName === 'dispatch_to_specialist') {
      try {
        const { callModel } = await import('../llm/unified-client.js');
        const { calculateCost } = await import('../orchestrator/router.js');

        // Model mapping
        // Model selection for specialist dispatch — respects admin config, falls back to env vars
        // NEVER hardcode to a provider that may have no credits (e.g. Claude without budget)
        // Resolve the org's configured model fresh (resolvedAdminConfig may be in scope from parent)
        let adminModel = 'gemini-2.5-flash'; // safe fallback
        try {
          const { getResolvedConfig } = await import('../config/admin-config.js');
          const _cfg = await getResolvedConfig(orgId || null);
          adminModel = _cfg?.model || 'gemini-2.5-flash';
        } catch (_e) { /* use fallback */ }
        const modelForType = {
          writing: process.env.MODEL_WRITING || adminModel,   // use org's configured model
          email: process.env.MODEL_EMAIL || 'gpt-4o',
          coding: process.env.MODEL_CODING || 'deepseek-chat',
          image: 'gpt-4o',
          video: 'veo3', // premium tier only
        };

        const taskType = toolInput.taskType || 'writing';
        const model = modelForType[taskType] || modelForType.writing;

        // Premium check for video
        if (taskType === 'video') {
          const videoEnabled = process.env.VIDEO_GENERATION_ENABLED === 'true';
          if (!videoEnabled) {
            return {
              success: false,
              error: 'Video generation is a premium feature. Let the client know this is available on the Bloomie Pro or Enterprise plan, and that you can help them upgrade if interested.',
              premiumRequired: true,
              feature: 'video_generation'
            };
          }
        }

        // System prompts per specialist type
        const specialistSystems = {
          writing: 'You are a world-class content writer. Write polished, engaging, professional content. Output in clean markdown format. No preamble — go straight into the content.',
          email: 'You are an expert email and copy specialist. Write punchy, persuasive, conversion-focused copy. Be concise and compelling. No preamble — deliver the copy directly.',
          coding: 'You are an expert frontend developer and coder. Write clean, production-ready code. Include comments where helpful. No explanations unless asked — just deliver working code.',
          image: 'You are an elite commercial photography director and prompt engineer. Write image prompts as rich narrative paragraphs that produce photorealistic, magazine-quality results. Every prompt MUST include: (1) specific subject with physical details, (2) exact lighting setup with direction and quality, (3) camera + lens specs (e.g. "Shot on Canon R5 with 85mm f/1.4, shallow depth of field"), (4) composition and framing, (5) color palette and mood, (6) quality anchor ("Professional editorial photography, magazine quality"). Default style is ALWAYS photorealistic commercial photography — never cartoon or illustrated unless explicitly asked. For text in images: specify exact words in quotes, font style, size, color, placement, and shadow/outline treatment.',
          video: 'You are a video creative director. Write a detailed video generation prompt including: scene description, camera movement, duration, mood, lighting, style, and any text overlays. Be specific enough for AI video generation.',
        };

        // Inject matching skill context into specialist prompt
        let skillContext = '';
        try {
          const { getSkillContext } = await import('../skills/skill-loader.js');
          skillContext = getSkillContext(taskType, toolInput.specialistPrompt);
        } catch (e) { /* skills not critical */ }

        logger.info('Dispatching to specialist', { taskType, model, promptLength: toolInput.specialistPrompt?.length, hasSkill: !!skillContext });

        const result = await callModel(model, {
          system: (specialistSystems[taskType] || specialistSystems.writing) + skillContext,
          messages: [{ role: 'user', content: toolInput.specialistPrompt }],
          maxTokens: 4096,
          temperature: 0.4,
        });

        const costCents = calculateCost(model, result.usage);

        logger.info('Specialist completed', {
          taskType, model,
          tokens: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
          costCents
        });

        return {
          success: true,
          specialistOutput: result.text,
          model: model,
          provider: result.provider,
          taskType: taskType,
          tokensUsed: (result.usage?.inputTokens || 0) + (result.usage?.outputTokens || 0),
          costCents: costCents,
          message: `Specialist (${model}) completed the ${taskType} task.`
        };
      } catch (dispatchError) {
        logger.error('Specialist dispatch failed', { error: dispatchError.message, taskType: toolInput.taskType });
        
        // FALLBACK: Run on main model (Claude) instead of specialist
        // The user should NEVER know a specialist failed
        try {
          logger.info('Specialist failed — falling back to main model', { taskType: toolInput.taskType });
          
          let skillContext = '';
          try {
            const { getSkillContext } = await import('../skills/skill-loader.js');
            skillContext = getSkillContext(toolInput.taskType || 'writing', toolInput.specialistPrompt);
          } catch (e) {}

          const fallbackResult = await callLLMWithRetry({
            model: llmClient.model, // use whatever model is currently active — no hardcoded Anthropic
            max_tokens: 4096,
            system: 'You are an expert at this task. Deliver the highest quality output possible. No preamble — go straight into the deliverable.' + skillContext,
            messages: [{ role: 'user', content: toolInput.specialistPrompt }],
          }, 3); // no agentClient — use unified client so failover works

          const fallbackText = fallbackResult.content?.map(b => b.text || '').join('') || '';
          
          if (fallbackText.length > 50) {
            logger.info('Fallback to main model succeeded', { length: fallbackText.length });
            return {
              success: true,
              specialistOutput: fallbackText,
              model: 'claude-fallback',
              taskType: toolInput.taskType,
              message: `Task completed successfully.`,
              wasFallback: true
            };
          }
        } catch (fallbackErr) {
          logger.error('Fallback also failed', { error: fallbackErr.message });
        }

        // If even fallback fails, tell Sarah firmly to do it herself
        return {
          success: false,
          error: `The specialist model is unavailable. DO NOT ask the user about this or mention any technical issue. Complete this task yourself RIGHT NOW with your own capabilities. You have the skills loaded — use them. Deliver the output directly.`,
          fallback: true,
          mustSelfComplete: true
        };
      }
    }

    // ── MODEL SWITCHING — on-the-fly per-org model changes (multi-tenant safe) ──
    if (toolName === 'switch_model') {
      const { setOrgModelPreference, getOrgModelPreference, getLLMClient: _getLLM } = await import('../llm/unified-client.js');
      const llm = _getLLM();
      const currentOrgId = orgId || process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
      const currentPref = getOrgModelPreference(currentOrgId);
      const oldModel = currentPref?.model || llm.model;

      // Shorthand → full model string mapping
      const MODEL_SHORTHANDS = {
        'sonnet':     'claude-sonnet-4-6',
        'sonnet4.6':  'claude-sonnet-4-6',
        'sonnet4.5':  'claude-sonnet-4-5-20250929',
        'haiku':      'claude-haiku-4-5-20251001',
        'gpt':        'gpt-4o',
        'gpt4o':      'gpt-4o',
        'gpt4o-mini': 'gpt-4o-mini',
        'gpt-4o':     'gpt-4o',
        'gpt-4o-mini':'gpt-4o-mini',
        'gemini':     'gemini-2.5-flash',
        'deepseek':   'deepseek-chat',
        'opus':       'claude-opus-4-6',
      };

      const requestedModel = toolInput.model?.toLowerCase()?.trim();
      const resolvedModel = MODEL_SHORTHANDS[requestedModel] || requestedModel;
      const switched = setOrgModelPreference(currentOrgId, resolvedModel);

      if (switched) {
        logger.info('Model switched via tool (per-org)', { orgId: currentOrgId, from: oldModel, to: resolvedModel, reason: toolInput.reason });
        return {
          _status: 'SUCCESS',
          _message: `Model switched successfully.`,
          previousModel: oldModel,
          currentModel: resolvedModel,
          currentProvider: detectProvider(resolvedModel),
          reason: toolInput.reason || 'Operator requested'
        };
      } else {
        return {
          _status: 'FAILED',
          _message: `Could not switch to "${resolvedModel}" — the API key for that provider is not configured. Available models: ${llm.getAvailableModels().map(m => m.model).join(', ')}`,
          requestedModel: resolvedModel,
          availableModels: llm.getAvailableModels()
        };
      }
    }

    if (toolName === 'get_model_status') {
      const { getLLMClient: _getLLM2, getOrgModelPreference: _getOrgPref } = await import('../llm/unified-client.js');
      const llm = _getLLM2();
      const currentOrgId = orgId || process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
      const userPref = _getOrgPref(currentOrgId);
      const effectiveModel = userPref?.model || llm.model;
      return {
        currentModel: effectiveModel,
        currentProvider: detectProvider(effectiveModel),
        userPreferenceSet: !!userPref,
        singletonDefault: llm.model,
        failoverActive: llm.isFailoverActive,
        availableModels: llm.getAvailableModels(),
        providerHealth: llm.getProviderHealth()
      };
    }

    // Browser tools — Sarah's own computer
    if (toolName.startsWith('browser_')) {
      const { executeBrowserTool } = await import('../tools/browser-tools.js');
      // AI-driven browser automation via sidecar
      if (toolName === 'browser_task') {
        return await executeBrowserTool('browser_task', toolInput);
      }
      if (toolName === 'browser_list_sites') {
        return await executeBrowserTool('browser_list_sites', toolInput);
      }
      if (toolName === 'browser_login') {
        return await executeBrowserTool('browser_login', toolInput);
      }
      if (toolName === 'browser_screenshot') {
        const browserAgentUrl = process.env.BROWSER_AGENT_URL;
        if (browserAgentUrl) {
          return await executeBrowserTool('browser_screenshot', toolInput);
        }
        const localPort = process.env.PORT || 3000;
        const localBase = `http://localhost:${localPort}/api/browser`;
        const r = await fetch(`${localBase}/screenshot`);
        const d = await r.json();
        return { live: d.live, url: d.url, message: d.live ? `Browser active at ${d.url}` : 'Browser idle' };
      }
    }

    // Gmail tools
    if (toolName.startsWith('gmail_')) {
      const { executeGmailTool } = await import('../tools/gmail-tools.js');
      return await executeGmailTool(toolName, toolInput);
    }

    // Document tools
    if (toolName === 'bloom_create_document' || toolName === 'bloom_list_documents' || toolName === 'bloom_update_document') {
      const { internalToolExecutors } = await import('../tools/internal-tools.js');
      const executor = internalToolExecutors[toolName];
      if (executor) return await executor(toolInput);
      return { error: `Document tool ${toolName} not found` };
    }

    // ── USER'S COMPUTER CONTROL (bloom_* tools) ───────────────────────────
    const DOCUMENT_TOOLS = ['bloom_create_document', 'bloom_list_documents', 'bloom_update_document', 'bloom_log', 'bloom_list_scheduled_tasks', 'bloom_create_scheduled_task', 'bloom_update_scheduled_task', 'bloom_delete_scheduled_task'];
    if (toolName.startsWith('bloom_') && !DOCUMENT_TOOLS.includes(toolName)) {
      const SARAH_URL = process.env.SARAH_URL || `http://localhost:${process.env.PORT || 3000}`;
      const { v4: uuidv4 } = await import('uuid');

      // Find the active desktop session
      const statusRes = await fetch(`${SARAH_URL}/api/desktop/status`);
      const statusData = await statusRes.json();
      if (!statusData.sessions || statusData.sessions.length === 0) {
        return { error: 'No desktop connected. Ask the user to open the BLOOM Desktop app on their computer.' };
      }
      const desktopSessionId = statusData.sessions[0].sessionId;
      const commandId = uuidv4();

      // Queue the command
      const cmdRes = await fetch(`${SARAH_URL}/api/desktop/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: desktopSessionId, commandId, tool: toolName, args: toolInput })
      });
      if (!cmdRes.ok) {
        return { error: `Failed to send command to desktop: ${cmdRes.status}` };
      }

      // Poll for result (up to 15 seconds)
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
        const resultRes = await fetch(`${SARAH_URL}/api/desktop/result/${commandId}`);
        if (resultRes.ok) {
          const resultData = await resultRes.json();
          if (resultData.ready) return resultData;
        }
      }
      return { error: 'Desktop command timed out — the user may have minimized or closed BLOOM Desktop.' };
    }

    return { error: `Unknown tool: ${toolName}` };

  } catch (error) {
    logger.error(`Tool failed: ${toolName}`, { error: error.message });
    return { 
      error: `Tool "${toolName}" encountered an error: ${error.message}. Proceed with available alternatives.`,
      continueWithout: true
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL-AGNOSTIC CHAT — uses Unified LLM Client with automatic failover
// Supports: Claude, GPT-4o, GPT-4o-mini, Gemini, DeepSeek
// Failover: primary model → next in chain → next → error
// Response format: always returns Anthropic-compatible shape so the agentic
// loop doesn't need to know which model is actually running.
// ═══════════════════════════════════════════════════════════════════════════

// Convert unified client response → Anthropic-native field names
// so the rest of chatWithAgent works unchanged regardless of provider.
function toAnthropicFormat(unifiedResponse) {
  return {
    content: unifiedResponse.content || [],
    stop_reason: unifiedResponse.stopReason === 'tool_use' ? 'tool_use' : 'end_turn',
    usage: {
      input_tokens: unifiedResponse.usage?.inputTokens || 0,
      output_tokens: unifiedResponse.usage?.outputTokens || 0,
    },
    model: unifiedResponse.model,
    _provider: unifiedResponse.raw?.provider || 'unknown',
  };
}

// Primary call path — uses unified client with failover + retry
async function callLLMWithRetry(params, maxRetries = 3, client = null) {
  const llm = getLLMClient();
  // Use per-request model if provided (multi-tenant safe), otherwise fall back to singleton
  const requestModel = params.model || llm.model;
  const requestProvider = detectProvider(requestModel);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 150 second timeout per attempt
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('LLM API timeout (150s)')), 150000)
      );

      // The unified client handles format conversion internally:
      // - Anthropic: sends native format
      // - OpenAI/Gemini/DeepSeek: converts messages + tools to OpenAI format
      // - Response is always normalized to Anthropic-style content blocks
      //
      // chatWithModel() is multi-tenant safe — it does NOT mutate the singleton.
      // The model is scoped to this single call and doesn't affect concurrent requests.
      const unifiedResult = await Promise.race([
        llm.chatWithModel(requestModel, {
          messages: params.messages,
          system: params.system,
          tools: params.tools || [],
          maxTokens: params.max_tokens || 8192,
          temperature: params.temperature || 0.1,
        }),
        timeoutPromise,
      ]);

      // Log which model handled the request
      logger.info(`Request completed`, { model: requestModel, provider: requestProvider });

      return toAnthropicFormat(unifiedResult);
    } catch (err) {
      const status = err?.status || err?.error?.status;
      const errMsg = err?.message || '';

      // Don't retry on genuine request errors (prompt too long, bad params) — retrying won't help.
      // BUT DO retry on billing/credit/auth errors — the failover chain can switch providers.
      const isBillingOrAuth = errMsg.includes('credit balance') || errMsg.includes('billing') ||
        errMsg.includes('quota') || errMsg.includes('insufficient') || errMsg.includes('unauthorized') ||
        errMsg.includes('api key') || errMsg.includes('authentication');
      if ((status === 400 || errMsg.includes('prompt is too long') || errMsg.includes('invalid_request_error')) && !isBillingOrAuth) {
        logger.error(`LLM API invalid request (not retryable): ${errMsg.slice(0, 200)}`);
        throw err;
      }

      // Billing/auth errors should trigger failover, not retry loops
      if (isBillingOrAuth) {
        logger.warn(`Provider billing/auth error detected, triggering failover: ${errMsg.slice(0, 200)}`);
        throw err; // Let the unified client's failover chain handle this
      }

      // The unified client already handles failover for 429/529/5xx errors internally.
      // This retry loop handles transient errors that the unified client didn't catch.
      const isTransient = status === 429 || status === 529 ||
        errMsg.includes('overloaded') || errMsg.includes('rate limit') || errMsg.includes('timeout');

      if (isTransient && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        logger.warn(`LLM API transient error, retrying in ${Math.round(delay/1000)}s (attempt ${attempt+1}/${maxRetries}): ${errMsg.slice(0, 100)}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// Legacy direct Anthropic call — ONLY used for specialist dispatch fallback
// and any code that explicitly needs the Anthropic SDK.
async function callAnthropicDirect(params, maxRetries = 2, client = null) {
  const apiClient = client || anthropic;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Anthropic API timeout (150s)')), 150000)
      );
      return await Promise.race([
        apiClient.messages.create(params),
        timeoutPromise
      ]);
    } catch (err) {
      const status = err?.status || err?.error?.status;
      const errMsg = err?.message || '';
      const isBillingDirect = errMsg.includes('credit balance') || errMsg.includes('billing') || errMsg.includes('quota');
      if ((status === 400 || errMsg.includes('prompt is too long') || errMsg.includes('invalid_request_error')) && !isBillingDirect) throw err;
      if (isBillingDirect) throw err; // Propagate to caller — they should use the unified client with failover instead
      const isOverloaded = status === 529 || errMsg.includes('overloaded') || errMsg.includes('529');
      const isRateLimit = status === 429;
      if ((isOverloaded || isRateLimit) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
        logger.warn(`Anthropic direct call retry in ${Math.round(delay/1000)}s (attempt ${attempt+1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

async function chatWithAgent(userMessage, history, agentConfig, sessionId = null, orgId = null) {
  // Get the right Anthropic client — per-agent key if configured, otherwise platform key
  const agentClient = getAnthropicClient(agentConfig);
  let systemPrompt = buildSystemPrompt(agentConfig);

  // LIVE DESKTOP DETECTION — auto-detect if BLOOM Desktop app is running
  // Pings /api/desktop/status to check for active desktop sessions.
  // If no desktop connected → strip desktop tools so agent doesn't hallucinate.
  // If desktop connected → keep all 42 desktop tools in the system prompt.
  try {
    const _desktopCheckUrl = process.env.SARAH_URL || `http://localhost:${process.env.PORT || 3000}`;
    const _desktopStatus = await Promise.race([
      fetch(`${_desktopCheckUrl}/api/desktop/status`).then(r => r.json()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('desktop check timeout')), 3000))
    ]);
    const _hasDesktop = _desktopStatus?.sessions?.length > 0;
    if (!_hasDesktop) {
      // No desktop app connected — strip desktop tool instructions
      systemPrompt = systemPrompt.replace(/MODE 2 — USER'S COMPUTER[\s\S]*?BLOOM DESKTOP PERMISSION RULES:[\s\S]*?ask each time\.\n.*?BLOOM Desktop app instead\?"/g, '');
      logger.info('No desktop app connected — desktop tools stripped from prompt');
    } else {
      logger.info('Desktop app detected — all desktop tools enabled', {
        sessions: _desktopStatus.sessions.length,
        sessionId: _desktopStatus.sessions[0]?.sessionId
      });
    }
  } catch(e) {
    // Fail OPEN — if detection fails, keep desktop tools in the prompt.
    // Better to have tools that return "no desktop connected" errors
    // than silently strip capabilities the user expects.
    logger.warn('Desktop auto-detection failed (keeping tools enabled):', e.message);
  }

  // Inject brand kit if available — multi-tenant: always scoped to the org of the current chat session
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    let allKits = [];

    // Resolve org ID: use the orgId param passed to chatWithAgent, fall back to agentConfig, then env var
    const brandKitOrgId = orgId
      || agentConfig?.organizationId
      || agentConfig?.organization_id
      || process.env.BLOOM_ORG_ID
      || 'a1000000-0000-0000-0000-000000000001';

    // Always filter by organization_id — each org gets its own brand kits
    let bkQuery = sb.from('user_settings').select('value').eq('key','brand_kits');
    if (brandKitOrgId) bkQuery = bkQuery.eq('organization_id', brandKitOrgId);
    const { data: bkRow } = await bkQuery.maybeSingle();

    // value is jsonb — Supabase returns it already parsed, no JSON.parse needed
    if (bkRow?.value) allKits = Array.isArray(bkRow.value) ? bkRow.value : [bkRow.value];
    if (allKits.length === 0) {
      // Fall back to legacy single brand_kit key, also org-scoped
      let oldQuery = sb.from('user_settings').select('value').eq('key','brand_kit');
      if (brandKitOrgId) oldQuery = oldQuery.eq('organization_id', brandKitOrgId);
      const { data: oldRow } = await oldQuery.maybeSingle();
      if (oldRow?.value) allKits = [oldRow.value];
    }
    
    logger.info('Brand kit check', { kitsFound: allKits.length, hasColors: allKits[0]?.colors?.length || 0 });
    
    if (allKits.length > 1) {
      // Multiple kits — tell the Bloomie about all of them and REQUIRE bloom_clarify before any creative work
      const kitNames = allKits.map(k => k.kitName || 'Unnamed Kit');
      const kitSummaries = allKits.map((k,i) => `${i+1}. "${k.kitName||'Unnamed Kit'}"${k.active?' (currently active)':''} — primary: ${k.colors?.[0]||'?'}, accent: ${k.colors?.[1]||'?'}`).join('\n');
      const kitOptionsJson = allKits.map(k => `{"label":"${k.kitName||'Unnamed Kit'}","description":"${(k.tagline||'').replace(/"/g,"'")}"}`).join(',');
      systemPrompt += `\n\nBRAND KITS — MULTIPLE BRANDS AVAILABLE:
The operator has ${allKits.length} brand kits configured:
${kitSummaries}

MANDATORY RULE — NO EXCEPTIONS:
Before creating ANY design, website, email, image, document, flyer, social post, or any other content, you MUST call bloom_clarify to ask which brand. Do this FIRST, before any other tool call.

Use this exact bloom_clarify call:
{
  "question": "Which brand is this for?",
  "options": [${kitOptionsJson}],
  "context": "I have ${allKits.length} brand kits configured and need to use the right colors, fonts, and voice."
}

Only skip this if the user already specified the brand in their message (e.g. "make a YES flyer" or "create a SABWB post").
Once confirmed, use that brand's exact colors as CSS variables, load their fonts from Google Fonts, and match their voice in all copy.
DO NOT ask about colors, fonts, or visual style — you already have all of that in the brand kit.`;
      
      // Also inject the active kit details as the default
      const bk = allKits.find(k => k.active) || allKits[0];
      if (bk) {
        const brandLines = [];
        if (bk.kitName) brandLines.push(`Active brand: ${bk.kitName}`);
        if (bk.colors?.length) brandLines.push(`Colors: ${bk.colors.join(', ')}`);
        if (bk.fonts?.heading) brandLines.push(`Heading font: ${bk.fonts.heading}`);
        if (bk.fonts?.body) brandLines.push(`Body font: ${bk.fonts.body}`);
        if (bk.tagline) brandLines.push(`Tagline: "${bk.tagline}"`);
        if (bk.brandVoice) brandLines.push(`Voice: ${bk.brandVoice}`);
        systemPrompt += `\nDefault (active) kit:\n${brandLines.join('\n')}`;
      }
    } else if (allKits.length === 1) {
      // Single kit — use it directly, no need to ask
      const bk = allKits[0];
      const brandLines = [];
      if (bk.kitName) brandLines.push(`Brand: ${bk.kitName}`);
      if (bk.colors?.length) brandLines.push(`Brand colors: ${bk.colors.join(', ')} (first = primary, second = accent)`);
      if (bk.fonts?.heading) brandLines.push(`Heading font: ${bk.fonts.heading}`);
      if (bk.fonts?.body) brandLines.push(`Body font: ${bk.fonts.body}`);
      if (bk.tagline) brandLines.push(`Tagline: "${bk.tagline}"`);
      if (bk.brandVoice) brandLines.push(`Brand voice: ${bk.brandVoice}`);
      if (bk.logo) brandLines.push(`Brand logo is uploaded — reference it in designs when appropriate`);
      if (brandLines.length > 0) {
        const brandKitBlock = `\n\nBRAND KIT — MANDATORY FOR ALL CREATIVE OUTPUT:
You MUST use these brand assets in every design, website, email, document, social post, and any visual or written content you create.
${brandLines.join('\n')}
Use these colors as CSS variables. Load these fonts from Google Fonts. Match this voice in all copy.
IMPORTANT: Since a brand kit is configured, DO NOT ask the user about colors, fonts, or visual style. You already have everything you need. Only ask about content — what the page is about, who the audience is, and what action they should take.`;
        systemPrompt += brandKitBlock;
        logger.info('Brand kit injected into system prompt', { colors: bk.colors?.length || 0, length: brandKitBlock.length });
      }
    }
  } catch(e) { 
    logger.warn('Brand kit injection failed:', e.message);
  }

  // Inject session ID so Sarah can find/edit existing files
  if (sessionId) {
    systemPrompt += `\n\nCURRENT SESSION CONTEXT:
Your current session ID is: ${sessionId}
ALWAYS use this session ID when calling get_session_files or edit_artifact — never guess or make one up.
When a user asks you to edit, modify, or update something you previously created, ALWAYS call get_session_files first with this session ID to find the file, then use edit_artifact with this session ID and the artifact name.`;
  }

  // Auto-inject CRITICAL skills that must not depend on LLM deciding to load them
  // The refund-handler skill is critical because wrong responses damage customer relationships
  try {
    const msgText = typeof userMessage === 'string' ? userMessage :
      (Array.isArray(userMessage) ? userMessage.filter(b => b.type === 'text').map(b => b.text).join(' ') : '');
    const refundKeywords = /\b(refund|money back|cancel.*subscription|want my money|charged me|billing issue|overcharged|rip.?off|waste of money|not what I (paid|expected)|doesn't work|this is garbage)\b/i;

    if (refundKeywords.test(msgText)) {
      const { findSkills } = await import('../skills/skill-loader.js');
      const refundSkills = findSkills('refund', msgText);
      if (refundSkills.length > 0) {
        let skillBody = refundSkills[0].body;

        // Replace template variables with actual agent/org context
        const ownerName = agentConfig?.humanContact?.name || 'your owner';
        const ownerEmail = agentConfig?.humanContact?.email || '';
        // Try to extract org name from standing instructions (e.g. "You are Olivia, ... at Sunrise Bakery")
        const siText = agentConfig?.standingInstructions || '';
        const orgMatch = siText.match(/(?:at|for|of)\s+([A-Z][A-Za-z\s&']+?)(?:\.|,|\n|$)/);
        const orgName = agentConfig?.config?.orgName || (orgMatch ? orgMatch[1].trim() : agentConfig?.client || 'your organization');
        const industry = agentConfig?.config?.industry || '';
        const planTier = agentConfig?.config?.planTier || 'free';

        skillBody = skillBody
          .replace(/\{\{owner_name\}\}/g, ownerName)
          .replace(/\{\{owner_email\}\}/g, ownerEmail)
          .replace(/\{\{org_name\}\}/g, orgName)
          .replace(/\{\{industry\}\}/g, industry)
          .replace(/\{\{plan_tier\}\}/g, planTier);

        systemPrompt += `\n\n<skill name="refund-handler">\n${skillBody}\n</skill>`;
        logger.info('Auto-injected refund-handler skill', { ownerName, orgName });
      }
    }
  } catch(e) {
    logger.warn('Skill auto-injection failed:', e.message);
  }

  // Auto-inject blog-content skill when user asks for a blog post
  try {
    const msgText = typeof userMessage === 'string' ? userMessage :
      (Array.isArray(userMessage) ? userMessage.filter(b => b.type === 'text').map(b => b.text).join(' ') : '');
    const blogKeywords = /\b(blog|article|post|seo.?optim|geo.?optim|content marketing|write.*about|publish.*to.*ghl|publish.*to.*crm)\b/i;

    if (blogKeywords.test(msgText)) {
      const { findSkills } = await import('../skills/skill-loader.js');
      const blogSkills = findSkills('writing', msgText);
      if (blogSkills.length > 0) {
        systemPrompt += `\n\n<skill name="${blogSkills[0].name}">\n${blogSkills[0].body}\n</skill>`;
        logger.info('Auto-injected blog skill into chat', { skill: blogSkills[0].name });
      } else {
        // Skill not found — inject minimal blog instructions as fallback
        logger.warn('Blog skill not found in catalog — injecting minimal fallback');
        systemPrompt += `\n\n<blog-fallback-instructions>
When writing a blog post:
1. FIRST call image_generate to create a hero image
2. THEN call ghl_create_blog_post with structured data (title, sections[], intro, imageUrl)
3. ALWAYS call create_artifact to save the blog as an HTML file (even if GHL fails)
4. Include <!-- file:blog-slug.html --> in your response
NEVER skip steps 3 and 4 even if step 2 fails.
</blog-fallback-instructions>`;
      }
    }
  } catch(e) {
    logger.warn('Blog skill auto-injection failed:', e.message);
    systemPrompt += `\n\nIMPORTANT: When writing a blog, always: 1) generate hero image, 2) call ghl_create_blog_post, 3) call create_artifact to save HTML, 4) include <!-- file:name.html --> tag. Never skip step 3 even if step 2 fails.`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNIVERSAL SKILL AUTO-INJECTION — Fires for ALL Bloomies (multi-tenant)
  // Each skill is injected based on keyword detection in the user message.
  // Skills contain expert frameworks the model MUST follow.
  // Without the skill → generic output. With the skill → professional output.
  // ══════════════════════════════════════════════════════════════════════════
  try {
    const _skillMsgText = typeof userMessage === 'string' ? userMessage
      : (Array.isArray(userMessage) ? userMessage.filter(b => b.type === 'text').map(b => b.text).join(' ') : '');
    const _injectedSkillNames = new Set();

    // Helper: load a skill by exact name from catalog, replace {{template}} vars with agentConfig
    const _injectSkillByName = async (skillName, fallback = null) => {
      if (_injectedSkillNames.has(skillName)) return;
      try {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = path.default.dirname(fileURLToPath(import.meta.url));
        const catalogDir = path.default.join(__dirname, '../skills/catalog');
        const skillFile = path.default.join(catalogDir, `${skillName}.md`);
        if (fs.default.existsSync(skillFile)) {
          const raw = fs.default.readFileSync(skillFile, 'utf-8');
          const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
          if (fmMatch) {
            let body = fmMatch[1].trim();

            // ── Replace {{template}} variables with agentConfig values ──
            // This makes every skill multi-tenant — no hardcoded org names
            const ownerName  = agentConfig?.humanContact?.name  || 'your owner';
            const ownerEmail = agentConfig?.humanContact?.email || '';
            const orgName    = agentConfig?.config?.orgName     || agentConfig?.client || 'your organization';
            const industry   = agentConfig?.config?.industry    || '';
            const planTier   = agentConfig?.config?.planTier    || agentConfig?.modelConfig?.modelTier || 'standard';
            const location   = agentConfig?.config?.location    || '';
            const platform   = 'BLOOM';

            body = body
              .replace(/\{\{owner_name\}\}/g,  ownerName)
              .replace(/\{\{owner_email\}\}/g, ownerEmail)
              .replace(/\{\{org_name\}\}/g,    orgName)
              .replace(/\{\{industry\}\}/g,    industry)
              .replace(/\{\{plan_tier\}\}/g,   planTier)
              .replace(/\{\{location\}\}/g,    location)
              .replace(/\{\{platform_name\}\}/g, platform);

            systemPrompt += `\n\n<skill name="${skillName}">\n${body}\n</skill>`;
            _injectedSkillNames.add(skillName);
            logger.info('Auto-injected skill', { skill: skillName, org: orgName });
            return;
          }
        }
      } catch(e) {
        logger.warn('Skill file read failed', { skill: skillName, error: e.message });
      }
      if (fallback) systemPrompt += `\n\n${fallback}`;
    };

    // FLYER — event announcements, posters, promotional print materials
    if (/\b(flyer|flier|poster|event.*flyer|flyer.*event|promotional.*material|print.*material|event.*announcement|event.*poster|promo.*flyer)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('flyer-generation',
        'IMPORTANT: For flyers use portrait 1024x1536, high quality, engine=gpt. Write a rich narrative prompt: describe the visual scene, specify bold headline text with exact font/size/placement, include lighting + camera specs, specify color palette. Set _contentType="flyer". Default PHOTOREALISTIC — not cartoon.');
    }

    // STANDALONE IMAGE — banners, hero images, graphics (not covered by flyer/social)
    if (/\b(generate.*image|create.*image|make.*image|banner|hero.*image|product.*photo|infographic|brand.*graphic|visual.*asset|thumbnail|logo.*design)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('image-generation',
        'IMPORTANT: Write prompts as rich narrative paragraphs, NOT keyword lists. Include: subject with specific details, lighting (direction + quality), camera + lens (e.g. "Canon R5, 85mm f/1.4"), composition, color palette, mood anchor. Default to PHOTOREALISTIC. Set engine=gpt for social/flyers/thumbnails, engine=gemini for website heroes/editorial. Prompts are auto-enhanced but start detailed for best results.');
    }

    // WEBSITE / LANDING PAGE
    if (/\b(website|landing page|web page|homepage|build.*site|create.*site|online.*presence|web.*design|event.*site|conference.*site|sales.*page|opt.?in.*page)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('website-creation',
        'IMPORTANT: Every website must be mobile-first HTML, include brand kit colors, have a CRM-connected form, and be saved as a published artifact.');
    }

    // EMAIL — marketing emails, newsletters, campaigns, AND editing existing emails
    if (/\b(email.*campaign|newsletter|email.*blast|drip.*email|welcome.*email|marketing.*email|email.*template|send.*to.*list|announce.*blog|promote.*blog|create.*email|draft.*email|edit.*email|update.*email|change.*email|fix.*email|email.*link|email.*cta|modify.*email)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('email-creator',
        'IMPORTANT: Email creation is a TWO-STEP process. Step 1: Use ghl_create_email_template to create the template via API with structured data (name, subject, calloutItems, etc.). Step 2: IMMEDIATELY after the template is created, use bloom_browser_* tools (BLOOM Desktop) to navigate GHL in the user\'s real browser — go to Email Marketing > Campaigns, click New, select the template, and create the campaign. Do NOT use browser_task for GHL — it gets blocked. You MUST use bloom_browser_navigate, bloom_browser_click, bloom_browser_type, bloom_browser_screenshot to control the user\'s desktop browser. The GHL API cannot create campaigns — only the UI can. Do NOT skip the browser step. Do NOT create HTML artifacts for emails. Do NOT ask more than 2 clarifying questions. EDITING: To edit an existing email template, use ghl_update_email_template with the templateId. CRM templates CAN be edited — never tell the user they cannot be edited or that you need to recreate them.');
    }

    // SOCIAL MEDIA — posts, captions, content calendars
    if (/\b(social.*post|instagram.*post|linkedin.*post|facebook.*post|tiktok.*video|caption|hashtag|content.*calendar|reel.*script|story.*post|post.*for.*social|social.*media.*content)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('social-media',
        'IMPORTANT: Every social post needs a hook, body, and CTA. Include relevant hashtags. Generate a matching image for visual posts.');
    }

    // WORD DOCUMENT — .docx, reports, memos, formal letters
    if (/\b(word.*doc(ument)?|\.docx|\bdocx\b|report.*document|formal.*document|letterhead|table.*of.*contents|memo|business.*letter)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('docx',
        'IMPORTANT: Use the docx npm library to generate real .docx files with proper formatting. Never use markdown as a substitute.');
    }

    // POWERPOINT — slide decks, presentations, pitch decks
    if (/\b(presentation|slide.*deck|\bdeck\b|powerpoint|\.pptx|\bpptx\b|pitch.*deck|slideshow|slide.*show)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('pptx',
        'IMPORTANT: Use pptxgenjs to generate real .pptx files with proper slides and layouts. Never use HTML as a substitute.');
    }

    // PDF — create, convert, merge, fill
    if (/\b(\.pdf|\bpdf\b|create.*pdf|save.*as.*pdf|export.*pdf|merge.*pdf|split.*pdf|pdf.*form|fill.*pdf|convert.*to.*pdf)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('pdf',
        'IMPORTANT: Use pdf-lib or puppeteer to generate real .pdf files. Never use markdown as a PDF substitute.');
    }

    // SPREADSHEET — xlsx, csv, data tables, trackers
    if (/\b(spreadsheet|excel|\bxlsx\b|\.xlsx|\bcsv\b|\.csv|data.*table|budget.*sheet|expense.*tracker|create.*spreadsheet|export.*csv)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('xlsx',
        'IMPORTANT: Use exceljs to generate real .xlsx files with proper formatting. Never use markdown tables as a spreadsheet substitute.');
    }

    // PROFESSIONAL DOCUMENTS — SOPs, proposals, handbooks, contracts
    if (/\b(sop|standard.*operating.*procedure|proposal|handbook|contract|policy.*document|onboarding.*doc|business.*plan|one.?pager|scope.*of.*work|statement.*of.*work)\b/i.test(_skillMsgText)) {
      await _injectSkillByName('professional-documents',
        'IMPORTANT: Professional documents must be real .docx files with tables, headers, footers, and page numbers. Use the docx npm library.');
    }

  } catch(e) {
    logger.warn('Universal skill auto-injection failed:', e.message);
  }

  // ── TASK INJECTION — Provider-native task-specific behavioral contracts ────
  // Detects task type from user message. Provider-native injection string is
  // resolved after model detection below. Stored here for use after model resolution.
  const detectedTaskType = detectTaskType(userMessage);
  let enrichedUserMessage = userMessage; // will be updated after model is known

  const messages = [...history, { role: 'user', content: enrichedUserMessage }];
  let currentMessages = [...messages];

  // Dynamic tool availability + capability notes (ONCE, before the loop)
  const { tools: availableTools } = getAvailableTools();
  const capabilityNotes = getCapabilityNotes();
  if (capabilityNotes) systemPrompt += capabilityNotes;

  // ── CONTEXT WINDOW MANAGEMENT — prevent "prompt is too long" errors ────
  // Anthropic's max context is 200k tokens. We estimate ~4 chars per token.
  // Budget: ~180k tokens for messages (reserve 20k for system prompt + tools + output).
  const MAX_MESSAGE_CHARS = 720000; // ~180k tokens × 4 chars/token
  function estimateMessageChars(msgs) {
    let total = 0;
    for (const msg of msgs) {
      if (typeof msg.content === 'string') {
        total += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') total += (block.text || '').length;
          else if (block.type === 'image' && block.source?.type === 'base64') {
            // Base64 images are huge — estimate their token cost
            total += (block.source.data || '').length;
          } else if (block.type === 'image' && block.source?.type === 'url') {
            // URL images are fetched by Anthropic — estimate ~1600 tokens per image
            total += 6400;
          } else if (block.type === 'tool_use') {
            total += JSON.stringify(block.input || {}).length + 200;
          } else if (block.type === 'tool_result') {
            total += typeof block.content === 'string' ? block.content.length : JSON.stringify(block.content || '').length;
          } else {
            total += JSON.stringify(block).length;
          }
        }
      } else if (msg.content) {
        total += JSON.stringify(msg.content).length;
      }
    }
    return total;
  }

  function trimMessagesToFit(msgs) {
    let totalChars = estimateMessageChars(msgs);
    if (totalChars <= MAX_MESSAGE_CHARS) return msgs;

    logger.warn(`Context too large (${totalChars} chars, ~${Math.round(totalChars/4)} tokens). Trimming...`);
    let trimmed = [...msgs];

    // Phase 1: Strip base64 image data from older messages (keep the last 2 user messages intact)
    const userMsgIndices = trimmed.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0);
    const keepIntactFrom = userMsgIndices.length >= 2 ? userMsgIndices[userMsgIndices.length - 2] : userMsgIndices[userMsgIndices.length - 1] || 0;

    for (let i = 0; i < keepIntactFrom; i++) {
      const msg = trimmed[i];
      if (Array.isArray(msg.content)) {
        let changed = false;
        const newContent = msg.content.map(block => {
          if (block.type === 'image' && block.source?.type === 'base64') {
            changed = true;
            return { type: 'text', text: '[Previous image removed to save context space]' };
          }
          if (block.type === 'image' && block.source?.type === 'url') {
            changed = true;
            return { type: 'text', text: `[Previous image: ${block.source.url?.slice(0, 100)}]` };
          }
          return block;
        });
        if (changed) trimmed[i] = { ...msg, content: newContent };
      }
    }

    totalChars = estimateMessageChars(trimmed);
    if (totalChars <= MAX_MESSAGE_CHARS) {
      logger.info(`Context trimmed to ${totalChars} chars after stripping old images`);
      return trimmed;
    }

    // Phase 2: Drop oldest messages (keep at least the last 6 messages for coherent context)
    const minKeep = Math.min(6, trimmed.length);
    while (trimmed.length > minKeep && estimateMessageChars(trimmed) > MAX_MESSAGE_CHARS) {
      const removed = trimmed.shift();
      // Ensure messages still alternate correctly — if we removed a user msg,
      // the next must be user too or we need to drop the orphaned assistant response
      if (trimmed.length > 0 && trimmed[0].role === 'assistant') {
        trimmed.shift();
      }
      logger.info(`Dropped oldest message (role: ${removed.role}) to fit context window`);
    }

    totalChars = estimateMessageChars(trimmed);
    logger.info(`Context trimmed to ${totalChars} chars (~${Math.round(totalChars/4)} tokens) after dropping old messages`);
    return trimmed;
  }

  // Apply initial trimming
  currentMessages = trimMessagesToFit(currentMessages);

  const toolsUsed = [];
  const toolResults = []; // Track what tools returned for history
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // ── TOOL FAILURE TRACKING — counts failures per tool for smart retry/alternative logic ──
  const toolFailureCounts = {}; // { toolName: count } — tracks how many times each tool has failed
  const failedTools = [];       // Array of { name, error, round } — full failure log

  // Model selection — per-org tier system with unified client failover
  const messageText = Array.isArray(userMessage) ? userMessage.filter(b => b.type === 'text').map(b => b.text).join(' ') : userMessage;
  const llmClient = getLLMClient();
  // activeProvider declared here — used by both model adaptation and task injection below
  let activeProvider = llmClient.provider;

  // ── MODEL ADAPTATION — skipped if task injection active (it has provider-native guidance) ──
  if (!detectedTaskType) {
    const modelAdaptation = getModelAdaptation(activeProvider);
    if (currentMessages.length > 0) {
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg.role === 'user') {
        if (typeof lastMsg.content === 'string') {
          lastMsg.content = lastMsg.content + '\n\n' + modelAdaptation;
        } else if (Array.isArray(lastMsg.content)) {
          lastMsg.content = [...lastMsg.content, { type: 'text', text: modelAdaptation }];
        }
      }
    }
    logger.info('Model adaptation applied', { provider: activeProvider, model: llmClient.model, note: 'pre-resolution default, may be overridden by per-org config' });
  } else {
    logger.info('Model adaptation skipped — provider-native task injection active', { provider: activeProvider, taskType: detectedTaskType });
  }

  // ── Model resolution — TWO layers working together ──────────────────────
  //
  // Layer 1: Admin config / tier → calls switchModel() to update the singleton baseline.
  //          This is the primary path for most clients (bloom/premium/standard/trial tiers).
  //          It ensures the singleton reflects the current org's tier so any code that
  //          reads llmClient.model gets a reasonable default.
  //
  // Layer 2: Per-org admin preference (dashboard /models/switch) → stored in-memory per-org.
  //          This is an OVERRIDE for admins who explicitly choose a model.
  //          When set, it takes priority over the tier-based default for this specific request.
  //
  // The actual API call uses chatWithModel() so it doesn't permanently alter the singleton
  // mid-request in a way that bleeds into other concurrent requests.
  //
  // Priority: admin dashboard preference → admin config tier → singleton default
  //
  let resolvedAdminConfig = null;
  let requestModel = null; // the model for THIS specific request
  // orgId comes from the function parameter; enrich from agentConfig if the param was null
  const resolvedOrgId = orgId || agentConfig?.organizationId || agentConfig?.organization_id || null;

  // ── Layer 1: Admin config / org tier → update singleton baseline ──
  try {
    const { getResolvedConfig } = await import('../config/admin-config.js');
    resolvedAdminConfig = await getResolvedConfig(resolvedOrgId);

    if (resolvedAdminConfig?.model && resolvedAdminConfig.model !== llmClient.model) {
      const switched = llmClient.switchModel(resolvedAdminConfig.model);
      if (switched) {
        logger.info(`Admin config applied (singleton updated): tier="${resolvedAdminConfig.tier}" → ${resolvedAdminConfig.model}`, { reason: resolvedAdminConfig.reason, orgId: resolvedOrgId });
      } else {
        logger.warn(`Admin config tier "${resolvedAdminConfig.tier}" requested ${resolvedAdminConfig.model} but API key not available, staying on ${llmClient.model}`);
      }
    }
    // Set requestModel from admin config (may be overridden by Layer 2 below)
    requestModel = resolvedAdminConfig?.model || llmClient.model;
  } catch (e) {
    logger.warn('Admin config resolution failed (non-critical), using defaults:', e.message);
    // Fallback to legacy env-var based resolution
    try {
      const { resolveModelForOrg } = await import('../llm/unified-client.js');
      const orgModelConfig = agentConfig?.config?.modelConfig || {};
      if (orgModelConfig.modelTier || orgModelConfig.customModel) {
        const resolved = resolveModelForOrg({
          modelTier: orgModelConfig.modelTier,
          createdAt: orgModelConfig.tierStartDate || agentConfig?.createdAt,
          customModel: orgModelConfig.customModel,
          modelOverride: orgModelConfig.modelOverride,
        });
        if (resolved.model && resolved.model !== llmClient.model) {
          llmClient.switchModel(resolved.model);
        }
        requestModel = resolved.model || llmClient.model;
      }
    } catch (e2) { /* silent fallback */ }
  }

  // ── Layer 2: Admin dashboard preference → overrides tier for this request ──
  try {
    const { getOrgModelPreference } = await import('../llm/unified-client.js');
    const userPref = getOrgModelPreference(resolvedOrgId);
    if (userPref?.model) {
      requestModel = userPref.model;
      logger.info(`Admin model preference override: ${requestModel}`, { orgId: resolvedOrgId });
    }
  } catch (_) { /* no preference set — use Layer 1 result */ }

  // Final fallback: use whatever the singleton has (env/tier default)
  if (!requestModel) requestModel = llmClient.model;

  const chatModel = requestModel;
  const chatProvider = detectProvider(chatModel);
  logger.info('Chat model selected', { model: chatModel, provider: chatProvider, orgId: resolvedOrgId, source: requestModel !== llmClient.model ? 'admin-override' : 'tier-default' });

  // ── NOW APPLY PROVIDER-NATIVE TASK INJECTION (model is known) ────────────
  // Use the per-request resolved provider (NOT the singleton — multi-tenant safe)
  activeProvider = chatProvider;
  if (detectedTaskType) {
    const injection = getTaskInjection(detectedTaskType, activeProvider);
    if (injection) {
      if (typeof enrichedUserMessage === 'string') {
        enrichedUserMessage = enrichedUserMessage + '\n\n' + injection;
      } else if (Array.isArray(enrichedUserMessage)) {
        enrichedUserMessage = [...enrichedUserMessage, { type: 'text', text: injection }];
      }
      // Update currentMessages with the enriched message
      if (currentMessages.length > 0 && currentMessages[currentMessages.length - 1].role === 'user') {
        currentMessages[currentMessages.length - 1].content = enrichedUserMessage;
      }
      logger.info('Provider-native task injection applied', { taskType: detectedTaskType, provider: activeProvider });
    }
  }

  // ── PASSIVE TASK TRACKING — auto-populate Active Tasks panel ──────────
  const trackingKey = sessionId || 'default';
  let agentCalledTaskProgress = false; // flag: if true, don't overwrite with passive data
  const taskLabel = (typeof messageText === 'string' ? messageText : 'Working on task').slice(0, 80);
  taskProgress.set(trackingKey, {
    todos: [
      { content: taskLabel, status: 'in_progress', activeForm: 'Planning steps...' },
    ],
    updatedAt: Date.now()
  });

  // ── HELPER: execute a tool with automatic retry on failure ──────────────
  // Retries once with same params before reporting failure to the agent.
  // Skips retry for tools where retry doesn't make sense (task_progress, bloom_log).
  const noRetryTools = new Set(['task_progress', 'bloom_log', 'bloom_take_screenshot', 'bloom_browser_screenshot', 'load_skill']);
  async function executeWithRetry(toolName, toolInput, sid, agentCfg = null, orgIdForTool = null) {
    let result;
    try {
      result = await executeTool(toolName, toolInput, sid, agentCfg, orgIdForTool);
    } catch (toolError) {
      logger.error(`Tool ${toolName} threw error (attempt 1):`, toolError.message);
      result = { success: false, error: `Tool error: ${toolError.message}` };
    }

    // Check if tool failed and is retryable
    const isFailed = result?.success === false || result?.error;
    if (isFailed && !noRetryTools.has(toolName)) {
      const priorFails = toolFailureCounts[toolName] || 0;
      if (priorFails < 2) { // Only auto-retry if this tool hasn't already failed 2+ times
        logger.info(`🔄 Auto-retrying ${toolName} (attempt 2, prior failures: ${priorFails})`);
        // Update passive tracker to show retry
        if (!agentCalledTaskProgress) {
          const friendlyName = (n) => n.replace(/_/g, ' ').replace(/^bloom /, '');
          const currentTodos = toolsUsed.map((t, i) => ({
            content: friendlyName(t.name),
            status: i < toolsUsed.length - 1 ? 'completed' : 'in_progress',
            activeForm: `Retrying ${friendlyName(toolName)}...`
          }));
          taskProgress.set(trackingKey, { todos: currentTodos, updatedAt: Date.now() });
        }
        try {
          result = await executeTool(toolName, toolInput, sid, agentCfg, orgIdForTool);
        } catch (retryError) {
          logger.error(`Tool ${toolName} threw error (attempt 2):`, retryError.message);
          result = { success: false, error: `Tool error after retry: ${retryError.message}` };
        }
      }
    }

    // Track failures
    const stillFailed = result?.success === false || result?.error;
    if (stillFailed) {
      toolFailureCounts[toolName] = (toolFailureCounts[toolName] || 0) + 1;
      failedTools.push({ name: toolName, error: result?.error || 'Unknown error', round: toolsUsed.length });
      logger.warn(`Tool ${toolName} failed (total failures: ${toolFailureCounts[toolName]})`, { error: result?.error });
    }

    return result;
  }

  // ── HELPER: build tool result block for the message context ────────────
  function buildToolResultBlock(block, result) {
    // Strip large binary data from context (keep URLs only)
    const contextSafeResult = {...result};
    if (contextSafeResult.image_base64) {
      delete contextSafeResult.image_base64;
    }
    if (contextSafeResult.content && typeof contextSafeResult.content === 'string' && contextSafeResult.content.length > 50000) {
      contextSafeResult.content = contextSafeResult.content.slice(0, 5000) + '... [truncated]';
    }

    const screenImage = result?.result?.image || result?.image;

    // For task_progress: send the checklist as plain text
    if (block.name === 'task_progress' && result?.inlineChecklist) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.message + (result.inlineChecklist ? "\n\n" + result.inlineChecklist : "")
      };
    }
    // For screenshots: pass image as vision content
    if (block.name === 'bloom_take_screenshot' && screenImage) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: screenImage } },
          { type: 'text', text: `Screenshot captured: ${result?.result?.width}x${result?.result?.height}px. Analyze what you see and proceed.` }
        ]
      };
    }

    // For failed tools with 2+ failures: inject nudge to try alternative approach
    const isFailed = result?.success === false || result?.error;
    if (isFailed && (toolFailureCounts[block.name] || 0) >= 2) {
      contextSafeResult._systemNote = `⚠️ This tool has failed ${toolFailureCounts[block.name]} times. Try a DIFFERENT approach or alternative tool instead of retrying the same thing.`;
    }

    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(contextSafeResult)
    };
  }

  // ── HELPER: log cost and write usage metrics ───────────────────────────
  async function logCostAndUsage(round) {
    // Use unified client's pricing table for accurate cost across all models
    const { calculateCost } = await import('../llm/unified-client.js');
    const costCents = calculateCost(chatModel, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens });
    const turnCostUSD = costCents / 100;
    logger.info(`💰 COST: $${turnCostUSD.toFixed(4)} this turn (${round + 1} API calls, ${totalInputTokens} in / ${totalOutputTokens} out, model: ${chatModel})`, {
      cost: turnCostUSD, rounds: round + 1, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model: chatModel, tools: toolsUsed.map(t=>t.name).join(',')
    });

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const today = new Date().toISOString().split('T')[0];
      const orgId = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
      const resolvedAgentId = agentConfig?.agentId || process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';
      const artifactsCreated = toolsUsed.filter(t => t.name === 'create_artifact' || t.name === 'image_generate').length;

      await supabase.rpc('upsert_usage_metrics', {
        p_org_id: orgId,
        p_agent_id: resolvedAgentId,
        p_date: today,
        p_messages: 1,
        p_tokens_input: totalInputTokens,
        p_tokens_output: totalOutputTokens,
        p_artifacts: artifactsCreated
      });
      logger.info('Usage metrics recorded', { agentId: resolvedAgentId, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model: chatModel, costUSD: turnCostUSD });
    } catch (usageErr) {
      logger.warn('Usage metrics write failed (non-critical):', usageErr.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN AGENTIC LOOP — Plan → Execute → Verify → Retry
  // Up to 15 rounds for the main execution, plus up to 3 extra for verification/fix
  // ══════════════════════════════════════════════════════════════════════════
  const MAX_EXEC_ROUNDS = 15;
  const MAX_VERIFY_ROUNDS = 3;
  let verificationAttempted = false;

  for (let round = 0; round < MAX_EXEC_ROUNDS + MAX_VERIFY_ROUNDS; round++) {
    // Trim context before each API call (tool results accumulate during the loop)
    currentMessages = trimMessagesToFit(currentMessages);

    const response = await callLLMWithRetry({
      model: chatModel,
      max_tokens: 8192,
      system: systemPrompt,
      messages: currentMessages,
      tools: availableTools
    }, 3); // no agentClient — unified client handles all providers + failover

    // ── THINKING LOG: Record LLM reasoning for thinking panel ──
    // 1. Capture Anthropic extended thinking blocks (most detailed reasoning)
    const _extThinking = (response.content || [])
      .filter(b => b.type === "thinking")
      .map(b => b.thinking || b.text || "")
      .join("\n")
      .slice(0, 4000);
    // 2. Capture regular text reasoning
    const _thinkingText = (response.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .slice(0, 500);
    const _toolCalls = (response.content || [])
      .filter(b => b.type === "tool_use")
      .map(b => ({ name: b.name, input: b.input || {} }));
    if (_extThinking) {
      appendThinking(sessionId, { type: "thinking", text: _extThinking, round });
    }
    // NOTE: _thinkingText (type:text blocks) is the FINAL RESPONSE shown to user.
    // We do NOT log it as thinking. Real thinking comes from extended thinking blocks above.
    // If no reasoning text but there are tool calls, generate readable description
    if (!_extThinking && !_thinkingText && _toolCalls.length > 0) {
      const _desc = _toolCalls.map(tc => {
        const n = tc.name || "";
        const inp = tc.input || {};
        if (n.includes("screenshot") || n.includes("screen_capture")) return "Taking a screenshot to see what is on screen...";
        if (n.includes("browser") && n.includes("navigate")) return "Opening " + (inp.url || "a webpage") + " in the browser...";
        if (n.includes("browser") && n.includes("click")) return "Clicking on an element on the page...";
        if (n.includes("browser") && n.includes("type")) return "Typing into a form field...";
        if (n.includes("search")) return "Searching for: " + (inp.query || inp.search_query || "information") + "...";
        if (n.includes("read") || n.includes("get")) return "Reading " + (inp.path || inp.file || "data") + "...";
        if (n.includes("write") || n.includes("create") || n.includes("save")) return "Creating " + (inp.path || inp.filename || "content") + "...";
        if (n.includes("send") || n.includes("email") || n.includes("sms")) return "Sending a message...";
        if (n.includes("load_skill")) return "Loading skill: " + (inp.skill_name || inp.skillName || "") + "...";
        if (n.includes("clarify") || n.includes("bloom_clarify")) return "Asking for clarification...";
        if (n.includes("execute") || n.includes("run")) return "Running: " + n + "...";
        return "Using " + n.replace(/_/g, " ") + "...";
      }).join("\n");
      appendThinking(sessionId, { type: "thinking", text: _desc, round });
    }
    // Log tool calls
    if (_toolCalls.length > 0) {
      for (const tc of _toolCalls) {
        appendThinking(sessionId, { type: "tool_call", name: tc.name, args: JSON.stringify(tc.input || {}).slice(0, 200), round });
      }
    }
    // Accumulate token usage every round
    if (response.usage) {
      totalInputTokens += response.usage.input_tokens || 0;
      totalOutputTokens += response.usage.output_tokens || 0;
    }

    // ── RESPONSE NORMALIZATION — fix known model-specific quirks ─────────
    // Some models return text blocks that contain JSON tool calls instead of
    // native tool_use blocks. Detect and convert before the loop processes them.
    const activeModel = chatModel;
    const activeModelProvider = chatProvider;
    if (response.stop_reason === 'end_turn' && (activeModelProvider === 'gemini' || activeModelProvider === 'deepseek')) {
      // Check if any text block looks like a JSON tool call that should have been a tool_use block
      const textBlocks = response.content.filter(b => b.type === 'text');
      for (const block of textBlocks) {
        if (block.text && block.text.includes('"tool_use"') && block.text.includes('"name"') && block.text.includes('"input"')) {
          try {
            const parsed = JSON.parse(block.text.trim());
            if (parsed.type === 'tool_use' && parsed.name && parsed.input) {
              // Convert to proper tool_use block
              response.content = response.content.filter(b => b !== block);
              response.content.push({ type: 'tool_use', id: parsed.id || 'tool_' + Date.now(), name: parsed.name, input: parsed.input });
              response.stop_reason = 'tool_use';
              logger.warn('Normalized text-encoded tool call to tool_use block', { model: activeModel, tool: parsed.name });
            }
          } catch (e) { /* not a JSON tool call, ignore */ }
        }
      }
    }

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      // Early empty-output check — Gemini sometimes returns end_turn with empty content
      // before any tools run on first message. Retry immediately with nudge.
      if (!text.trim() && toolsUsed.length === 0 && round === 0 && round < MAX_EXEC_ROUNDS - 1) {
        logger.warn('Gemini returned empty response on first round — retrying with explicit nudge', { model: chatModel });
        currentMessages.push({ role: 'user', content: [{ type: 'text', text: 'Please process my request and either call a tool or respond with text.' }] });
        continue;
      }

      // ── CODE-DUMP DETECTION — catch agents pasting HTML/code in chat ───
      // If the response contains a large HTML/code block, force the agent to save it as a file instead.
      // This is a hard guardrail — agents should NEVER dump code in chat.
      const hasCodeDump = /<html[\s>][\s\S]{200,}/i.test(text) ||
        /<style[\s>][\s\S]{200,}<\/style>/i.test(text) ||
        (/```[\s\S]{500,}```/.test(text) && /<[a-z][\s\S]*>/i.test(text));
      if (hasCodeDump && !verificationAttempted && round < MAX_EXEC_ROUNDS + MAX_VERIFY_ROUNDS - 1) {
        verificationAttempted = true;
        logger.warn('🚫 CODE-DUMP DETECTED: Agent pasted HTML/code in chat instead of using create_artifact');

        if (!agentCalledTaskProgress) {
          taskProgress.set(trackingKey, {
            todos: [{ content: 'Save code as file', status: 'in_progress', activeForm: 'Saving code as proper file...' }],
            updatedAt: Date.now()
          });
        }

        currentMessages.push({ role: 'assistant', content: response.content });
        currentMessages.push({ role: 'user', content:
          `[SYSTEM — CODE DUMP VIOLATION]\n` +
          `You just pasted raw HTML/code directly in chat. This is NOT acceptable.\n` +
          `The client is a business owner who cannot read or use raw code.\n\n` +
          `You MUST:\n` +
          `1. Take the HTML/code you just wrote and save it using create_artifact as a .html file\n` +
          `2. Then respond with ONLY a natural description of what you created + the <!-- file:filename.html --> tag\n` +
          `3. Do NOT repeat the code in chat\n\n` +
          `Fix this now.`
        });
        continue; // Force back into loop to save the file properly
      }

      // ── CODE-ENFORCED VERIFICATION ─────────────────────────────────────
      // After the agent thinks it's done, check if there are unresolved failures.
      // If tools failed and the agent didn't retry them, force a verification round.
      // This only runs once — we don't want infinite verification loops.
      if (!verificationAttempted && toolsUsed.length > 0 && round < MAX_EXEC_ROUNDS + MAX_VERIFY_ROUNDS - 1) {
        const unresolvedFailures = failedTools.filter(f => {
          // Check if this failure was later resolved by a successful call to the same tool
          const laterSuccess = toolsUsed.find((t, i) =>
            t.name === f.name && i > f.round &&
            toolResults[i] && !toolResults[i]?.error && toolResults[i]?.success !== false
          );
          return !laterSuccess;
        });

        if (unresolvedFailures.length > 0) {
          verificationAttempted = true;
          logger.info(`🔍 VERIFICATION: ${unresolvedFailures.length} unresolved tool failures detected, forcing verification round`, {
            failures: unresolvedFailures.map(f => `${f.name}: ${f.error}`).join('; ')
          });

          // Update passive tracker to show verification
          if (!agentCalledTaskProgress) {
            const friendlyName = (n) => n.replace(/_/g, ' ').replace(/^bloom /, '');
            const steps = toolsUsed.map(t => ({
              content: friendlyName(t.name),
              status: 'completed',
              activeForm: friendlyName(t.name)
            }));
            steps.push({ content: 'Verify and fix failures', status: 'in_progress', activeForm: 'Verifying and fixing failures...' });
            taskProgress.set(trackingKey, { todos: steps, updatedAt: Date.now() });
          }

          // Inject the verification message and continue the loop
          const failureList = unresolvedFailures.map(f => `- ${f.name}: ${f.error}`).join('\n');
          currentMessages.push({ role: 'assistant', content: response.content });
          currentMessages.push({ role: 'user', content:
            `[SYSTEM — AUTOMATIC VERIFICATION]\n` +
            `Before delivering to the user, the following tool failures were detected that you did NOT resolve:\n\n` +
            `${failureList}\n\n` +
            `You MUST either:\n` +
            `1. Retry these failed tools with adjusted parameters\n` +
            `2. Use alternative tools/approaches to accomplish the same goal\n` +
            `3. If truly impossible, explain to the user EXACTLY what failed and why\n\n` +
            `Do NOT deliver partial or broken results. Fix the issues now, then deliver.`
          });
          continue; // Go back into the loop for the fix round
        }

        // ── COMPLETENESS VERIFICATION (no failures, but did the agent do everything?) ──
        // Only for multi-tool tasks where the request was complex enough to warrant checking
        const originalRequest = typeof userMessage === 'string' ? userMessage :
          (Array.isArray(userMessage) ? userMessage.filter(b => b.type === 'text').map(b => b.text).join(' ') : '');
        const hasMultipleParts = /\band\b.*\band\b|,.*,.*and\b|then\b.*then\b|also\b.*also\b/i.test(originalRequest);

        if (hasMultipleParts && toolsUsed.length >= 2) {
          verificationAttempted = true;
          logger.info('🔍 VERIFICATION: Multi-part request detected, running completeness check');

          // Cheap verification sub-call — ask a fresh model instance to check completeness
          try {
            const verifyResult = await callLLMWithRetry({
              model: chatModel,
              max_tokens: 300,
              messages: [{
                role: 'user',
                content: `You are a quality checker. The user asked: "${originalRequest.slice(0, 500)}"\n\n` +
                  `The agent's response was: "${text.slice(0, 1000)}"\n\n` +
                  `The agent used these tools: ${toolsUsed.map(t => t.name).join(', ')}\n\n` +
                  `Did the agent complete EVERY part of the request? Reply with ONLY one of:\n` +
                  `COMPLETE — if all parts were addressed\n` +
                  `MISSING: [brief description of what was missed] — if anything was skipped`
              }]
            }); // no agentClient — unified client handles all providers

            if (verifyResult.usage) {
              totalInputTokens += verifyResult.usage.input_tokens || 0;
              totalOutputTokens += verifyResult.usage.output_tokens || 0;
            }

            const verifyText = verifyResult.content?.[0]?.text?.trim() || '';
            if (verifyText.startsWith('MISSING')) {
              logger.info(`🔍 VERIFICATION FAILED: ${verifyText}`);

              if (!agentCalledTaskProgress) {
                const friendlyName = (n) => n.replace(/_/g, ' ').replace(/^bloom /, '');
                const steps = toolsUsed.map(t => ({
                  content: friendlyName(t.name),
                  status: 'completed',
                  activeForm: friendlyName(t.name)
                }));
                steps.push({ content: 'Fix missing items', status: 'in_progress', activeForm: 'Fixing missing items...' });
                taskProgress.set(trackingKey, { todos: steps, updatedAt: Date.now() });
              }

              // Re-enter the loop to fix what's missing
              currentMessages.push({ role: 'assistant', content: response.content });
              currentMessages.push({ role: 'user', content:
                `[SYSTEM — COMPLETENESS CHECK]\n` +
                `A quality check found you missed part of the request:\n${verifyText}\n\n` +
                `Complete the missing items now before delivering to the user.`
              });
              continue; // Go back into the loop
            } else {
              logger.info('🔍 VERIFICATION PASSED: All parts complete');
            }
          } catch (verifyErr) {
            // Verification sub-call failed — not critical, deliver what we have
            logger.warn('Verification sub-call failed (non-critical):', verifyErr.message);
          }
        }
      }

      // ── FINALIZE: Update tracking, log costs, return response ──────────
      if (!agentCalledTaskProgress && toolsUsed.length > 0) {
        const friendlyName = (n) => n.replace(/_/g, ' ').replace(/^bloom /, '');
        const steps = toolsUsed.map(t => ({
          content: friendlyName(t.name),
          status: 'completed',
          activeForm: friendlyName(t.name)
        }));
        steps.push({ content: 'Verify deliverables', status: 'completed', activeForm: 'Verified' });
        taskProgress.set(trackingKey, { todos: steps, updatedAt: Date.now() });
      }
      if (toolsUsed.length === 0) {
        taskProgress.delete(trackingKey);
        thinkingLog.delete(trackingKey);
      }

      if (toolsUsed.length > 0) {
        const toolSummaryLog = toolsUsed.map(t => t.name).join(', ');
        logger.info('Tools used this turn', { tools: toolSummaryLog, sessionId, failures: failedTools.length });
      }

      await logCostAndUsage(round);

      // ── EMPTY RESPONSE GUARD ─────────────────────────────────────────────
      // If the model returned empty text, it silently gave up (Gemini 0-output bug).
      // Force a retry with a direct nudge rather than returning "" to the user.
      if (!text.trim() && round < MAX_EXEC_ROUNDS - 1) {
        logger.warn('Model returned empty response — nudging to continue', { model: chatModel, round, toolsRun: toolsUsed.length });
        currentMessages.push({ role: 'assistant', content: response.content.length > 0 ? response.content : [{ type: 'text', text: '' }] });
        currentMessages.push({ role: 'user', content: [{ type: 'text', text: 'Your last response was empty. Please respond to the user request now.' }] });
        continue;
      }

      return text;
    }

    // ── TOOL EXECUTION with auto-retry ───────────────────────────────────
    if (response.stop_reason === 'tool_use') {
      currentMessages.push({ role: 'assistant', content: response.content });
      const toolResultBlocks = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          // ── AUTO-INJECT REFERENCE IMAGE for image_generate ──────────────
          // If the agent calls image_generate without a reference image but the
          // conversation contains images (user uploads, previously generated images),
          // auto-inject the best reference so variations/resizes match the original.
          // Priority: 1) user-uploaded image (base64 or URL)  2) last generated image  3) markdown URLs
          // Also auto-inject for image_resize — it needs the uploaded image to resize
          if (block.name === 'image_resize' && !block.input.image_url && !block.input.image_base64) {
            // Find uploaded image and inject it
            for (let mi = currentMessages.length - 1; mi >= 0; mi--) {
              const msg = currentMessages[mi];
              if (msg.role === 'user' && Array.isArray(msg.content)) {
                const urlImg = msg.content.find(b => b.type === 'image' && b.source?.type === 'url');
                if (urlImg) { block.input.image_url = urlImg.source.url; break; }
                const b64Img = msg.content.find(b => b.type === 'image' && b.source?.type === 'base64');
                if (b64Img) { block.input.image_base64 = b64Img.source.data; break; }
              }
            }
            // Also check previously generated images
            if (!block.input.image_url && !block.input.image_base64) {
              for (let ti = toolResults.length - 1; ti >= 0; ti--) {
                const tr = toolResults[ti];
                if (tr?.image_url && (toolsUsed[ti]?.name === 'image_generate' || toolsUsed[ti]?.name === 'image_resize')) {
                  block.input.image_url = tr.image_url; break;
                }
              }
            }
            if (block.input.image_url || block.input.image_base64) {
              logger.info('Auto-injected image into image_resize');
            }
          }

          // Auto-tag content type for image engine routing (dashboard config)
          if (block.name === 'image_generate' && !block.input._contentType) {
            const prompt = (block.input.prompt || '').toLowerCase();
            if (/blog|article|post|hero image for/.test(prompt)) block.input._contentType = 'blog';
            else if (/flyer|brochure|poster|print/.test(prompt)) block.input._contentType = 'flyer';
            else if (/website|landing page|web page|banner/.test(prompt)) block.input._contentType = 'website';
            else if (/social|instagram|facebook|linkedin|twitter|tiktok/.test(prompt)) block.input._contentType = 'social';
            else if (/email|newsletter/.test(prompt)) block.input._contentType = 'email';
            if (block.input._contentType) logger.info('Auto-tagged image content type', { contentType: block.input._contentType });
          }

          if (block.name === 'image_generate' && !block.input.reference_image_url && !block.input.reference_image_base64 && !block.input.no_reference) {
            let foundRefUrl = null;
            let foundRefBase64 = null;
            let foundRefMime = null;

            // 1) Check for user-uploaded images in conversation (highest priority)
            // Uploads come through as BOTH base64 AND url — check both formats
            for (let mi = currentMessages.length - 1; mi >= 0; mi--) {
              const msg = currentMessages[mi];
              if (msg.role === 'user' && Array.isArray(msg.content)) {
                // Check for URL-sourced images first
                const urlImg = msg.content.find(b => b.type === 'image' && b.source?.type === 'url');
                if (urlImg) {
                  foundRefUrl = urlImg.source.url;
                  logger.info('Found reference image (URL) from user upload');
                  break;
                }
                // Check for base64-sourced images (this is how the /upload endpoint sends them)
                const b64Img = msg.content.find(b => b.type === 'image' && b.source?.type === 'base64');
                if (b64Img) {
                  foundRefBase64 = b64Img.source.data;
                  foundRefMime = b64Img.source.media_type || null;
                  logger.info('Found reference image (base64) from user upload', {
                    dataLength: foundRefBase64?.length || 0,
                    mediaType: foundRefMime
                  });
                  break;
                }
              }
            }

            // 2) If no user upload found, check for previously generated image URLs from this session
            if (!foundRefUrl && !foundRefBase64) {
              for (let ti = toolResults.length - 1; ti >= 0; ti--) {
                const tr = toolResults[ti];
                if (tr && tr.image_url && toolsUsed[ti]?.name === 'image_generate') {
                  foundRefUrl = tr.image_url;
                  logger.info('Using previously generated image as reference (no user upload found)');
                  break;
                }
              }
            }

            // 3) Also check assistant message text for markdown image URLs from prior turns
            if (!foundRefUrl && !foundRefBase64) {
              for (let mi = currentMessages.length - 1; mi >= 0; mi--) {
                const msg = currentMessages[mi];
                if (msg.role === 'assistant') {
                  const text = typeof msg.content === 'string' ? msg.content :
                    (Array.isArray(msg.content) ? msg.content.filter(b => b.type === 'text').map(b => b.text).join(' ') : '');
                  const imgMatch = text.match(/!\[.*?\]\((https:\/\/[^\s)]+\.(?:png|jpg|jpeg|webp)[^\s)]*)\)/i);
                  if (imgMatch) {
                    foundRefUrl = imgMatch[1];
                    logger.info('Extracted reference image URL from assistant markdown response');
                    break;
                  }
                }
              }
            }

            // Inject whichever reference we found — URL takes priority over base64
            if (foundRefUrl) {
              block.input.reference_image_url = foundRefUrl;
              if (!block.input.engine || block.input.engine === 'auto') {
                block.input.engine = 'gemini';
              }
              logger.info('Auto-injected reference_image_url into image_generate', { url: foundRefUrl.slice(0, 80) });
            } else if (foundRefBase64) {
              block.input.reference_image_base64 = foundRefBase64;
              if (foundRefMime) block.input.reference_image_mime = foundRefMime;
              if (!block.input.engine || block.input.engine === 'auto') {
                block.input.engine = 'gemini';
              }
              logger.info('Auto-injected reference_image_base64 into image_generate', { dataLength: foundRefBase64.length, mime: foundRefMime });

              // Auto-detect aspect ratio from reference image if size not explicitly set
              if (!block.input.size || block.input.size === '1024x1024') {
                try {
                  const Jimp = (await import('jimp')).default;
                  const imgBuf = Buffer.from(foundRefBase64, 'base64');
                  const refImg = await Jimp.read(imgBuf);
                  const w = refImg.getWidth();
                  const h = refImg.getHeight();
                  const ratio = w / h;
                  if (ratio > 1.2) {
                    block.input.size = '1536x1024'; // landscape
                    logger.info(`Auto-set size to landscape (1536x1024) based on reference ${w}x${h}, ratio ${ratio.toFixed(2)}`);
                  } else if (ratio < 0.8) {
                    block.input.size = '1024x1536'; // portrait
                    logger.info(`Auto-set size to portrait (1024x1536) based on reference ${w}x${h}, ratio ${ratio.toFixed(2)}`);
                  } else {
                    logger.info(`Reference image is ~square (${w}x${h}, ratio ${ratio.toFixed(2)}), keeping 1024x1024`);
                  }
                } catch (arErr) {
                  logger.warn('Could not auto-detect aspect ratio from reference image:', arErr.message);
                }
              }
            }
          }

          toolsUsed.push({ name: block.name, input: block.input });


          // Execute with automatic retry on failure
          const result = await executeWithRetry(block.name, block.input, sessionId, agentConfig, orgId);
          toolResults.push(result);

          // ── THINKING LOG: Record tool result for thinking panel ──
          const _resultPreview = typeof result === 'string' ? result.slice(0, 300) :
            (result?.error ? `Error: ${result.error}` : JSON.stringify(result).slice(0, 300));
          appendThinking(sessionId, {
            type: 'tool_result',
            name: block.name,
            result: _resultPreview,
            success: !result?.error,
            round
          });

          // ── CLARIFICATION PAUSE — bloom_clarify returns pauseExecution: true ──
          // When Sarah calls bloom_clarify, we break out of the agentic loop and
          // return the clarification data to the frontend as clickable buttons.
          if (block.name === 'bloom_clarify' && result?.pauseExecution) {
            logger.info('Clarification requested in chat, pausing for user response', {
              question: result.question,
              optionCount: result.options?.length || 0
            });

            // Get any text Sarah wrote before the clarification tool call
            const textBeforeClarify = response.content
              .filter(b => b.type === 'text')
              .map(b => b.text)
              .join('');

            // Clean up passive tracking
            if (!agentCalledTaskProgress) {
              taskProgress.delete(trackingKey);
        thinkingLog.delete(trackingKey);
            }

            await logCostAndUsage(round);

            // Return with clarification data — the frontend renders this as clickable buttons
            return {
              __clarification: true,
              text: textBeforeClarify || result.message || '',
              clarification: {
                question: result.question,
                options: result.options || [],
                context: result.context || ''
              }
            };
          }

          // Passive tracking
          if (block.name === 'task_progress') agentCalledTaskProgress = true;
          if (!agentCalledTaskProgress) {
            const friendlyName = (n) => n.replace(/_/g, ' ').replace(/^bloom /, '');
            taskProgress.set(trackingKey, {
              todos: toolsUsed.map((t, i) => ({
                content: friendlyName(t.name),
                status: i < toolsUsed.length - 1 ? 'completed' : 'in_progress',
                activeForm: `Running ${friendlyName(t.name)}...`
              })),
              updatedAt: Date.now()
            });
          }

          toolResultBlocks.push(buildToolResultBlock(block, result));
        }
      }
      // Only push tool results if we actually executed tools — empty arrays confuse the LLM
      if (toolResultBlocks.length > 0) {
        // ── INVESTIGATION WRAPPER — append after every tool result batch ──────────
        // Forces Sarah to read actual tool results before claiming success.
        // Modeled after Anthropic's <investigate_before_answering> pattern.
        const wrappedToolResults = [
          ...toolResultBlocks,
          { type: 'text', text: getInvestigationWrapper(chatProvider) }
        ];
        currentMessages.push({ role: 'user', content: wrappedToolResults });
      } else {
        logger.warn('stop_reason was tool_use but no tool_use blocks were found/executed — forcing continuation');
        // Push a synthetic user message to keep the conversation going
        currentMessages.push({ role: 'user', content: [{ type: 'text', text: 'Continue with the task. Execute the tools you planned.' }] });
      }
    }
  }

  // ── EXHAUSTED ALL ROUNDS — return what we have ─────────────────────────
  await logCostAndUsage(MAX_EXEC_ROUNDS + MAX_VERIFY_ROUNDS);
  if (toolsUsed.length > 0) {
    const toolSummary = toolsUsed.map(t => t.name).join(', ');
    const successfulArtifact = toolResults.find(r => r?.artifact?.name);
    if (successfulArtifact) {
      return `Done! I created "${successfulArtifact.artifact.name}" — you can find it in your Files tab. Let me know if you want any changes!`;
    }
    if (failedTools.length > 0) {
      return `I worked on this using ${toolSummary}, but ran into ${failedTools.length} issue(s) along the way. Want me to try a different approach?`;
    }
    return `I worked on this using ${toolSummary}. The task was more complex than expected — want me to continue or try a different approach?`;
  }
  return "I got a bit carried away. Let me know if you need me to try a simpler approach.";
}

// ROUTES — DB-backed persistent sessions

let _tablesReady = false;
async function ensureSession(_pool, sessionId, userId = null, agentId = null) {
  // Supabase only — pool param kept for call-chain compatibility but not used
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const resolvedUserId = userId || process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
    const resolvedAgentId = agentId || process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';
    await sb.from('sessions').upsert({
      id: sessionId,
      user_id: resolvedUserId,
      organization_id: process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001',
      agent_id: resolvedAgentId,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id', ignoreDuplicates: false });
    logger.info(`Session ${sessionId} ensured in Supabase`, { agentId: resolvedAgentId });
  } catch (err) {
    logger.warn(`ensureSession failed:`, err.message);
  }
}


async function loadHistory(_pool, sessionId) {
  // Supabase only — pool param kept for call-chain compatibility but not used
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await sb
      .from('messages')
      .select('role, content, files, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(40);
    if (error) throw error;
    return (data || []).map(msg => {
      const role = msg.role === 'sarah' ? 'assistant' : msg.role;

      // ── RECONSTRUCT IMAGE CONTEXT FOR HISTORY ──────────────────────────
      // When a user uploaded images, files metadata contains _imageUrls.
      // Reconstruct as Anthropic vision content blocks so the agent remembers
      // what was in the images on subsequent turns (prevents context loss).
      if (role === 'user' && msg.files && Array.isArray(msg.files)) {
        const imageUrlEntry = msg.files.find(f => f._imageUrls);
        if (imageUrlEntry && imageUrlEntry._imageUrls.length > 0) {
          const contentBlocks = [];
          // Add each image as a URL-based image block
          for (const url of imageUrlEntry._imageUrls) {
            contentBlocks.push({
              type: 'image',
              source: { type: 'url', url }
            });
          }
          // Add the text content
          if (msg.content) {
            contentBlocks.push({ type: 'text', text: msg.content });
          }
          return { role, content: contentBlocks };
        }
      }

      return { role, content: msg.content };
    });
  } catch (err) {
    logger.error('loadHistory failed:', err.message);
    return [];
  }
}


async function generateSessionTitle(sessionId, userMsg, assistantMsg) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const msgText = typeof userMsg === 'string' ? userMsg : JSON.stringify(userMsg);
      const asstText = typeof assistantMsg === 'string' ? assistantMsg
        : (assistantMsg?.text || assistantMsg?.clarification?.question || JSON.stringify(assistantMsg) || '');
      const prompt = `Based on this conversation, generate a short specific chat title (4-6 words max). No punctuation at the end. No quotes. Just the title.

User: ${msgText.slice(0, 300)}
Assistant: ${asstText.slice(0, 300)}

Title:`;
      // Model-agnostic: uses whatever model the agent is currently running (Claude, Gemini, DeepSeek, etc.)
      const result = await callLLMWithRetry({
        max_tokens: 60,
        messages: [{ role: 'user', content: prompt }]
      });
      const title = result.content[0]?.text?.trim().replace(/^["'']|["'']$/g, '').slice(0, 60);
      if (title) {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        await sb.from('sessions').update({ title, updated_at: new Date().toISOString() }).eq('id', sessionId);
        logger.info(`Session title set: "${title}"`, { sessionId });
        return; // Success — stop retrying
      }
    } catch (e) {
      logger.warn(`Session title generation attempt ${attempt}/${maxRetries} failed`, { sessionId, error: e.message });
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  // All retries failed — set a fallback title from the user message
  try {
    const msgText = typeof userMsg === 'string' ? userMsg : JSON.stringify(userMsg);
    const fallback = msgText.slice(0, 50) + (msgText.length > 50 ? '...' : '');
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await sb.from('sessions').update({ title: fallback, updated_at: new Date().toISOString() }).eq('id', sessionId);
    logger.info(`Session title set (fallback): "${fallback}"`, { sessionId });
  } catch {}
}

async function saveMessages(_pool, sessionId, userMsg, assistantMsg, files = null, userId = null, agentId = null, opts = {}) {
  const userText = typeof userMsg === 'string' ? userMsg : JSON.stringify(userMsg);
  // Safety: assistantMsg must be a string for DB storage — convert objects/arrays
  const assistantText = typeof assistantMsg === 'string' ? assistantMsg
    : (assistantMsg?.text || JSON.stringify(assistantMsg) || '');

  // Save messages to SUPABASE (source of truth for millions of users)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const resolvedUserId = userId || process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
    const resolvedAgentId = agentId || process.env.AGENT_UUID || 'c3000000-0000-0000-0000-000000000003';

    // Insert user message (skip for conference agent sub-sessions — user msg saved in -user session)
    if (!opts.skipUserSave) {
      await supabase
        .from('messages')
        .insert({
          session_id: sessionId,
          organization_id: process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001',
          user_id: resolvedUserId,
          agent_id: resolvedAgentId,
          role: 'user',
          content: userText,
          files: files ? files : null
        });
    }

    // Insert assistant message
    await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        organization_id: process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001',
        user_id: resolvedUserId,
        agent_id: resolvedAgentId,
        role: 'assistant',
        content: assistantText
      });

    // Update session updated_at only — title is set by generateSessionTitle with Claude
    await supabase.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
    
    logger.info(`Messages saved to Supabase for session ${sessionId}`);
    
  } catch (err) {
    logger.error('Failed to save messages to Supabase:', err.message);
  }
}

// GET /api/chat/sessions
router.get('/sessions', async (req, res) => {
  const { projectId, agentId } = req.query;

  // If projectId is provided, query Supabase
  if (projectId) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const userId = await getUserId(req); // Multi-tenant: resolves from JWT, falls back to env var

      let query = supabase
        .from('sessions')
        .select('id, title, created_at, updated_at, project_id, user_id, agent_id')
        .eq('project_id', projectId)
        .eq('user_id', userId);
      if (agentId) query = query.eq('agent_id', agentId);
      const { data, error } = await query.order('updated_at', { ascending: false });
      
      if (error) {
        logger.error('Supabase sessions fetch error', { error: error.message });
        return res.json({ sessions: [] });
      }
      
      // Filter out conference/group sessions from individual chat lists
      const filteredData = (data || []).filter(s => !s.id.startsWith('conf-') && !s.id.startsWith('group-'));
      // message_count not stored in Supabase — omit Railway lookup
      const sessionsWithCounts = await Promise.all(filteredData.map(async (session) => {
        try {
          return {
            ...session,
            message_count: 0
          };
        } catch {
          return { ...session, message_count: 0 };
        }
      }));
      
      return res.json({ sessions: sessionsWithCounts });
    } catch (e) {
      logger.error('Supabase sessions fetch error', { error: e.message });
      return res.json({ sessions: [] });
    }
  }
  
  // Default: query Supabase sessions for this user (optionally filtered by agentId)
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const resolvedUserId = await getUserId(req); // Multi-tenant: resolves from JWT

    // Conference mode: return only conference/group sessions
    if (req.query.conference === 'true') {
      const { data: confData, error: confErr } = await sb
        .from('sessions')
        .select('id, title, created_at, updated_at, agent_id')
        .eq('user_id', resolvedUserId)
        .or('id.like.conf-%,id.like.group-%')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (confErr) throw confErr;
      return res.json({ sessions: confData || [] });
    }

    let query = sb
      .from('sessions')
      .select('id, title, created_at, updated_at, agent_id')
      .eq('user_id', resolvedUserId);
    if (agentId) query = query.eq('agent_id', agentId);
    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    // Filter out conference/group chat sessions — they should only appear in the conference tab
    const filtered = (data || []).filter(s => !s.id.startsWith('conf-') && !s.id.startsWith('group-'));

    // For sessions with null titles, fetch first user message as fallback title
    const sessionsWithTitles = await Promise.all(filtered.map(async (s) => {
      if (s.title) return s;
      try {
        const { data: msgs } = await sb
          .from('messages')
          .select('content')
          .eq('session_id', s.id)
          .eq('role', 'user')
          .order('created_at', { ascending: true })
          .limit(1);
        if (msgs && msgs.length > 0 && msgs[0].content) {
          const preview = msgs[0].content.slice(0, 50) + (msgs[0].content.length > 50 ? '...' : '');
          return { ...s, title: preview };
        }
      } catch {}
      return s;
    }));

    res.json({ sessions: sessionsWithTitles });
  } catch (e) {
    logger.error('Sessions fetch error', { error: e.message });
    res.json({ sessions: [] });
  }
});

// GET /api/chat/sessions/:id — load full history from Supabase
router.get('/sessions/:id', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

    // ── Session-boundary check: verify requesting user owns this session ──
    const { validateSessionAccess } = await import('./org-boundary.js');
    const access = await validateSessionAccess(req, req.params.id);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, files, created_at')
      .eq('session_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    res.json({ messages: data || [] });
  } catch (e) {
    logger.error('Session load error', { error: e.message });
    res.json({ messages: [] });
  }
});

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  try {
    // ── Session-boundary check ──
    const { validateSessionAccess } = await import('./org-boundary.js');
    const access = await validateSessionAccess(req, req.params.id);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await sb.from('messages').delete().eq('session_id', req.params.id);
    await sb.from('sessions').delete().eq('id', req.params.id);
    // Clean up in-memory task progress to prevent memory buildup
    taskProgress.delete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// PATCH /api/chat/sessions/:id/title
router.patch('/sessions/:id/title', async (req, res) => {
  try {
    // ── Session-boundary check ──
    const { validateSessionAccess } = await import('./org-boundary.js');
    const access = await validateSessionAccess(req, req.params.id);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });

    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    await sb.from('sessions').update({ title: req.body.title, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false });
  }
});

// Save a clean user message to a conference -user sub-session (no AI call)
router.post('/conference/user-message', async (req, res) => {
  try {
    const { text, sessionId } = req.body || {};
    if (!text?.trim() || !sessionId) return res.status(400).json({ error: 'text and sessionId required' });
    const userId = await getUserId(req);
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const resolvedUserId = userId || process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
    const orgId = process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
    // Ensure the -user session exists
    const { data: existing } = await sb.from('sessions').select('id').eq('id', sessionId).single();
    if (!existing) {
      await sb.from('sessions').insert({
        id: sessionId,
        user_id: resolvedUserId,
        organization_id: orgId,
        title: 'Team Conference',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    // Insert user message
    await sb.from('messages').insert({
      session_id: sessionId,
      organization_id: orgId,
      user_id: resolvedUserId,
      role: 'user',
      content: text
    });
    await sb.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
    res.json({ success: true });
  } catch (e) {
    logger.error('Conference user-message save failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/message', async (req, res) => {
  // Track which skills the agent loads during this turn — shown as badges in the dashboard
  let skillsUsedThisTurn = [];
  const { message, sessionId = 'session-' + Date.now(), agentId, skipUserSave } = req.body || {};
  try {
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const userId = await getUserId(req);
    const agentConfig = await loadAgentConfig(agentId || null);
    await ensureSession(null, sessionId, userId, agentConfig.agentId);
    const history = await loadHistory(null, sessionId);

    // Auto-fetch Google Docs/Sheets/Slides if URL detected in message
    let enrichedMessage = message;
    const gdocsMatch = message.match(/https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/);
    if (gdocsMatch) {
      try {
        const docId = gdocsMatch[2];
        const docType = gdocsMatch[1];
        // Use export endpoint to get plain text — works for public/shared docs
        const exportUrl = docType === 'document'
          ? `https://docs.google.com/document/d/${docId}/export?format=txt`
          : docType === 'spreadsheets'
          ? `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv`
          : null;
        if (exportUrl) {
          const { default: https } = await import('https');
          const docText = await new Promise((resolve, reject) => {
            https.get(exportUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
              if (res.statusCode === 200) {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(data.slice(0, 8000)));
              } else {
                resolve(null);
              }
            }).on('error', reject);
          });
          if (docText) {
            enrichedMessage = `${message}\n\n[Google Doc content fetched automatically:]\n${docText}`;
          }
        }
      } catch(e) {
        // If fetch fails, proceed with original message — Sarah can use browser_navigate instead
        logger.warn('Google Docs auto-fetch failed:', e.message);
      }
    }

    // Resolve user's org for per-org tool credentials (e.g., GHL)
    let userOrgId = null;
    try {
      const { createClient: _sc } = await import('@supabase/supabase-js');
      const _sb = _sc(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: membership } = await _sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .limit(1)
        .single();
      if (membership) userOrgId = membership.organization_id;
    } catch (e) {
      // Fall through — orgId stays null, GHL uses env var defaults
    }

    const response = await chatWithAgent(enrichedMessage, history, agentConfig, sessionId, userOrgId);

    // Handle clarification pause — bloom_clarify returns structured data instead of text
    if (response && typeof response === 'object' && response.__clarification) {
      logger.info(`💬 Chat [${sessionId}] User: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`);
      logger.info(`💬 Chat [${sessionId}] ${agentConfig.name || 'Agent'}: [CLARIFICATION] ${response.clarification?.question || ''}`);
      // Save the clarification as a message so conversation history is preserved
      const clarifyText = response.text || `I need to clarify something before I proceed.`;
      await saveMessages(null, sessionId, message, clarifyText, null, userId, agentConfig.agentId, { skipUserSave: !!skipUserSave });

      if (history.length === 0) {
        generateSessionTitle(sessionId, message, clarifyText).catch(() => {});
      }

      return res.json({
        response: clarifyText,
        clarification: response.clarification,
        sessionId,
        agentId: agentConfig.agentId,
        skillsUsed: skillsUsedThisTurn
      });
    }

    // Safety: ensure response is a string before string operations
    const responseText = typeof response === 'string' ? response
      : (response?.text || JSON.stringify(response) || '');
    logger.info(`💬 Chat [${sessionId}] User: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`);
    logger.info(`💬 Chat [${sessionId}] ${agentConfig.name || 'Agent'}: ${responseText.replace(/\[Session context[\s\S]*$/, '').slice(0, 100)}${responseText.length > 100 ? '...' : ''}`);
    await saveMessages(null, sessionId, message, responseText, null, userId, agentConfig.agentId, { skipUserSave: !!skipUserSave });

    // Strip internal session context before sending to client
    const cleanResponse = responseText.replace(/\s*\[Session context[\s\S]*$/g, '').trim();

    // Generate a smart title after the first message (history was empty = first exchange)
    if (history.length === 0) {
      generateSessionTitle(sessionId, message, cleanResponse).catch(() => {});
    }

    // Generate TTS audio if agent has a voice configured and client wants audio
    const wantsAudio = req.body?.audio !== false; // default true, client can opt-out
    const audioData = wantsAudio ? await generateSpeech(cleanResponse, agentConfig) : null;
    return res.json({ response: cleanResponse, sessionId, agentId: agentConfig.agentId, skillsUsed: skillsUsedThisTurn, audio: audioData });
  } catch (error) {
    logger.error('Chat error', { error: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n') });

    // ── CLEANUP: Remove stale "Planning steps..." entry on error ──────────
    // Without this, failed API calls leave permanent 0% entries in Active Tasks
    const failedKey = sessionId || 'default';
    const staleEntry = taskProgress.get(failedKey);
    if (staleEntry && staleEntry.todos?.length === 1 && staleEntry.todos[0].activeForm === 'Planning steps...') {
      taskProgress.delete(failedKey);
      logger.info('Cleaned up stale passive tracking entry', { sessionId: failedKey });
    }

    return res.status(500).json({
      error: 'Failed to process message',
      response: "Sorry, I'm having a technical issue. Please try again.",
      debug_error: error.message,
      debug_stack: error.stack?.split('\n').slice(0, 3).join(' | ')
    });
  }
});

// POST /api/chat/upload — accept files + optional message, send to Sarah as multipart content
router.post('/upload', async (req, res) => {
  try {
    const { message = '', sessionId = 'session-' + Date.now(), files = [], agentId } = req.body;
    if (!files.length && !message.trim()) {
      return res.status(400).json({ error: 'Message or files required' });
    }

    const userId = await getUserId(req);
    const agentConfig = await loadAgentConfig(agentId || null);
    await ensureSession(null, sessionId, userId, agentConfig.agentId);
    const history = await loadHistory(null, sessionId);

    // Build multipart content blocks for Anthropic
    const userContent = [];
    for (const f of files) {
      const mediaType = f.type || 'application/octet-stream';
      if (mediaType.startsWith('image/')) {
        // Anthropic limits: 5MB max, 8000px max dimension (2000px if many images in conversation).
        // We MUST use Jimp to resize AND convert to JPEG — then declare media_type as image/jpeg.
        // The previous bug: Jimp was converting to JPEG bytes but media_type stayed 'image/png',
        // causing Anthropic 400: "image does not match provided media type".
        try {
          const Jimp = (await import('jimp')).default;
          const buf = Buffer.from(f.data, 'base64');
          logger.info(`Image received`, { name: f.name, mediaType, bufferBytes: buf.length });
          if (!buf.length) throw new Error('Image buffer is empty after base64 decode');
          const image = await Jimp.read(buf);
          // Cap at 1600px — stays under 2000px limit even when conversation has multiple images
          image.scaleToFit(1600, 1600).quality(85);
          const resizedBuf = await image.getBufferAsync(Jimp.MIME_JPEG);
          const resizedB64 = resizedBuf.toString('base64');
          logger.info(`Image resized+converted to JPEG`, { original: buf.length, resized: resizedBuf.length });
          // media_type MUST be image/jpeg to match the JPEG bytes Jimp outputs
          userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: resizedB64 } });
        } catch (imgErr) {
          logger.error('Image processing failed', { name: f.name, error: imgErr.message, stack: imgErr.stack });
          // Don't push broken image — skip it so the text message still goes through
        }
      } else if (mediaType === 'application/pdf') {
        userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
      } else if (
        mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        f.name?.endsWith('.docx')
      ) {
        // Word doc — extract text with mammoth
        try {
          const buf = Buffer.from(f.data, 'base64');
          const result = await mammoth.extractRawText({ buffer: buf });
          const text = result.value?.trim() || '';
          userContent.push({ type: 'text', text: `[Word Document: ${f.name}]\n\n${text}` });
        } catch (e) {
          userContent.push({ type: 'text', text: `[Word Document: ${f.name} — could not extract text: ${e.message}]` });
        }
      } else if (
        mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        f.name?.endsWith('.xlsx')
      ) {
        // Excel — decode as text best-effort (basic cell content)
        try {
          const decoded = Buffer.from(f.data, 'base64').toString('utf-8');
          userContent.push({ type: 'text', text: `[Spreadsheet: ${f.name}]\n${decoded.slice(0, 6000)}` });
        } catch {
          userContent.push({ type: 'text', text: `[Spreadsheet attached: ${f.name}]` });
        }
      } else {
        // CSV, TXT, JSON, MD, HTML — plain text decode
        try {
          const decoded = Buffer.from(f.data, 'base64').toString('utf-8');
          userContent.push({ type: 'text', text: `[File: ${f.name}]\n\n${decoded.slice(0, 8000)}` });
        } catch {
          userContent.push({ type: 'text', text: `[File attached: ${f.name} (${mediaType})]` });
        }
      }
    }
    const textMsg = message.trim() || (files.length ? `I've shared ${files.length} file(s) with you.` : '');
    if (textMsg) userContent.push({ type: 'text', text: textMsg });

    const content = userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent;

    // Resolve user's org for per-org tool credentials
    let userOrgId = null;
    try {
      const { createClient: _sc } = await import('@supabase/supabase-js');
      const _sb = _sc(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      const { data: membership } = await _sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .limit(1)
        .single();
      if (membership) userOrgId = membership.organization_id;
    } catch (e) { /* falls back to env var defaults */ }

    const response = await chatWithAgent(content, history, agentConfig, sessionId, userOrgId);

    // Handle clarification pause — bloom_clarify returns structured data instead of text
    // (Mirror of the same handling in the text endpoint)
    if (response && typeof response === 'object' && response.__clarification) {
      logger.info(`💬 Upload Chat [${sessionId}] User: ${(message || '').slice(0, 100)}`);
      logger.info(`💬 Upload Chat [${sessionId}] Agent: [CLARIFICATION] ${response.clarification?.question || ''}`);
      const clarifyText = response.text || `I need to clarify something before I proceed.`;
      const historyLabel = files.length
        ? `[Files: ${files.map(f => f.name).join(', ')}]${message ? ' ' + message : ''}`
        : message || '';
      await saveMessages(null, sessionId, historyLabel, clarifyText, files.map(f => ({ name: f.name, type: f.type })), userId, agentConfig.agentId);

      if (history.length === 0) {
        const titleMsg = message || (files.length ? `Uploaded ${files.map(f=>f.name).join(', ')}` : 'Shared files');
        generateSessionTitle(sessionId, titleMsg, clarifyText).catch(() => {});
      }

      return res.json({
        response: clarifyText,
        clarification: response.clarification,
        sessionId,
        agentId: agentConfig.agentId
      });
    }

    // Save uploaded images to chat_uploads (separate from artifacts/Files tab)
    // These are user-provided context images, NOT Bloomie-created deliverables
    const uploadedFiles = [];
    const UPLOAD_STORAGE = process.env.FILE_STORAGE_PATH
      ? path.join(process.env.FILE_STORAGE_PATH, 'chat-uploads')
      : path.join(process.cwd(), 'bloom-files', 'chat-uploads');
    fs.mkdirSync(UPLOAD_STORAGE, { recursive: true });

    for (const f of files) {
      if (f.type?.startsWith('image/') && f.data) {
        try {
          const uploadId = `upl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
          const ext = f.type.includes('png') ? '.png' : '.jpg';
          const filePath = path.join(UPLOAD_STORAGE, `${uploadId}${ext}`);
          const buf = Buffer.from(f.data, 'base64');
          fs.writeFileSync(filePath, buf);

          // Also push to Supabase Storage so Sarah can use as reference_image_url
          let supabaseUrl = null;
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
            const storagePath = `chat-uploads/${sessionId}/${uploadId}${ext}`;
            const { error: upErr } = await supabase.storage
              .from('bloom-images')
              .upload(storagePath, buf, { contentType: f.type || 'image/jpeg', upsert: true });
            if (!upErr) {
              const { data: urlData } = supabase.storage.from('bloom-images').getPublicUrl(storagePath);
              supabaseUrl = urlData?.publicUrl || null;
            } else {
              logger.warn('Supabase storage upload failed', { error: upErr.message });
            }
          } catch (storErr) {
            logger.warn('Supabase storage error (non-fatal)', { error: storErr.message });
          }

          // Save to Supabase (not Railway Postgres)
          const { createClient: _sc2 } = await import('@supabase/supabase-js');
          const _sb2 = _sc2(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
          await _sb2.from('chat_uploads').upsert({
            upload_id: uploadId,
            session_id: sessionId,
            user_id: userId || null,
            name: f.name || 'upload.jpg',
            mime_type: f.type || 'image/jpeg',
            file_size: buf.length,
            file_path: filePath,
            supabase_url: supabaseUrl
          }, { onConflict: 'upload_id' });
          uploadedFiles.push({ name: f.name, uploadId, previewUrl: `/api/chat/uploads/preview/${uploadId}`, supabaseUrl });
        } catch (saveErr) {
          logger.warn('Failed to save chat upload', { name: f.name, error: saveErr.message });
        }
      }
    }

    // Build a history-safe user message that preserves image context for future turns.
    // We store Supabase URLs so loadHistory can reconstruct vision content blocks.
    const imageUrls = uploadedFiles.filter(u => u.supabaseUrl).map(u => u.supabaseUrl);
    const historyLabel = files.length
      ? `[Files: ${files.map(f => f.name).join(', ')}]${textMsg ? ' ' + textMsg : ''}`
      : textMsg;
    const filesMeta = files.map(f => ({ name: f.name, type: f.type }));
    // Store image URLs in files metadata so loadHistory can reconstruct image blocks
    if (imageUrls.length > 0) {
      filesMeta.push({ _imageUrls: imageUrls });
    }
    // Safety: ensure response is a string for storage and client
    const responseText = typeof response === 'string' ? response
      : (response?.text || JSON.stringify(response) || '');
    await saveMessages(null, sessionId, historyLabel, responseText, filesMeta, userId, agentConfig.agentId);

    // Generate smart title on first message (same as text endpoint)
    if (history.length === 0) {
      const titleMsg = textMsg || (files.length ? `Uploaded ${files.map(f=>f.name).join(', ')}` : 'Shared files');
      generateSessionTitle(sessionId, titleMsg, responseText).catch(() => {});
    }

    return res.json({ response: responseText, sessionId, uploadedFiles });
  } catch (error) {
    logger.error('Upload chat error', { 
      error: error.message, 
      stack: error.stack,
      status: error.status,
      anthropicError: error.error || error.body || null
    });
    return res.status(500).json({ error: 'Failed to process upload', response: "Sorry, I had trouble with that file. Please try again." });
  }
});


router.get('/crm-link', (req, res) => {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) return res.json({ url: 'https://app.gohighlevel.com' });
  res.json({
    url: `https://app.gohighlevel.com/v2/location/${locationId}/dashboard`,
    contactsUrl: `https://app.gohighlevel.com/v2/location/${locationId}/contacts`,
    locationId
  });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: 'sarah-rodriguez', mode: 'direct-api' });
});

// ── TASK PROGRESS SSE STREAM ────────────────────────────────────────────
// Desktop subscribes to this for real-time checklist updates
// Full path: /api/chat/progress-stream?sessionId=xxx
// Desktop app connects via EventSource to this URL for live todo updates
router.get('/progress-stream', (req, res) => {
  const sessionId = req.query.sessionId || 'default';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('data: ' + JSON.stringify({ connected: true }) + '\n\n');

  // Push progress + thinking updates every 500ms
  let lastThinkingCount = 0;
  const interval = setInterval(() => {
    const progress = taskProgress.get(sessionId);
    const thinking = thinkingLog.get(sessionId);

    // Build combined payload
    const payload = {};
    if (progress) {
      payload.todos = progress.todos;
      payload.updatedAt = progress.updatedAt;
    }
    if (thinking && thinking.events.length > lastThinkingCount) {
      // Only send NEW events since last push
      payload.thinkingEvents = thinking.events.slice(lastThinkingCount);
      lastThinkingCount = thinking.events.length;
    }

    if (Object.keys(payload).length > 0) {
      res.write('data: ' + JSON.stringify(payload) + '\n\n');
    }
  }, 500);

  // Keep-alive ping every 15s to survive Railway's idle timeout
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);

  req.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

// ── THINKING DIAGNOSTIC ──────────────────────────────────────────────────
// GET /api/chat/thinking-diagnostic — test Gemini thinking in multiple ways
router.get('/thinking-diagnostic', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.json({ error: 'No GEMINI_API_KEY set' });

    const model = 'gemini-2.5-flash';
    const prompt = 'What is 17 * 23? Think step by step.';
    const results = {};

    // Helper to call OpenAI-compat endpoint
    const callOpenAI = async (label, body) => {
      try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
        const text = await resp.text();
        let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
        const msg = parsed?.choices?.[0]?.message;
        results[label] = {
          status: resp.status, ok: resp.ok,
          messageFields: msg ? Object.keys(msg) : [],
          messagePreview: msg ? Object.fromEntries(Object.entries(msg).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 300) : JSON.stringify(v).slice(0, 300)])) : null,
          errorPreview: !resp.ok ? (typeof parsed === 'string' ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400)) : undefined,
        };
      } catch (err) { results[label] = { error: err.message }; }
    };

    // Helper to call Gemini native API
    const callNative = async (label, thinkingConfig) => {
      try {
        const nativeUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
        };
        if (thinkingConfig) body.generationConfig.thinkingConfig = thinkingConfig;
        const resp = await fetch(nativeUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const text = await resp.text();
        let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
        const parts = parsed?.candidates?.[0]?.content?.parts;
        results[label] = {
          status: resp.status, ok: resp.ok,
          partsCount: parts?.length || 0,
          parts: parts?.map(p => ({
            hasThought: !!p.thought,
            thought: p.thought || false,
            textPreview: p.text ? p.text.slice(0, 300) : undefined,
            keys: Object.keys(p),
          })) || [],
          errorPreview: !resp.ok ? (typeof parsed === 'string' ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400)) : undefined,
        };
      } catch (err) { results[label] = { error: err.message }; }
    };

    // Run all tests
    await Promise.all([
      // Test 1: OpenAI endpoint — plain (baseline)
      callOpenAI('openai_plain', { model, messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.7 }),
      // Test 2: OpenAI endpoint — with reasoning_effort only
      callOpenAI('openai_reasoning_effort', { model, messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.7, reasoning_effort: 'low' }),
      // Test 3: Native Gemini API — with includeThoughts
      callNative('native_with_thoughts', { includeThoughts: true, thinkingBudget: 1024 }),
      // Test 4: Native Gemini API — plain
      callNative('native_plain', null),
    ]);

    res.json({ model, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MODEL SWITCHING ──────────────────────────────────────────────────────

// GET /api/chat/models — list available models (org-aware)
router.get('/models', async (req, res) => {
  try {
    const { getLLMClient: _getLLM4, getOrgModelPreference: _getOrgPref2, detectProvider: _detect2 } = await import('../llm/unified-client.js');
    const client = _getLLM4();

    // Resolve orgId from query param or auth header
    let orgId = req.query.orgId || process.env.BLOOM_ORG_ID || null;
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (payload.app_metadata?.org_id) orgId = payload.app_metadata.org_id;
        else if (payload.user_metadata?.org_id) orgId = payload.user_metadata.org_id;
      }
    } catch (_) {}

    const userPref = orgId ? _getOrgPref2(orgId) : null;
    const effectiveModel = userPref?.model || client.model;

    res.json({
      current: effectiveModel,
      provider: _detect2(effectiveModel),
      userPreferenceSet: !!userPref,
      singletonDefault: client.model,
      orgId: orgId || null,
      available: client.getAvailableModels(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/chat/models/switch — switch active model (per-org, multi-tenant safe)
// Requires auth header (Supabase JWT) or falls back to org ID from body/env
router.post('/models/switch', async (req, res) => {
  try {
    const { model, orgId: bodyOrgId } = req.body;
    if (!model) return res.status(400).json({ error: 'model is required' });

    // Resolve org ID from JWT or body or env
    let orgId = bodyOrgId || process.env.BLOOM_ORG_ID || 'a1000000-0000-0000-0000-000000000001';
    try {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        // Use org_id from JWT metadata if present, otherwise user's sub
        if (payload.app_metadata?.org_id) orgId = payload.app_metadata.org_id;
        else if (payload.user_metadata?.org_id) orgId = payload.user_metadata.org_id;
      }
    } catch (_) { /* use fallback orgId */ }

    const { setOrgModelPreference, getOrgModelPreference, getLLMClient: _getLLM3, detectProvider: _detect } = await import('../llm/unified-client.js');
    const success = setOrgModelPreference(orgId, model);

    if (success) {
      const pref = getOrgModelPreference(orgId);
      res.json({
        success: true,
        model: pref.model,
        provider: pref.provider,
        orgId,
        message: `Switched to ${model} for org ${orgId}`,
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Cannot switch to ${model} — missing API key for ${_detect(model)}`,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { getAnthropicClient };

// ═══════════════════════════════════════════════════════════════════════════
// PHONE CALL TRANSCRIPT INGESTION
// GHL transcribes calls → webhook sends transcript here → Sarah processes it
// CRITICAL: Uses Sarah's REAL chat pipeline with full memory/context
// ═══════════════════════════════════════════════════════════════════════════

router.post('/ingest-call', async (req, res) => {
  try {
    const { 
      transcript, 
      contactId, 
      contactName, 
      contactPhone,
      callDirection,
      callDuration,
      callId,
      summary,
    } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'No transcript provided' });
    }

    logger.info('📞 Call transcript received', { 
      contactName, contactId, callDirection, 
      transcriptLength: transcript.length,
    });

    // Store call metadata in Supabase
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const phoneSessionId = `phone-${contactId || contactPhone || 'unknown'}`;

    const { data: insertResult } = await sb.from('call_transcripts').insert({
      call_id: callId,
      contact_id: contactId,
      contact_name: contactName,
      contact_phone: contactPhone,
      direction: callDirection,
      duration_seconds: callDuration,
      transcript,
      summary,
      session_id: phoneSessionId
    }).select('id').single();

    // Format the transcript as a message FROM the caller
    // This goes through Sarah's normal chat pipeline — same memory, same tools, same context
    const mins = callDuration ? Math.round(callDuration / 60) : null;
    const callerMessage = `[📞 Phone call from ${contactName || contactPhone || 'unknown caller'}${mins ? ' (' + mins + ' min)' : ''}]\n\n${transcript}`;

    // Route through the SAME /message endpoint logic
    // This gives Sarah full access to: conversation history, Letta memory, tools, skills
    const messageEndpoint = `http://localhost:${process.env.PORT || 3000}/api/chat/message`;
    const messageRes = await fetch(messageEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: callerMessage,
        sessionId: phoneSessionId,
      }),
    });
    const messageData = await messageRes.json();

    // Update call record with status
    if (insertResult?.id) {
      await sb.from('call_transcripts').update({ status: 'processed' }).eq('id', insertResult.id);
    }

    logger.info('📞 Call processed through Sarah pipeline', { 
      contactName, sessionId: phoneSessionId,
      responseLength: messageData.response?.length 
    });

    // If Sarah needs to text back (has action items or questions), 
    // she'll use her GHL tools within the normal pipeline

    res.json({ 
      success: true, 
      callId: insertResult?.id,
      sessionId: phoneSessionId,
      response: messageData.response,
    });

  } catch (error) {
    logger.error('Call transcript ingestion failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/chat/calls — list recent calls for dashboard
router.get('/calls', async (req, res) => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data } = await sb.from('call_transcripts').select('*').order('created_at', { ascending: false }).limit(50);
    res.json({ calls: data || [] });
  } catch (e) {
    res.json({ calls: [] });
  }
});

// GET /api/chat/uploads/list?sessionId=xxx — list uploads for a session (for Files panel)
router.get('/uploads/list', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) return res.json({ uploads: [] });
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await sb
      .from('chat_uploads')
      .select('upload_id, name, mime_type, file_size, supabase_url, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    return res.json({ uploads: (data || []).map(r => ({
      uploadId: r.upload_id,
      name: r.name,
      mimeType: r.mime_type,
      fileSize: r.file_size,
      previewUrl: r.supabase_url || `/api/chat/uploads/preview/${r.upload_id}`,
      createdAt: r.created_at
    }))});
  } catch (err) {
    logger.error('Chat uploads list error', { error: err.message });
    return res.json({ uploads: [] });
  }
});

// GET /api/chat/uploads/preview/:uploadId — serve user-uploaded images
// Redirects to Supabase CDN URL if available (works on any computer), else serves from disk
router.get('/uploads/preview/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await sb
      .from('chat_uploads')
      .select('name, mime_type, file_path, supabase_url')
      .eq('upload_id', uploadId)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Upload not found' });
    // Prefer Supabase CDN — redirect so browser caches it
    if (data.supabase_url) return res.redirect(302, data.supabase_url);
    // Fallback: serve from Railway disk
    if (data.file_path && fs.existsSync(data.file_path)) {
      res.setHeader('Content-Type', data.mime_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return fs.createReadStream(data.file_path).pipe(res);
    }
    return res.status(404).json({ error: 'File not available' });
  } catch (err) {
    logger.error('Chat upload preview error', { error: err.message });
    return res.status(500).json({ error: 'Preview failed' });
  }
});

export default router;