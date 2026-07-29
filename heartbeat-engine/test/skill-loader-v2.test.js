import test from 'node:test';
import assert from 'node:assert/strict';
import { findSkills, getAllSkills, validateSkillCatalog } from '../src/skills/skill-loader.js';

const WORKSPACE_TOOLS = [
  'coding_workspace_prepare', 'coding_workspace_list_files', 'coding_workspace_read_file',
  'coding_workspace_replace_text', 'coding_workspace_write_file', 'coding_workspace_run_checks',
  'coding_workspace_run_command', 'coding_workspace_diff',
  'coding_workspace_commit', 'vercel_list_deployments', 'vercel_wait_for_deployment',
];

test('existing repository edits load the engineering workflow without the new-site gate', () => {
  const skills = findSkills('coding', 'Edit the homepage in my existing GitHub repository and deploy it to Vercel');
  const names = skills.map(skill => skill.name);
  assert.ok(names.includes('existing-site-engineering'));
  assert.ok(names.includes('frontend-design'));
  assert.ok(!names.includes('website-creation'));
  assert.ok(!skills.some(skill => skill.body.includes('8 things you MUST know')));
});

test('new website requests still use the website creation workflow', () => {
  const names = findSkills('chat', 'Build a new landing page for my event').map(skill => skill.name);
  assert.ok(names.includes('website-creation'));
  assert.ok(!names.includes('existing-site-engineering'));
});

test('skill v2 metadata exposes versions and validates required tool contracts', () => {
  const engineering = getAllSkills().find(skill => skill.name === 'existing-site-engineering');
  assert.equal(engineering.version, '2.0.0');
  assert.equal(engineering.workflowType, 'coding_workspace');
  assert.deepEqual(engineering.requiredTools, WORKSPACE_TOOLS);

  const valid = validateSkillCatalog(WORKSPACE_TOOLS).find(skill => skill.name === 'existing-site-engineering');
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.missingTools, []);

  const invalid = validateSkillCatalog([]).find(skill => skill.name === 'existing-site-engineering');
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.missingTools, WORKSPACE_TOOLS);
});
