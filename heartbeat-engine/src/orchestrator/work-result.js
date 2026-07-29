export function classifyWorkOutputStatus(output = '') {
  const text = String(output).trim();
  if (/^the task failed with this exact error:/i.test(text)
    || /\bterminal failure\b/i.test(text)
    || /^failed:\s/i.test(text)) return 'failed';
  if (/^the task is blocked\b/i.test(text)) return 'blocked';
  if (/^the work is still pending verification\b/i.test(text)
    || /^the operation is still pending\b/i.test(text)) return 'pending';
  return 'complete';
}

