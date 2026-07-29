import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletionNudge, evaluateCompletionContract, inferCompletionContract } from '../src/orchestrator/completion-contract.js';

test('ordinary conversation has no operational completion contract', () => {
  assert.equal(inferCompletionContract('Thanks, are you there?').required, false);
});

test('repository edit requires edit, checks, and diff evidence', () => {
  const evaluation = evaluateCompletionContract(
    'Fix the homepage code in my repository',
    [
      { name: 'coding_workspace_replace_text' },
      { name: 'coding_workspace_run_checks' },
      { name: 'coding_workspace_diff' },
    ],
    [
      { success: true, edits: [{ path: 'app/page.tsx' }] },
      { success: true, status: 'ready', terminal: true, checks: [{ success: true }] },
      { success: true, status: ' M app/page.tsx', diff: 'diff --git a/app/page.tsx' },
    ],
  );
  assert.equal(evaluation.complete, true);
});

test('deployment cannot complete while provider remains pending', () => {
  const evaluation = evaluateCompletionContract(
    'Deploy the website to Vercel',
    [{ name: 'vercel_wait_for_deployment' }],
    [{ success: true, status: 'timeout', terminal: false, pending: true, deployment: { state: 'BUILDING' } }],
  );
  assert.equal(evaluation.complete, false);
  assert.deepEqual(evaluation.missing.map(item => item.id), ['deployment_ready']);
  assert.match(buildCompletionNudge(evaluation), /terminal READY deployment receipt/i);
});

test('email send requires a provider receipt rather than prose', () => {
  const missing = evaluateCompletionContract(
    'Send Sarah an email',
    [{ name: 'send_email' }],
    [{ success: true }],
  );
  assert.equal(missing.complete, false);

  const complete = evaluateCompletionContract(
    'Send Sarah an email',
    [{ name: 'send_email' }],
    [{ success: true, messageId: 'msg-123' }],
  );
  assert.equal(complete.complete, true);
});

test('browser verification requires visible-page evidence', () => {
  const blocked = evaluateCompletionContract(
    'Check the live page in the browser on mobile',
    [{ name: 'browser_task' }],
    [{ success: true, blocked: true }],
  );
  assert.equal(blocked.complete, false);

  const verified = evaluateCompletionContract(
    'Check the live page in the browser on mobile',
    [{ name: 'browser_task' }],
    [{ success: true, currentUrl: 'https://example.com', result: 'No overflow at 390px' }],
  );
  assert.equal(verified.complete, true);
});

test('browser screenshot receipts satisfy visible-page evidence', () => {
  const evaluation = evaluateCompletionContract(
    'Verify the live page in the browser.',
    [{ name: 'browser_screenshot' }],
    [{ success: true, currentUrl: 'https://example.com', screenshot: true }],
  );
  assert.equal(evaluation.complete, true);
});

test('portrait composition language does not trigger browser verification', () => {
  const contract = inferCompletionContract(
    'Generate a 16:9 portrait with the entire head and hair visible and ample headroom.',
  );
  assert.equal(contract.requirements.some(item => item.id === 'browser_evidence'), false);
});

test('explicit browser visibility checks still require browser evidence', () => {
  const contract = inferCompletionContract(
    'Make sure the completed image is visible in the browser.',
  );
  assert.equal(contract.requirements.some(item => item.id === 'browser_evidence'), true);
});

test('explicitly prohibited browser screenshots do not trigger browser verification', () => {
  const contract = inferCompletionContract(
    'Generate the image inline. Do not create an HTML artifact or browser screenshot.',
  );
  assert.equal(contract.requirements.some(item => item.id === 'browser_evidence'), false);
});

test('read-only instructions that explicitly prohibit deployment do not require a deployment receipt', () => {
  const evaluation = evaluateCompletionContract(
    'Read-only: inspect the Vercel repository. Do not modify, commit, or deploy anything.',
    [{ name: 'github_get_repository' }],
    [{ success: true, repository: { defaultBranch: 'main' } }],
  );
  assert.equal(evaluation.missing.some(item => item.id === 'deployment_ready'), false);
});

