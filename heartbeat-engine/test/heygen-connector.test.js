import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const integrations = fs.readFileSync(new URL('../src/api/integrations.js', import.meta.url), 'utf8');
const skill = fs.readFileSync(new URL('../src/skills/catalog/heygen-video.md', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');

test('HeyGen connection is tenant scoped and validated before storage', () => {
  assert.match(integrations, /router\.post\('\/heygen\/connect', withAuth/);
  assert.match(integrations, /organization_id: req\.orgId/);
  assert.match(integrations, /api_key: apiKey/);
  assert.match(integrations, /api\.heygen\.com\/v3\/avatars\?ownership=private&limit=1/);
  assert.doesNotMatch(integrations, /HEYGEN_API_KEY/);
});

test('HeyGen disconnect clears the tenant key', () => {
  assert.match(integrations, /router\.post\('\/heygen\/disconnect', withAuth/);
  assert.match(integrations, /status: 'inactive', api_key: null/);
});

test('HeyGen UI masks credentials without inviting password-manager autofill', () => {
  assert.match(dashboard, /heygen:\{cat:"Creative & Video"/);
  assert.match(dashboard, /name="heygen-tenant-api-key"/);
  assert.match(dashboard, /data-lpignore="true"/);
  assert.match(dashboard, /WebkitTextSecurity:"disc"/);
  assert.match(dashboard, /\/api\/integrations\/heygen\/connect/);
});

test('connector cards cannot widen the mobile Customize page', () => {
  assert.match(dashboard, /gridTemplateColumns:mob\?"minmax\(0,1fr\)"/);
  assert.match(dashboard, /maxWidth:"100%",boxSizing:"border-box",overflow:"hidden"/);
  assert.match(dashboard, /overflowX:"hidden"/);
});

test('HeyGen skill requires discovery and real completion evidence', () => {
  assert.match(skill, /required_tools: \[heygen_list_avatars, heygen_list_voices, heygen_create_video, heygen_get_video\]/);
  assert.match(skill, /Use HeyGen API v3 only/);
  assert.match(skill, /Never invent a URL/);
  assert.match(skill, /requires the person's consent/);
});

test('missing tenant connector is reported without wasteful repair loops', () => {
  assert.match(chat, /isExternalConnectorBlocker/);
  assert.match(chat, /is not connected for this organization/);
  assert.match(chat, /!hasExternalConnectorBlocker/);
  assert.match(chat, /repairableFailures = unresolvedFailures\.filter/);
});

test('task progress normalizes omitted statuses', () => {
  assert.match(chat, /index === 0 \? 'in_progress' : 'pending'/);
});
