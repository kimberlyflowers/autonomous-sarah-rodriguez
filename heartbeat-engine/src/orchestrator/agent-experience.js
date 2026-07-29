export function getAgentDisplayName(agentConfig = {}) {
  return agentConfig?.name || agentConfig?.displayName || agentConfig?.agentName || 'Bloomie AI Employee';
}

export function buildSharedExecutionContract(agentConfig = {}, mode = 'chat') {
  const name = getAgentDisplayName(agentConfig);
  const role = agentConfig?.role || 'AI Employee';
  const scheduled = mode === 'scheduled';
  return `CURRENT BLOOMIE: ${name} — ${role}
Use this loaded identity. Never fall back to Sarah Rodriguez or another employee.
The canonical database name is "${name}" and the canonical job role is "${role}". When asked who you are or what your role is, state those exact values before describing specialties.
EXECUTION CONTRACT:
- Plan substantial work, begin safe in-scope execution, and verify each completed step.
- Use saved context, connected tools, repositories, records, and external evidence before asking the user.
- A blocked browser is one failed access path, not the end of the task. Try repository, coding workspace, deployment, search, API, or desktop tools that are available.
- Never ask the user for HTML, source code, a branch, file path, framework, repository structure, or deployment state until the available discovery paths are exhausted.
- Never claim an image, file, artifact, message, deployment, or other result unless a tool returned verifiable evidence for it.
${scheduled ? '- Scheduled work must perform a substantive action and record evidence; planning or text-only output is not completion.' : '- Keep the user informed with concise progress milestones while work is running.'}`;
}

export function buildNewAgentStandingInstructions(name, role) {
  const safeName = String(name || 'Bloomie AI Employee').trim();
  const safeRole = String(role || 'AI Employee').trim();
  return `You are ${safeName}, an autonomous ${safeRole} (a "Bloomie") built and deployed by BLOOM Ecosystem.

Every heartbeat cycle, you should:
1. Check for new client inquiries and respond within scope
2. Check for overdue follow-ups and send reminders
3. Check for upcoming calendar events and prepare reminders
4. Check for any tasks assigned to you and work on them
5. Monitor email for anything requiring attention

You operate within your current autonomy level. If something exceeds your scope,
escalate to your manager with your analysis, what you have already checked, and your
recommendation. Never guess — if unsure, escalate.

Log everything: what you did, what you chose not to do (and why), and what you
escalated. Your logs are how trust is built.`;
}

export function isSelfImageDisplayRequest(messageText = '', agentConfig = {}) {
  const text = String(messageText || '').toLowerCase();
  const agentName = getAgentDisplayName(agentConfig).toLowerCase();
  const firstName = agentName.split(/\s+/)[0];
  const hasImageNoun = /\b(image|photo|picture|portrait|headshot|profile photo|avatar)\b/i.test(text);
  const referencesAgent =
    /\b(yourself|of you|your image|your photo|your picture|your portrait|your headshot|your avatar|what you look like)\b/i.test(text) ||
    (!!agentName && text.includes(agentName)) ||
    (!!firstName && firstName.length > 2 && text.includes(firstName));
  return hasImageNoun && referencesAgent;
}

export function asksUserForDiscoverableTechnicalContent(text = '') {
  const response = String(text || '');
  const asksUser =
    /\b(can|could|would)\s+you\s+(provide|send|share|paste|tell|confirm)\b|\bplease\s+(?:you\s+)?(?:provide|send|share|paste|tell|confirm)\b|\bi need (you|the user) to\b/i.test(response);
  const discoverableFact = /\b(html|source code|page content|file path|entry file|branch name|repository structure|repo structure|framework|deployment (?:state|status|url))\b/i.test(response);
  return asksUser && discoverableFact;
}

export function ensureImageToolOutputsVisible(text = '', toolsUsed = [], toolResults = [], agentConfig = {}) {
  let output = String(text || '').trim();
  const urls = [];
  for (let index = 0; index < toolResults.length; index += 1) {
    if (!['image_generate', 'image_edit'].includes(toolsUsed[index]?.name)) continue;
    const result = toolResults[index];
    const candidates = [
      result?.image_url,
      result?.url,
      ...(Array.isArray(result?.images)
        ? result.images.flatMap(image => [image?.image_url, image?.url])
        : []),
    ];
    for (const url of candidates) {
      if (typeof url === 'string' && /^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    }
  }
  const markdownImageUrls = new Set(
    [...output.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi)].map(match => match[1]),
  );
  const missing = urls.filter(url => !markdownImageUrls.has(url));
  if (!missing.length) return output;
  const name = getAgentDisplayName(agentConfig);
  const images = missing.map((url, index) => `![${name}${missing.length > 1 ? ` image ${index + 1}` : ''}](${url})`);
  return `${output}\n\n${images.join('\n\n')}`.trim();
}
