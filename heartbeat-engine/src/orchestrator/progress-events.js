export const progressUpdates = new Map();
const progressSinks = new Map();
export { buildCodexStyleOpening } from './autonomy-policy.js';

function cleanText(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function receiptId(result = {}) {
  return result.id || result.messageId || result.message_id || result.contactId ||
    result.contact_id || result.artifactId || result.artifact_id || result.taskId ||
    result.task_id || result.url || null;
}

export function appendProgressUpdate(sessionId, text, kind = 'update', metadata = {}) {
  const key = sessionId || 'default';
  const message = cleanText(text);
  if (!message) return null;
  const current = progressUpdates.get(key) || { events: [], updatedAt: 0 };
  const previous = current.events.at(-1);
  if (previous?.text === message && previous?.kind === kind) return previous;

  const event = {
    id: `${Date.now()}-${current.events.length}`,
    text: message,
    kind,
    timestamp: Date.now(),
    ...metadata,
  };
  current.events.push(event);
  if (current.events.length > 50) current.events = current.events.slice(-50);
  current.updatedAt = Date.now();
  progressUpdates.set(key, current);
  const sink = progressSinks.get(key);
  if (sink) Promise.resolve(sink(event)).catch(() => {});
  return event;
}

export function clearProgressUpdates(sessionId) {
  progressUpdates.delete(sessionId || 'default');
}

export function setProgressSink(sessionId, sink = null) {
  const key = sessionId || 'default';
  if (typeof sink === 'function') progressSinks.set(key, sink);
  else progressSinks.delete(key);
}

export function buildToolProgressUpdate(toolName, input = {}, result = null) {
  const name = String(toolName || '');
  const failed = result?.success === false || Boolean(result?.error);
  if (failed) {
    return {
      kind: 'error',
      text: `${name.replace(/_/g, ' ')} returned an error. I’m checking the exact cause before choosing the next approach.`,
    };
  }

  if (name === 'github_get_repository') {
    const branch = result?.repository?.defaultBranch;
    return { kind: 'evidence', text: `I found the repository metadata${branch ? ` and confirmed the default branch is ${branch}` : ''}.` };
  }
  if (name === 'github_list_branches') {
    return { kind: 'evidence', text: `I checked the repository branches instead of assuming main or master.` };
  }
  if (name === 'github_list_files' || name === 'github_search_code') {
    return { kind: 'evidence', text: `I inspected the repository structure to locate the correct implementation files.` };
  }
  if (name === 'github_get_file') {
    return { kind: 'evidence', text: `I found and read ${cleanText(input.path || result?.path || 'the target file', 120)}.` };
  }
  if (name === 'github_put_file') {
    return { kind: 'milestone', text: `The code change is committed to GitHub. I’m verifying the deployment next.` };
  }
  if (name === 'vercel_create_deployment') {
    return { kind: 'milestone', text: `Vercel accepted the deployment. I’m waiting for the terminal build status.` };
  }
  if (name === 'vercel_wait_for_deployment') {
    if (result?.status === 'ready') return { kind: 'success', text: `The Vercel deployment reached READY. I’m completing the final live verification.` };
    if (result?.status === 'failed') return { kind: 'error', text: `Vercel reached a terminal failure. I’m inspecting the deployment evidence now.` };
    return { kind: 'pending', text: `Vercel is still building. That is a pending state, not a failure.` };
  }
  if (name === 'vercel_list_deployments') {
    const state = result?.deployments?.[0]?.state;
    return { kind: state === 'READY' ? 'success' : 'pending', text: state === 'READY' ? `The newest Vercel deployment is READY.` : `I checked Vercel; the newest deployment is ${cleanText(state || 'still pending', 40)}.` };
  }
  if (name === 'task_progress') {
    const active = input?.todos?.find(todo => todo?.status === 'in_progress');
    if (active) return { kind: 'plan', text: cleanText(active.activeForm || active.content) };
    return null;
  }
  if (name === 'coding_workspace_prepare') {
    return { kind: 'milestone', text: `I prepared the repository workspace and am inspecting the real source tree before editing.` };
  }
  if (name === 'coding_workspace_list_files' || name === 'coding_workspace_read_file') {
    return { kind: 'evidence', text: `I inspected the workspace source files and am narrowing the change to the correct implementation.` };
  }
  if (name === 'coding_workspace_replace_text') {
    return { kind: 'milestone', text: `I applied the controlled workspace edits. I’m running checks before any commit.` };
  }
  if (name === 'coding_workspace_write_file') {
    return { kind: 'milestone', text: `I saved the workspace file and am running checks before any commit.` };
  }
  if (name === 'coding_workspace_run_command') {
    return result?.status === 'ready'
      ? { kind: 'success', text: `The repository-specific workspace command passed.` }
      : { kind: 'error', text: `The repository-specific workspace command failed. I’m using its exact output to repair the change.` };
  }
  if (name === 'coding_workspace_run_checks') {
    return result?.status === 'ready'
      ? { kind: 'success', text: `The requested repository checks passed. I’m reviewing the diff before committing.` }
      : { kind: 'error', text: `A repository check failed. I’m using the exact output to repair the change before committing.` };
  }
  if (name === 'coding_workspace_diff') {
    return { kind: 'evidence', text: `I reviewed the workspace diff and am confirming that only the intended files changed.` };
  }
  if (name === 'coding_workspace_commit') {
    return { kind: 'milestone', text: `The tested workspace changes are committed and pushed to GitHub. I’m verifying deployment now.` };
  }
  if (name.startsWith('ghl_') && /(send|call|create|update)/.test(name)) {
    const id = receiptId(result);
    return {
      kind: 'evidence',
      text: `The CRM accepted the requested action${id ? ` and returned receipt ${cleanText(id, 80)}` : ''}. I’m checking the resulting record before reporting completion.`,
    };
  }
  if (name === 'browser_task' || name.startsWith('bloom_browser_')) {
    const url = result?.url || result?.currentUrl;
    return {
      kind: 'evidence',
      text: `The browser step completed${url ? ` at ${cleanText(url, 120)}` : ''}. I’m verifying the visible page state rather than assuming the action succeeded.`,
    };
  }
  if (/(create|edit|update)_artifact/.test(name) || /^create_(docx|pptx|pdf|xlsx|csv)$/.test(name)) {
    const id = receiptId(result);
    return {
      kind: 'milestone',
      text: `The deliverable was saved${id ? ` with receipt ${cleanText(id, 80)}` : ''}. I’m validating its format and requested content next.`,
    };
  }
  if (name.includes('scheduled_task')) {
    const id = receiptId(result);
    return {
      kind: 'evidence',
      text: `The scheduled-task record changed${id ? ` with receipt ${cleanText(id, 80)}` : ''}. I’m re-checking its timing and enabled state.`,
    };
  }
  if (name.startsWith('image_') || name === 'generate_images_parallel') {
    const count = Array.isArray(result?.images) ? result.images.length : 1;
    return {
      kind: 'milestone',
      text: `${count > 1 ? `${count} images were` : 'The image was'} generated. I’m checking dimensions, realism, and fit against the request before using it.`,
    };
  }
  if (name.includes('screenshot')) return { kind: 'evidence', text: `I captured the current screen and am checking it against the requested outcome.` };
  if (name.includes('search')) return { kind: 'evidence', text: `I completed the search and am evaluating the results before acting.` };
  if (name.includes('create') || name.includes('update') || name.includes('write') || name.includes('send')) {
    return { kind: 'milestone', text: `${name.replace(/_/g, ' ')} completed. I’m verifying the result before moving on.` };
  }
  return { kind: 'update', text: `${name.replace(/_/g, ' ')} completed. I’m continuing with the next verified step.` };
}

export function buildCheckpointResumeContext(checkpoint) {
  if (!checkpoint || !['running', 'pending', 'timeout'].includes(checkpoint.status)) return '';
  const todos = Array.isArray(checkpoint.todos) ? checkpoint.todos : [];
  const unfinished = todos.filter(todo => todo?.status !== 'completed').map(todo => todo.content).filter(Boolean);
  const pendingJobs = Array.isArray(checkpoint.pending_jobs) ? checkpoint.pending_jobs : [];
  return [
    '<durable_execution_checkpoint>',
    `A prior execution in this same chat is ${checkpoint.status}. Resume it instead of restarting or asking the user to repeat details.`,
    checkpoint.current_step ? `Current step: ${checkpoint.current_step}` : '',
    unfinished.length ? `Unfinished steps: ${unfinished.join(' | ')}` : '',
    pendingJobs.length ? `Pending external jobs: ${JSON.stringify(pendingJobs).slice(0, 2000)}` : '',
    checkpoint.last_error ? `Last exact error: ${checkpoint.last_error}` : '',
    'Re-check external state, continue from the first unfinished step, and preserve completed work.',
    '</durable_execution_checkpoint>',
  ].filter(Boolean).join('\n');
}
