const patterns = {
  engineeringMutation: /\b(edit|change|fix|update|implement|add|remove|refactor|repair)\b[\s\S]{0,100}\b(repo(?:sitory)?|code|codebase|website|site|app|file|branch)\b/i,
  deployment: /\b(deploy|deployment|publish|push live|go live|vercel|netlify|railway)\b/i,
  browserVerification: /\b(browser|screenshot|mobile|responsive|console error|live page|live site|rendered (?:page|site|screen)|visible (?:in|on) (?:the )?(?:browser|page|screen|site))\b/i,
  crmMutation: /\b(create|update|send|delete|archive|tag|move)\b[\s\S]{0,80}\b(contact|crm|pipeline|opportunity|sms|text message)\b/i,
  emailSend: /\b(send|reply|forward)\b[\s\S]{0,80}\b(email|mail|message)\b/i,
  artifact: /\b(create|make|generate|build|write)\b[\s\S]{0,80}\b(file|document|docx|pdf|spreadsheet|xlsx|presentation|pptx|image|artifact)\b/i,
  schedule: /\b(schedule|recurring|cron|every day|every week|automation)\b/i,
};

function explicitlyExcludesDeployment(text) {
  return /\b(?:do not|don't|dont|never|without)\b[^.\n]{0,80}\b(?:deploy|deployment|publish|push(?:ing)? live)\b/i.test(text)
    || /\bread[- ]only\b[\s\S]{0,160}\bdeploy/i.test(text);
}

function explicitlyExcludesEngineeringMutation(text) {
  return /\bread[- ]only\b/i.test(text)
    || /\b(?:do not|don't|dont|never|without)\b[^.\n]{0,80}\b(?:edit|modify|change|commit|write)\b/i.test(text);
}

function conditionallyMentionsBlockedBrowser(text) {
  return /\bif\b[^.\n]{0,50}\b(?:browser|cloud automation)\b[^.\n]{0,40}\b(?:blocked|fails?|unavailable|cannot access)\b/i.test(text);
}

function explicitlyExcludesBrowserVerification(text) {
  return /\b(?:do not|don't|dont|never|without)\b[^.\n]{0,80}\b(?:browser|screenshot|browser screenshot|browser verification)\b/i.test(text);
}

function explicitlyExcludesSchedule(text) {
  return /\bread[- ]only\b/i.test(text)
    || /\b(?:do not|don't|dont|never|without)\b[^.\n]{0,80}\b(?:schedule|recurring|cron|automation)\b/i.test(text);
}

function explicitlyExcludesCrmMutation(text) {
  return /\b(?:do not|don't|dont|never|without)\b[^.\n]{0,100}\b(?:create|update|send|delete|archive|tag|move)\b[^.\n]{0,80}\b(?:contact|crm|pipeline|opportunity|sms|text message)\b/i.test(text)
    || /\bread[- ]only\b[^.\n]{0,160}\b(?:contact|crm|pipeline|opportunity)\b/i.test(text);
}

function explicitlyExcludesNamedTool(text, toolName) {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:do not|don't|dont|never|without)\\b[^.\\n]{0,120}\\b${escaped}\\b`, 'i').test(text);
}

const successful = result => Boolean(result) && result.success !== false && !result.error;
const nameMatches = (tool, fragments) => fragments.some(fragment => tool?.name?.includes(fragment));

function evidenceIndex(toolsUsed = [], toolResults = []) {
  return toolsUsed.map((tool, index) => ({ tool, result: toolResults[index] }));
}

function hasSuccessful(entries, fragments, receipt = () => true) {
  return entries.some(({ tool, result }) =>
    nameMatches(tool, fragments) && successful(result) && receipt(result)
  );
}

export function inferCompletionContract(instruction = '') {
  const text = String(instruction || '');
  const requirements = [];

  if (patterns.engineeringMutation.test(text) && !explicitlyExcludesEngineeringMutation(text)) {
    requirements.push(
      { id: 'source_edit', description: 'a successful workspace or repository edit receipt' },
      { id: 'checks', description: 'successful automated checks' },
      { id: 'diff', description: 'a reviewed source diff' },
    );
  }
  if (patterns.deployment.test(text) && !explicitlyExcludesDeployment(text)) {
    requirements.push({ id: 'deployment_ready', description: 'a terminal READY deployment receipt' });
  }
  if (
    patterns.browserVerification.test(text) &&
    !conditionallyMentionsBlockedBrowser(text) &&
    !explicitlyExcludesBrowserVerification(text)
  ) {
    requirements.push({ id: 'browser_evidence', description: 'browser or screenshot evidence from the resulting page' });
  }
  if (patterns.crmMutation.test(text) && !explicitlyExcludesCrmMutation(text)) {
    requirements.push({ id: 'crm_receipt', description: 'a successful CRM mutation receipt' });
  }
  if (patterns.emailSend.test(text)) {
    requirements.push({ id: 'email_receipt', description: 'a sent-message receipt' });
  }
  if (patterns.artifact.test(text) && !patterns.engineeringMutation.test(text)) {
    requirements.push({ id: 'artifact_receipt', description: 'a saved artifact receipt' });
  }
  // When an operational instruction names a concrete tool, a neighboring
  // deliverable must not satisfy that action by accident. For example, an
  // image receipt is not proof that the requested HTML artifact was saved.
  if (/\bcreate_artifact\b/i.test(text) && !explicitlyExcludesNamedTool(text, 'create_artifact')) {
    requirements.push({ id: 'create_artifact_receipt', description: 'a successful create_artifact receipt' });
  }
  if (/\bimage_generate\b/i.test(text) && !explicitlyExcludesNamedTool(text, 'image_generate')) {
    requirements.push({ id: 'image_generate_receipt', description: 'a successful image_generate receipt' });
  }
  if (patterns.schedule.test(text) && !explicitlyExcludesSchedule(text)) {
    requirements.push({ id: 'schedule_receipt', description: 'a saved schedule receipt including its next run or enabled state' });
  }

  return { required: requirements.length > 0, requirements };
}

export function evaluateCompletionContract(instruction, toolsUsed = [], toolResults = []) {
  const contract = inferCompletionContract(instruction);
  const entries = evidenceIndex(toolsUsed, toolResults);
  const satisfied = new Set();

  if (hasSuccessful(entries, ['coding_workspace_replace_text', 'coding_workspace_write_file', 'github_put_file', 'github_create_or_update_file'], r => r.edits?.length || r.file?.path || r.commit || r.sha || r.content)) {
    satisfied.add('source_edit');
  }
  if (hasSuccessful(entries, ['coding_workspace_run_checks', 'coding_workspace_run_command'], r =>
    r.status === 'ready' && r.terminal !== false && (!Array.isArray(r.checks) || r.checks.every(check => check.success !== false))
  )) satisfied.add('checks');
  if (hasSuccessful(entries, ['vercel_wait_for_deployment'], r => {
    const state = String(r.status || r.deployment?.state || r.deployment?.readyState || '').toUpperCase();
    return r.terminal === true && ['READY', 'SUCCESS'].includes(state);
  })) satisfied.add('checks');
  if (hasSuccessful(entries, ['coding_workspace_diff', 'github_get_commit', 'github_compare'], r =>
    typeof r.diff === 'string' || r.status || r.files || r.sha
  )) satisfied.add('diff');
  if (hasSuccessful(entries, ['github_put_file', 'github_create_or_update_file'], r =>
    Boolean(r.commit && r.sha)
  )) satisfied.add('diff');
  if (hasSuccessful(entries, ['vercel_wait_for_deployment', 'vercel_list_deployments', 'vercel_create_deployment', 'netlify_', 'railway_'], r => {
    const state = String(r.status || r.deployment?.state || r.deployment?.readyState || r.deployments?.[0]?.state || '').toUpperCase();
    return r.terminal === true && ['READY', 'SUCCESS'].includes(state);
  })) satisfied.add('deployment_ready');
  if (hasSuccessful(entries, ['browser_task', 'browser_screenshot', 'bloom_take_screenshot', 'bloom_browser_screenshot'], r =>
    r.blocked !== true && Boolean(r.url_final || r.currentUrl || r.screenshot || r.screenshot_base64 || r.image || r.result)
  )) satisfied.add('browser_evidence');
  if (hasSuccessful(entries, ['ghl_', 'crm_'], r =>
    Boolean(r.id || r.messageId || r.contactId || r.opportunityId || r.receipt || r.success)
  )) satisfied.add('crm_receipt');
  if (hasSuccessful(entries, ['send_email', 'gmail_send', 'email_send', 'reply_email'], r =>
    Boolean(r.id || r.messageId || r.threadId || r.receipt)
  )) satisfied.add('email_receipt');
  if (hasSuccessful(entries, ['create_artifact', 'create_docx', 'create_pdf', 'create_xlsx', 'create_pptx', 'image_generate'], r =>
    Boolean(r.artifact?.name || r.artifactId || r.fileId || r.url || r.image_url)
  )) satisfied.add('artifact_receipt');
  if (hasSuccessful(entries, ['create_artifact'], r =>
    Boolean(r.artifact?.id || r.artifact?.name || r.artifactId || r.id)
  )) satisfied.add('create_artifact_receipt');
  if (hasSuccessful(entries, ['image_generate'], r =>
    Boolean(r.fileId || r.url || r.image_url)
  )) satisfied.add('image_generate_receipt');
  if (hasSuccessful(entries, ['schedule', 'scheduled_task', 'cron'], r =>
    Boolean(r.id || r.scheduleId || r.nextRun || r.next_run || r.enabled !== undefined)
  )) satisfied.add('schedule_receipt');

  const missing = contract.requirements.filter(requirement => !satisfied.has(requirement.id));
  return {
    ...contract,
    satisfied: contract.requirements.filter(requirement => satisfied.has(requirement.id)),
    missing,
    complete: missing.length === 0,
  };
}

export function buildCompletionNudge(evaluation) {
  if (!evaluation?.missing?.length) return '';
  return [
    '[SYSTEM — COMPLETION CONTRACT NOT SATISFIED]',
    'Do not report this task as complete yet. The following required proof is missing:',
    ...evaluation.missing.map(item => `- ${item.description}`),
    '',
    'Continue now using the appropriate tools. If an external operation is still processing, poll it. If the required action is genuinely impossible, report the exact terminal error or request only the authority that is actually missing.',
  ].join('\n');
}
