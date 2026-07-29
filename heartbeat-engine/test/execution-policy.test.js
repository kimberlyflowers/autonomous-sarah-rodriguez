import test from 'node:test';
import assert from 'node:assert/strict';
import { compactToolResultForContext, isEngineeringTask, selectExecutionModel, selectTaskTools } from '../src/orchestrator/execution-policy.js';

test('OMI-style repository edits stay on the configured Gemini OpenRouter coding model', () => {
  const instruction = 'Edit the homepage in the omiwebsitebrandkit GitHub repo and deploy it to Vercel';
  assert.equal(isEngineeringTask(instruction), true);
  assert.equal(selectExecutionModel({
    requestedModel: 'google/gemini-2.5-flash',
    instruction,
    openRouterAvailable: true,
    codingModel: 'google/gemini-2.5-flash',
  }), 'google/gemini-2.5-flash');
});

test('named website widget replacements route as existing-site engineering work', () => {
  const instruction = 'On the OMI website change the bottom-right chat widget picture to the uploaded image, deploy it, then open it in my browser';
  assert.equal(isEngineeringTask(instruction), true);
});

test('ordinary chat retains the tenant-selected model', () => {
  assert.equal(selectExecutionModel({
    requestedModel: 'google/gemini-2.5-flash',
    instruction: 'Write a friendly LinkedIn caption',
    openRouterAvailable: true,
  }), 'google/gemini-2.5-flash');
});

test('engineering tasks receive focused tools without CRM noise', () => {
  const tools = [
    { name: 'coding_workspace_prepare' },
    { name: 'coding_workspace_run_checks' },
    { name: 'vercel_wait_for_deployment' },
    { name: 'github_get_repository' },
    { name: 'task_progress' },
    { name: 'image_generate' },
    { name: 'get_session_files' },
    { name: 'bloom_browser_snapshot' },
    { name: 'bloom_browser_upload_file' },
    { name: 'ghl_create_contact' },
    { name: 'send_email' },
  ];
  const selected = selectTaskTools(tools, 'Fix my existing website repository and deploy it');
  assert.deepEqual(selected.map(tool => tool.name), [
    'coding_workspace_prepare',
    'coding_workspace_run_checks',
    'vercel_wait_for_deployment',
    'github_get_repository',
    'task_progress',
    'image_generate',
    'get_session_files',
    'bloom_browser_snapshot',
    'bloom_browser_upload_file',
  ]);
});

test('non-engineering tasks retain the complete ready tool set', () => {
  const tools = [{ name: 'ghl_create_contact' }, { name: 'send_email' }];
  assert.equal(selectTaskTools(tools, 'Email this lead'), tools);
});

test('tool results are compacted recursively without dropping evidence fields', () => {
  const compacted = compactToolResultForContext({
    path: 'web/app/page.tsx',
    content: 'x'.repeat(13000),
    files: Array.from({ length: 82 }, (_, index) => ({ name: `file-${index}` })),
  });
  assert.equal(compacted.path, 'web/app/page.tsx');
  assert.match(compacted.content, /truncated for context efficiency/);
  assert.equal(compacted.files.length, 81);
  assert.match(compacted.files.at(-1), /additional items omitted/);
});

test('tool results redact nested binary screenshots and media data URLs', () => {
  const compacted = compactToolResultForContext({
    success: true,
    result: {
      screenshot_base64: 'a'.repeat(50000),
      preview: 'data:image/png;base64,abc123',
      currentUrl: 'https://example.com',
    },
  });
  assert.equal(compacted.result.screenshot_base64, '[Binary media omitted; capture succeeded]');
  assert.match(compacted.result.preview, /Binary media omitted/);
  assert.equal(compacted.result.currentUrl, 'https://example.com');
});
