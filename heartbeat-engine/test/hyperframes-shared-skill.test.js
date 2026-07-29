import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findSkills, getSkillContext, validateSkillCatalog } from '../src/skills/skill-loader.js';
import { executeDeveloperTool } from '../src/tools/developer-tools.js';

const hyperframesTools = [
  'hyperframes_list_projects',
  'hyperframes_catalog',
  'hyperframes_add',
  'hyperframes_clone_template',
  'hyperframes_read_project',
  'hyperframes_write_project',
  'hyperframes_run',
];

test('shared HyperFrames skill routes for every agent-facing motion request', () => {
  for (const instruction of [
    'Jonathan, create a HyperFrames product launch video',
    'Sarah, make a short motion graphic with a lower third',
    'Marcus, edit the existing seekable animation',
  ]) {
    const names = findSkills('chat', instruction).map(skill => skill.name);
    assert.ok(names.includes('hyperframes'), instruction);
  }
});

test('shared HyperFrames skill exposes the customized resume and completion rules', () => {
  const context = getSkillContext('chat', 'Jonathan, edit our existing HyperFrames project');
  assert.match(context, /Start from real project state/);
  assert.match(context, /hyperframes_list_projects/);
  assert.match(context, /hyperframes_read_project/);
  assert.match(context, /upgrade-check/);
  assert.match(context, /Completion contract/);
  assert.match(context, /every Bloomie in Chat, Work, and Scheduled Tasks/);
});

test('shared HyperFrames skill validates its complete tenant-safe tool set', () => {
  const result = validateSkillCatalog(hyperframesTools).find(skill => skill.name === 'hyperframes');
  assert.equal(result?.valid, true);
  assert.deepEqual(result?.missingTools, []);
});

test('a non-Sarah tenant can write, discover, and resume its own HyperFrames project', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'bloomie-hyperframes-test-'));
  const previousRoot = process.env.HYPERFRAMES_WORKSPACE_ROOT;
  process.env.HYPERFRAMES_WORKSPACE_ROOT = workspace;
  try {
    const organizationId = 'jonathan-test-tenant';
    const write = await executeDeveloperTool('hyperframes_write_project', {
      project: 'jonathan-motion-test',
      files: [
        { path: 'BRIEF.md', content: '# Workflow\nmotion-graphics\n' },
        { path: 'index.html', content: '<main data-composition-id="jonathan-test" data-start="0" data-width="1920" data-height="1080" data-duration="5"><div class="clip" data-start="0" data-duration="5" data-track-index="1"></div></main>' },
      ],
    }, organizationId);
    assert.equal(write.success, true);
    assert.equal(write.hasIndex, true);

    const listed = await executeDeveloperTool('hyperframes_list_projects', {}, organizationId);
    assert.equal(listed.success, true);
    assert.equal(listed.projects[0]?.project, 'jonathan-motion-test');
    assert.equal(listed.projects[0]?.hasBrief, true);
    assert.equal(listed.templates.length, 10);
    assert.ok(listed.templates.some(template => template.template === '03-quote-glass'));

    const read = await executeDeveloperTool('hyperframes_read_project', {
      project: 'jonathan-motion-test',
    }, organizationId);
    assert.equal(read.success, true);
    assert.match(read.files.find(file => file.path === 'BRIEF.md')?.content || '', /motion-graphics/);
    assert.match(read.files.find(file => file.path === 'index.html')?.content || '', /jonathan-test/);

    const cloned = await executeDeveloperTool('hyperframes_clone_template', {
      template: '03-quote-glass',
      project: 'jonathan-quote-video',
    }, organizationId);
    assert.equal(cloned.success, true);
    const clonedRead = await executeDeveloperTool('hyperframes_read_project', {
      project: 'jonathan-quote-video',
      paths: ['index.html', 'hyperframes.json'],
    }, organizationId);
    assert.equal(clonedRead.files.length, 2);
  } finally {
    if (previousRoot === undefined) delete process.env.HYPERFRAMES_WORKSPACE_ROOT;
    else process.env.HYPERFRAMES_WORKSPACE_ROOT = previousRoot;
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
