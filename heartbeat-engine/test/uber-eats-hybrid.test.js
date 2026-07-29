import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executeWebSearchTool, webSearchToolDefinitions } from '../src/tools/web-search-tools.js';

const chat = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');
const skill = fs.readFileSync(new URL('../src/skills/catalog/uber-concierge.md', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');

test('Uber Eats discovery is read-only and requires address plus a specific query', () => {
  const tool = webSearchToolDefinitions.uber_eats_search;
  assert.equal(tool.operation, 'read');
  assert.deepEqual(tool.parameters.required, ['address', 'query']);
  assert.match(tool.description, /preliminary/i);
});

test('Uber Eats hybrid keeps discovery separate from the final purchase tool', () => {
  assert.match(chat, /name: "uber_eats_search"/);
  assert.match(chat, /name: "uber_eats_finalize_purchase"/);
  assert.match(skill, /live browser is the source of truth/i);
  assert.match(skill, /Never copy preliminary discovery text into the approval card/i);
  assert.match(skill, /exact final total/i);
});

test('Uber Eats discovery options persist as inline cards in Chat and Work', () => {
  assert.match(chat, /appendUberEatsResultsMarker/);
  assert.match(chat, /uber_eats_results:/);
  assert.match(dashboard, /function UberEatsResultsCard/);
  assert.match(dashboard, /Uber Eats options/);
  assert.match(dashboard, /See all results in Uber Eats/);
  assert.match(dashboard, /function ManagedMessage[\s\S]*UberEatsResultsCard/);
  assert.match(dashboard, /messages\.map[\s\S]*parseUberEatsResults\(m\.t\)[\s\S]*UberEatsResultsCard/);
});

test('Uber Eats discovery refuses incomplete input before calling a provider', async () => {
  const result = await executeWebSearchTool('uber_eats_search', { address: '', query: 'Thai' });
  assert.equal(result.success, false);
  assert.match(result.error, /requires both/i);
});

test('full street address is not included in the generated browser handoff URL', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => '<html><body>No search results</body></html>',
  });
  try {
    const result = await executeWebSearchTool('uber_eats_search', {
      address: '1029 E. Sunshine Dr., San Antonio, TX 78228',
      query: 'Thai',
      count: 4,
    });
    assert.equal(result.success, true);
    assert.equal(result.addressSummary, 'San Antonio, TX 78228');
    assert.doesNotMatch(result.browserHandoffUrl, /1029|Sunshine/i);
    assert.match(result.browserHandoffUrl, /ubereats\.com\/search/);
    assert.equal(result.requiresLiveBrowserVerification, true);
  } finally {
    global.fetch = originalFetch;
  }
});