test('read-only scheduled connector probes do not require a schedule mutation receipt', () => {
  const evaluation = evaluateCompletionContract(
    'Read-only scheduled CRM connector test. Do not create, update, send, notify, publish, schedule, or delete anything.',
    [{ name: 'ghl_search_contacts' }],
    [{ success: true, data: { contacts: [{ id: 'contact-1' }] } }],
  );
  assert.equal(evaluation.missing.some(item => item.id === 'schedule_receipt'), false);
  assert.equal(evaluation.complete, true);
});

test('explicitly prohibited CRM work does not require a CRM mutation receipt', () => {
  const evaluation = evaluateCompletionContract(
    'Open Uber Eats and show nearby lunch options. Do not create a CRM contact or place an order.',
    [{ name: 'browser_task' }],
    [{ success: true, currentUrl: 'https://www.ubereats.com/search', result: 'Nearby lunch options found.' }],
  );
  assert.equal(evaluation.missing.some(item => item.id === 'crm_receipt'), false);
  assert.equal(evaluation.complete, true);
});

test('named scheduled tools must each produce their own receipt', () => {
  const instruction = 'Call image_generate, then call create_artifact using the returned image URL.';
  const imageOnly = evaluateCompletionContract(
    instruction,
    [{ name: 'image_generate' }],
    [{ success: true, image_url: 'https://example.com/hero.png', fileId: 'image-1' }],
  );
  assert.equal(imageOnly.complete, false);
  assert.equal(imageOnly.missing.some(item => item.id === 'create_artifact_receipt'), true);

  const complete = evaluateCompletionContract(
    instruction,
    [{ name: 'image_generate' }, { name: 'create_artifact' }],
    [
      { success: true, image_url: 'https://example.com/hero.png', fileId: 'image-1' },
      { success: true, artifact: { id: 'artifact-1', name: 'draft.html' } },
    ],
  );
  assert.equal(complete.complete, true);
});

test('explicitly prohibited named tools are not required', () => {
  const evaluation = evaluateCompletionContract(
    'Call image_generate once. Do not call create_artifact or publish_artifact.',
    [{ name: 'image_generate' }],
    [{ success: true, image_url: 'https://example.com/hero.png', fileId: 'image-1' }],
  );
  assert.equal(evaluation.complete, true);
});

test('conditional blocked-browser fallback does not require browser evidence', () => {
  const contract = inferCompletionContract(
    'Inspect the GitHub repository. If browser access is blocked, use repository or coding tools.',
  );
  assert.equal(contract.requirements.some(item => item.id === 'browser_evidence'), false);
});

test('read-only coding sandbox tests do not require edits, diffs, or deployment', () => {
  const evaluation = evaluateCompletionContract(
    'Read-only coding sandbox test. Do not edit, commit, or deploy. Run the node command and report stdout.',
    [{ name: 'coding_workspace_run_command' }],
    [{ success: true, status: 'ready', terminal: true, stdout: 'SANDBOX_OK' }],
  );
  assert.equal(evaluation.complete, true);
  assert.deepEqual(evaluation.missing, []);
});

test('new workspace files and controlled commands satisfy engineering proof', () => {
  const evaluation = evaluateCompletionContract(
    'Add a file to the app and verify it.',
    [
      { name: 'coding_workspace_write_file' },
      { name: 'coding_workspace_run_command' },
      { name: 'coding_workspace_diff' },
    ],
    [
      { success: true, file: { path: 'app/new.js' } },
      { success: true, status: 'ready', terminal: true },
      { success: true, status: ' M app/new.js', diff: '+new' },
    ],
  );
  assert.equal(evaluation.complete, true);
});

test('GitHub edit plus READY Vercel preview satisfies remote website proof', () => {
  const evaluation = evaluateCompletionContract(
    'Edit the website repository and deploy a Vercel preview.',
    [
      { name: 'github_put_file' },
      { name: 'vercel_create_deployment' },
      { name: 'vercel_wait_for_deployment' },
    ],
    [
      { success: true, commit: 'https://github.com/example/repo/commit/abc', sha: 'file-sha' },
      { success: true, deployment: { id: 'dpl_123', readyState: 'QUEUED' } },
      { success: true, status: 'ready', terminal: true, deployment: { id: 'dpl_123', state: 'READY', url: 'preview.vercel.app' } },
    ],
  );

  assert.equal(evaluation.complete, true);
  assert.deepEqual(evaluation.missing, []);
});
