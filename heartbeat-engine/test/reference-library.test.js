import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiSource = await readFile(new URL('../src/api/references.js', import.meta.url), 'utf8');
const chatSource = await readFile(new URL('../src/api/chat.js', import.meta.url), 'utf8');
const desktopSource = await readFile(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
const mobileSource = await readFile(new URL('../dashboard/src/MobileApp.jsx', import.meta.url), 'utf8');
const executorSource = await readFile(new URL('../src/agent/executor.js', import.meta.url), 'utf8');

test('reference API stores metadata under the authenticated organization boundary', () => {
  assert.match(apiSource, /getUserOrgId\(req\)/);
  assert.match(apiSource, /key:\s*SETTINGS_KEY/);
  assert.match(apiSource, /organization_id:\s*orgId/);
  assert.match(apiSource, /validateAgentAccess\(req,\s*agentId\)/);
  assert.doesNotMatch(apiSource, /BLOOM_ORG_ID/);
});

test('identity and HeyGen references cannot leak into tenant-wide scope', () => {
  assert.match(apiSource, /category === 'identity' \|\| category === 'heygen'/);
  assert.match(apiSource, /scope !== 'agent'/);
  assert.match(apiSource, /Employee identity references must belong to one Bloomie/);
});

test('GHL sync is explicit and restricted to approved organization knowledge', () => {
  assert.match(apiSource, /router\.post\('\/:id\/sync-ghl'/);
  assert.match(apiSource, /reference\.category !== 'knowledge'/);
  assert.match(apiSource, /reference\.scope !== 'organization'/);
  assert.match(apiSource, /!reference\.approved/);
  assert.doesNotMatch(apiSource, /sync-ghl.*setInterval/s);
});

test('chat selects agent and task-relevant durable references', () => {
  assert.match(chatSource, /REFERENCE LIBRARY — USE WHEN RELEVANT/);
  assert.match(chatSource, /ref\.agent_id === referenceAgentId/);
  assert.match(chatSource, /writing_style/);
  assert.match(chatSource, /identity/);
  assert.match(chatSource, /Treat writing samples as style guidance, not factual authority/);
});

test('Work and scheduled execution receive the same scoped references', () => {
  assert.match(executorSource, /buildWorkReferenceContext/);
  assert.match(executorSource, /ref\.agent_id === agentId/);
  assert.match(executorSource, /context\.projectId && ref\.scope === 'project'/);
  assert.match(executorSource, /systemPrompt \+= await buildWorkReferenceContext/);
});

test('self-image generation prefers the selected Bloomie reference library', () => {
  assert.match(chatSource, /ref\.agent_id === agentId/);
  assert.match(chatSource, /\['identity', 'heygen'\]\.includes\(ref\.category\)/);
  assert.match(chatSource, /approvedReference\?\.storage_url/);
});

test('References is reachable on desktop and mobile', () => {
  assert.match(desktopSource, /setPg\("references"\)/);
  assert.match(desktopSource, /<span>References<\/span>/);
  assert.match(desktopSource, /<ReferenceLibrary/);
  assert.match(mobileSource, /key: 'references'/);
  assert.match(mobileSource, /📚 Refs/);
  assert.match(mobileSource, /<ReferenceLibrary/);
});
