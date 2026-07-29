import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.join(here, '../dashboard/src/App.jsx'), 'utf8');
const projectsApiSource = fs.readFileSync(path.join(here, '../src/api/projects-supabase.js'), 'utf8');

test('Work sessions are grouped into Project folders with unfiled fallback', () => {
  assert.match(appSource, /projects\.map\(project=>\{/);
  assert.match(appSource, /const projectItems=visible\.filter\(item=>item\.project_id===project\.id\)/);
  assert.match(appSource, />Unfiled<\/div>/);
});

test('Work session options can move into or out of a Project', () => {
  assert.match(appSource, /data-testid="sidebar-work-sessions"/);
  assert.match(appSource, /Move to Project/);
  assert.match(appSource, /Remove from Project/);
  assert.match(appSource, /\/api\/projects\/\$\{targetId\}\/work-sessions/);
  assert.match(projectsApiSource, /router\.patch\('\/:id\/work-sessions'/);
  assert.match(projectsApiSource, /\.from\('website_builds'\)/);
  assert.match(projectsApiSource, /\.eq\('created_by', userId\)/);
});

test('New Work clears stale Project context while Project-launched Work preserves it', () => {
  assert.match(appSource, /setNewWorkProjectId\(''\)/);
  assert.match(appSource, /setProjectId\(newSessionProjectId\|\|''\)/);
  assert.match(appSource, /setNewWorkProjectId\(selectedProject\.id\)/);
  assert.match(appSource, /newSessionProjectId=\{newWorkProjectId\}/);
});

test('Project workspace Work cards reopen the selected Work session', () => {
  assert.match(appSource, /onClick=\{\(\)=>onOpenWork\(work\.id\)\}/);
  assert.match(appSource, /setActiveWorkSessionId\(workId\)/);
  assert.match(appSource, /requestedSessionId=\{activeWorkSessionId\}/);
});

test('Active Work header identifies its Project', () => {
  assert.match(appSource, /session\.project_id&&<span/);
  assert.match(appSource, /projects\.find\(project=>project\.id===session\.project_id\)\?\.name/);
});
