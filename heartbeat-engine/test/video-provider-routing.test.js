import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const chat = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');
const bloomSkill = fs.readFileSync(new URL('../src/skills/catalog/bloom-studio-video.md', import.meta.url), 'utf8');
const heygenSkill = fs.readFileSync(new URL('../src/skills/catalog/heygen-video.md', import.meta.url), 'utf8');
const billingUi = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');

test('legacy RunPod generator is excluded and Bloom Studio has a dedicated route', () => {
  assert.match(chat, /tool\.name === 'video_generate' \|\| tool\.name === 'video_job_status'/);
  assert.match(chat, /bloom_studio_generate_video/);
  assert.match(bloomSkill, /Never call the legacy `video_generate`/);
});

test('HeyGen self-video workflow requires tenant-private identity matching', () => {
  assert.match(heygenSkill, /ownership: private/);
  assert.match(heygenSkill, /recommendedForActiveAgent/);
  assert.match(heygenSkill, /Never silently substitute a public avatar/);
});

test('Whop checkout is embedded and does not open a new billing tab', () => {
  assert.match(billingUi, /data-whop-checkout-plan-id/);
  assert.doesNotMatch(billingUi, /checkoutWindow=window\.open/);
  assert.match(billingUi, /Secure checkout powered by Whop/);
});

test('an explicitly named video provider is locked for that request', () => {
  assert.match(chat, /availableTools = availableTools\.filter\(tool => !tool\.name\.startsWith\('heygen_'\)\)/);
  assert.match(chat, /If BLOOM Studio fails, report its exact verified error; do not switch providers/);
  assert.match(chat, /availableTools = availableTools\.filter\(tool => !tool\.name\.startsWith\('bloom_studio_'\)\)/);
});
