import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const agentSource = fs.readFileSync(new URL('../src/api/agent.js', import.meta.url), 'utf8');

test('signup resumes only a password-verified partial account', () => {
  assert.match(agentSource, /signInWithPassword/);
  assert.match(agentSource, /Resuming verified partial signup/);
  assert.match(agentSource, /existingMembership\?\.organization_id/);
  assert.match(agentSource, /This account is already set up\. Please sign in\./);
});

test('signup rolls back a newly-created auth user when organization creation fails', () => {
  assert.match(agentSource, /if \(authUserCreated\)/);
  assert.match(agentSource, /from\('users'\)\.delete\(\)\.eq\('id', userId\)/);
  assert.match(agentSource, /auth\.admin\.deleteUser\(userId\)/);
  assert.match(agentSource, /Rolled back auth user after organization creation failure/);
});
