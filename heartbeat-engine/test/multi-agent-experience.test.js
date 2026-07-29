import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asksUserForDiscoverableTechnicalContent,
  buildNewAgentStandingInstructions,
  buildSharedExecutionContract,
  ensureImageToolOutputsVisible,
  getAgentDisplayName,
  isSelfImageDisplayRequest,
} from '../src/orchestrator/agent-experience.js';

const sarah = { name: 'Sarah Rodriguez' };
const jonathan = { name: 'Jonathan' };

test('identity helpers use the loaded agent instead of Sarah globally', () => {
  assert.equal(getAgentDisplayName(jonathan), 'Jonathan');
  assert.equal(getAgentDisplayName({}), 'Bloomie AI Employee');
});

test('self-image requests are recognized for every loaded Bloomie', () => {
  assert.equal(isSelfImageDisplayRequest('Do you have an image of yourself?', jonathan), true);
  assert.equal(isSelfImageDisplayRequest('Show me your photo', sarah), true);
  assert.equal(isSelfImageDisplayRequest('Create an image of Jonathan at work', jonathan), true);
  assert.equal(isSelfImageDisplayRequest('Create a logo', jonathan), false);
});

test('chat runtime removes no-reference overrides for Bloomie self-images', async () => {
  const source = await import('node:fs/promises').then(fs =>
    fs.readFile(new URL('../src/api/chat.js', import.meta.url), 'utf8'),
  );
  assert.match(source, /requestedSelfImage && block\.input\.no_reference/);
  assert.match(source, /delete block\.input\.no_reference/);
});

test('scheduled execution contract is identity-safe and requires evidence', () => {
  const contract = buildSharedExecutionContract(
    { name: 'Jonathan', role: 'School Operations & Communications Assistant' },
    'scheduled',
  );
  assert.match(contract, /CURRENT BLOOMIE: Jonathan/);
  assert.match(contract, /blocked browser is one failed access path/i);
  assert.match(contract, /substantive action and record evidence/i);
  assert.doesNotMatch(contract, /CURRENT BLOOMIE: Sarah Rodriguez/);
});

test('new agents receive their own identity while inheriting shared execution behavior', () => {
  const instructions = buildNewAgentStandingInstructions('Avery Stone', 'Operations Coordinator');
  assert.match(instructions, /You are Avery Stone, an autonomous Operations Coordinator/);
  assert.doesNotMatch(instructions, /Sarah Rodriguez/);
  assert.match(buildSharedExecutionContract({ name: 'Avery Stone', role: 'Operations Coordinator' }), /CURRENT BLOOMIE: Avery Stone/);
});

test('Work sessions persist and route the selected agent instead of Sarah', async () => {
  const source = await import('node:fs/promises').then(fs =>
    fs.readFile(new URL('../src/api/builds.js', import.meta.url), 'utf8'),
  );
  assert.match(source, /agent_id: agent\.id/);
  assert.match(source, /agentId: agent\.id/);
  assert.match(source, /resolveBuildAgent/);
  assert.doesNotMatch(source, /agent_id: process\.env\.AGENT_UUID/);
  assert.doesNotMatch(source, /Use Sarah's real engineering tools/);
});

test('collapsed and live-avatar UI labels use the selected Bloomie', async () => {
  const source = await import('node:fs/promises').then(fs =>
    fs.readFile(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8'),
  );
  assert.match(source, /title=\{`Show \$\{aFN\} Live`\}/);
  assert.match(source, /\{aFN\} Live/);
  assert.match(source, /`\$\{firstName\} Live is connecting\.\.\.`/);
  assert.doesNotMatch(source, />\s*Sarah Live\s*</);
  assert.doesNotMatch(source, /title="Show Sarah Live"/);
});

test('scheduled task mutations retain the loaded agent id', async () => {
  const source = await import('node:fs/promises').then(fs =>
    fs.readFile(new URL('../src/api/chat.js', import.meta.url), 'utf8'),
  );
  assert.match(source, /body\.agentId = agentConfig\?\.agentId/);
  assert.match(source, /agentId=\$\{encodeURIComponent\(currentAgentId\)\}/);
});

test('generated image results are always rendered in the final chat response', () => {
  const rendered = ensureImageToolOutputsVisible(
    'Here is an image of me.',
    [{ name: 'image_generate' }],
    [{ success: true, image_url: 'https://cdn.example.com/jonathan.png' }],
    jonathan,
  );
  assert.match(rendered, /!\[Jonathan\]\(https:\/\/cdn\.example\.com\/jonathan\.png\)/);
});

test('existing image markdown is not duplicated', () => {
  const text = 'Here.\n\n![Sarah Rodriguez](https://cdn.example.com/sarah.png)';
  assert.equal(
    ensureImageToolOutputsVisible(
      text,
      [{ name: 'image_generate' }],
      [{ image_url: 'https://cdn.example.com/sarah.png' }],
      sarah,
    ),
    text,
  );
});

test('a bare image URL is upgraded to an inline image', () => {
  const url = 'https://cdn.example.com/jonathan.png';
  const rendered = ensureImageToolOutputsVisible(
    `Here is my image.\n\n${url}`,
    [{ name: 'image_generate' }],
    [{ image_url: url }],
    jonathan,
  );
  assert.match(rendered, /!\[Jonathan\]\(https:\/\/cdn\.example\.com\/jonathan\.png\)/);
});

test('asking the user for discoverable repository evidence is rejected', () => {
  assert.equal(
    asksUserForDiscoverableTechnicalContent('Could you provide the HTML content of the page?'),
    true,
  );
  assert.equal(
    asksUserForDiscoverableTechnicalContent('Please confirm the branch name and entry file.'),
    true,
  );
  assert.equal(
    asksUserForDiscoverableTechnicalContent('Which customer should receive this email?'),
    false,
  );
});
