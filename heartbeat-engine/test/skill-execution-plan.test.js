import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillExecutionContract, buildSkillExecutionPlan } from '../src/skills/skill-loader.js';

const engineeringTools = [
  'coding_workspace_prepare',
  'coding_workspace_list_files',
  'coding_workspace_read_file',
  'coding_workspace_replace_text',
  'coding_workspace_write_file',
  'coding_workspace_run_checks',
  'coding_workspace_run_command',
  'coding_workspace_diff',
  'coding_workspace_commit',
  'vercel_list_deployments',
  'vercel_wait_for_deployment',
];

test('repository work deterministically selects the engineering skill and validates its tools', () => {
  const plan = buildSkillExecutionPlan('chat', 'Fix the homepage in my GitHub repository and deploy it to Vercel', engineeringTools);
  assert.equal(plan.ready, true);
  assert.ok(plan.skills.some(skill => skill.name === 'existing-site-engineering'));
  assert.doesNotMatch(plan.skills.map(skill => skill.name).join(','), /website-creation/);
});

test('engineering skill reports an exact missing connector tool', () => {
  const plan = buildSkillExecutionPlan('chat', 'Edit my existing website repository', engineeringTools.filter(name => name !== 'coding_workspace_run_checks'));
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.missingTools, ['coding_workspace_run_checks']);
  assert.match(buildSkillExecutionContract(plan), /Missing tools: coding_workspace_run_checks/);
});

test('Hyperframes selects its tenant tools without requiring desktop', () => {
  const tools = ['hyperframes_list_projects', 'hyperframes_catalog', 'hyperframes_add', 'hyperframes_clone_template', 'hyperframes_read_project', 'hyperframes_write_project', 'hyperframes_run'];
  const plan = buildSkillExecutionPlan('chat', 'Create and render a Hyperframes animation', tools);
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.skills.find(skill => skill.name === 'hyperframes')?.requiredTools, tools);
});

test('HeyGen requests select the tenant video skill and complete v3 tool set', () => {
  const tools = ['heygen_list_avatars', 'heygen_list_voices', 'heygen_create_video', 'heygen_get_video'];
  const plan = buildSkillExecutionPlan('chat', 'Use HeyGen to make a realistic video of herself', tools);
  assert.equal(plan.ready, true);
  assert.deepEqual(plan.skills.find(skill => skill.name === 'heygen-video')?.requiredTools, tools);
});

test('CRM selection validates the connected read and messaging tools', () => {
  const tools = ['ghl_search_contacts', 'ghl_get_contact', 'ghl_send_message'];
  const plan = buildSkillExecutionPlan('chat', 'Check a contact in GHL CRM', tools);
  assert.equal(plan.ready, true);
  assert.ok(plan.skills.some(skill => skill.name === 'ghl-crm'));
});

test('engineering workflow and evidence-report wording do not select CRM or document creation', () => {
  const plan = buildSkillExecutionPlan(
    'chat',
    'Inspect the GitHub repository using the existing-site engineering workflow and report exact evidence.',
    [
      'coding_workspace_prepare',
      'coding_workspace_list_files',
      'coding_workspace_read_file',
      'coding_workspace_replace_text',
      'coding_workspace_write_file',
      'coding_workspace_run_checks',
      'coding_workspace_run_command',
      'coding_workspace_diff',
      'coding_workspace_commit',
      'vercel_list_deployments',
      'vercel_wait_for_deployment',
    ],
  );

  assert.deepEqual(plan.skills.map(skill => skill.name), ['existing-site-engineering', 'frontend-design']);
  assert.equal(plan.ready, true);
});
