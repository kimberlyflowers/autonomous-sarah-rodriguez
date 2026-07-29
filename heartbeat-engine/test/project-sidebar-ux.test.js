import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
const chatApiSource = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');

test('chat session list exposes project ownership for sidebar folders', () => {
  assert.match(chatApiSource, /\.select\('id, title, created_at, updated_at, agent_id, project_id'\)/);
});

test('sidebar renders Projects above Recent Chats with expandable folders', () => {
  const projectsIndex = appSource.indexOf('>Projects</div>');
  const recentIndex = appSource.indexOf('>Recent Chats</div>');
  assert.ok(projectsIndex > -1, 'Projects section is missing');
  assert.ok(recentIndex > projectsIndex, 'Recent Chats must appear below Projects');
  assert.match(appSource, /expandedProjects\.has\(project\.id\)/);
  assert.match(appSource, /\+ New chat in project/);
});

test('sidebar navigation, Projects, and Recent Chats share one scroll region', () => {
  const fixedHeaderIndex = appSource.indexOf('data-testid="sidebar-sticky-header"');
  const scrollRegionIndex = appSource.indexOf('data-testid="sidebar-scroll-region"');
  assert.ok(fixedHeaderIndex > -1, 'Fixed agent and Search header is missing');
  assert.ok(scrollRegionIndex > fixedHeaderIndex, 'Scroll region must begin below Search');
  assert.match(appSource, /data-testid="sidebar-scroll-region"/);
  assert.match(appSource, /data-testid="sidebar-scroll-region" style=\{\{flex:1,minHeight:0,overflowY:"auto"/);
  assert.match(appSource, /data-testid="sidebar-sticky-header" style=\{\{padding:"12px 14px 8px",borderBottom:"1px solid "\+c\.ln,flexShrink:0/);
  assert.doesNotMatch(
    appSource,
    /Session list - only show on Chat page[\s\S]{0,160}<div style=\{\{flex:1,overflowY:"auto"/
  );
});

test('chat options support moving into and out of a Project without a prompt', () => {
  assert.match(appSource, /s\.project_id\?'Move to project':'Add to project'/);
  assert.match(appSource, /Moved to Recent Chats/);
  assert.doesNotMatch(appSource, /Add this chat to which project/);
});

test('direct Projects routing and persistent mobile navigation are preserved', () => {
  assert.match(appSource, /window\.location\.pathname\.startsWith\("\/projects"\)\?"projects":"chat"/);
  assert.match(appSource, /title="More navigation"/);
  assert.match(appSource, /aria-label="Bloomie navigation"/);
  assert.match(appSource, /\{connected\?"Connected":"Offline"\}/);
  assert.match(appSource, />↗ BLOOM CRM<\/a>/);
});
