const MATERIAL_AUTHORITY_PATTERN = /\b(send|email|text|call|message|follow up|outreach|publish|post|purchase|buy|pay|refund|delete|remove|cancel|overwrite|replace all)\b/i;
const DESTRUCTIVE_TOOL_PATTERN = /(^|_)(delete|remove|cancel|refund|purchase|send|call)(_|$)/i;
const TARGET_FIELD_PATTERN = /(id|path|email|phone|recipient|contact|deployment|project|repo|repository|file|task)$/i;

export function shouldClarifyBeforeWork({
  discoverable = false,
  reversible = true,
  materiallyChangesScope = false,
  requiresNewAuthority = false,
  missingExternalTarget = false,
} = {}) {
  if (discoverable) return false;
  if (!reversible || materiallyChangesScope || requiresNewAuthority || missingExternalTarget) return true;
  return false;
}

export function buildCodexStyleOpening(instruction = '') {
  const text = String(instruction || '').replace(/\s+/g, ' ').trim();
  if (/\b(repo|repository|github|vercel|codebase|deploy|existing (?:site|website|app))\b/i.test(text)) {
    const explicitlyReadOnly = /\bread[ -]?only\b/i.test(text) ||
      /\b(?:do not|don’t|without)\b[^.]{0,100}\b(?:modify|edit|commit|deploy|change|push|publish)/i.test(text);
    const inspectionOnly = /\b(inspect|audit|review|verify)\b/i.test(text) &&
      !/\b(edit|modify|change|fix|commit|deploy|publish|push|implement)\b/i.test(text);
    if (explicitlyReadOnly || inspectionOnly) {
      return 'I’ll inspect the real repository evidence, verify the requested technical facts, and report what I confirmed without modifying, committing, or deploying anything. I’ll discover paths and branches before asking you.';
    }
    return 'I’ll inspect the real repository and deployment configuration, make the smallest requested change, run its checks, and verify the live result. I’ll preserve unrelated files and discover technical details before asking you.';
  }
  if (/\b(email|text|sms|call|message|publish|post)\b/i.test(text)) {
    return 'I’ll resolve the exact target and requested content, perform only the authorized communication, and verify the resulting receipt before I report completion.';
  }
  if (/\b(browser|website|log in|login|click|form|upload)\b/i.test(text)) {
    return 'I’ll use the available authenticated session, complete the requested browser work, and verify the resulting page state. I won’t claim access or success unless the browser confirms it.';
  }
  if (/\b(create|write|design|generate|document|image|video|presentation|spreadsheet|blog|article|landing page)\b/i.test(text)) {
    return 'I’ll use the available context and brand details, create the requested deliverable, check it against the request, and return the verified result without pausing for choices I can safely make.';
  }
  return 'I’ll handle the request end to end, use the available source of truth, and verify the result before reporting completion.';
}

export function classifyToolFailure(result = {}) {
  if (!result || (result.success !== false && !result.error)) return 'none';
  if (result.pending || ['pending', 'timeout'].includes(result.status)) return 'pending';
  if (result.blocked || [401, 403].includes(result.statusCode || result.httpStatus)) return 'blocked';
  const text = String(result.error || result.message || '').toLowerCase();
  if (/\b(timeout|timed out|rate limit|429|temporar|econnreset|econnrefused|socket hang up|503|502)\b/.test(text)) return 'transient';
  if (/\b(not found|404|invalid|missing|required|schema|argument|path|branch|conflict|422|400)\b/.test(text)) return 'corrective';
  if (/\b(unauthorized|forbidden|permission|billing|insufficient|payment required)\b/.test(text)) return 'blocked';
  return 'terminal';
}

export function validateMutationTarget(toolName = '', input = {}) {
  if (!DESTRUCTIVE_TOOL_PATTERN.test(toolName)) return { allowed: true, consequential: false };
  if (/(^|_)owner($|_)/i.test(toolName)) {
    return { allowed: true, consequential: true, targetField: 'authenticated_owner' };
  }
  const entries = Object.entries(input || {});
  const target = entries.find(([key, value]) => TARGET_FIELD_PATTERN.test(key) && value !== undefined && value !== null && String(value).trim());
  if (!target) {
    return {
      allowed: false,
      consequential: true,
      error: `Consequential tool ${toolName} requires an exact target identifier before execution.`,
    };
  }
  return { allowed: true, consequential: true, targetField: target[0] };
}

export function instructionExplicitlyAuthorizesConsequence(instruction = '') {
  return MATERIAL_AUTHORITY_PATTERN.test(String(instruction || ''));
}

export function validateExactPurchaseAuthorization(instruction = '', purchase = {}) {
  const text = String(instruction || '');
  const total = Number(purchase?.total);
  const restaurant = String(purchase?.restaurant || '').trim();
  if (!Number.isFinite(total) || total <= 0) {
    return { authorized: false, reason: 'A positive exact checkout total is required.' };
  }
  if (!restaurant) {
    return { authorized: false, reason: 'The exact restaurant is required.' };
  }

  const hasApprovalVerb = /\b(approve|approved|confirm|confirmed|place|submit|pay|purchase|buy|yes)\b/i.test(text);
  const hasExactTotal = text.includes(total.toFixed(2));
  const hasRestaurant = text.toLowerCase().includes(restaurant.toLowerCase());
  if (!hasApprovalVerb || !hasExactTotal || !hasRestaurant) {
    return {
      authorized: false,
      reason: 'The current reply must approve this restaurant and exact checkout total.',
    };
  }
  return { authorized: true };
}
