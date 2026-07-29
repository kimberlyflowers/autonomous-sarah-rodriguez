import test from 'node:test';
import assert from 'node:assert/strict';
import { findSkills, validateSkillCatalog } from '../src/skills/skill-loader.js';

test('loads Uber concierge guidance for food ordering', () => {
  const names = findSkills('chat', 'Order lunch for me through Uber Eats').map(skill => skill.name);
  assert.ok(names.includes('uber-concierge'));
});

test('loads Uber concierge guidance for ride requests', () => {
  const names = findSkills('chat', 'Book an Uber ride to the airport').map(skill => skill.name);
  assert.ok(names.includes('uber-concierge'));
});

test('Uber concierge skill has direct discovery, browser handoff, approval card, and guarded payment tools', () => {
  const result = validateSkillCatalog([
    'uber_eats_search',
    'browser_task',
    'bloom_clarify',
    'uber_eats_finalize_purchase',
  ]).find(skill => skill.name === 'uber-concierge');
  assert.equal(result?.valid, true);
  assert.deepEqual(result?.missingTools, []);
});

test('negated CRM language in an Uber request does not load the CRM skill', () => {
  const names = findSkills(
    'chat',
    'Open Uber Eats and show nearby lunch options. Do not create a CRM contact or place an order.',
  ).map(skill => skill.name);
  assert.equal(names.includes('ghl-crm'), false);
  assert.equal(names.includes('uber-concierge'), true);
});
