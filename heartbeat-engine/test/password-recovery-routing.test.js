import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '../dashboard/src/main.jsx'), 'utf8');
const app = fs.readFileSync(path.join(here, '../dashboard/src/App.jsx'), 'utf8');
const login = fs.readFileSync(path.join(here, '../dashboard/src/Login.jsx'), 'utf8');
const reset = fs.readFileSync(path.join(here, '../dashboard/src/PasswordReset.jsx'), 'utf8');

test('Supabase recovery events are preserved when the authenticated app mounts', () => {
  assert.match(main, /event === 'PASSWORD_RECOVERY'/);
  assert.match(main, /passwordRecovery=\{passwordRecovery\}/);
});

test('recovery sessions open the real password change panel automatically', () => {
  assert.match(app, /passwordRecovery.*return "settings"/s);
  assert.match(app, /data-testid="password-change-panel"/);
  assert.match(app, /Choose a new password to finish recovering your account/);
});

test('forgot-password emails target the dedicated reset route', () => {
  assert.match(login, /window\.location\.origin \+ '\/reset-password'/);
  assert.match(main, /window\.location\.pathname === '\/reset-password'/);
  assert.match(main, /<PasswordReset user=\{user\} \/>/);
});

test('dedicated reset page validates and updates the Supabase password', () => {
  assert.match(reset, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(reset, /Password must be at least 8 characters/);
  assert.match(reset, /Passwords do not match/);
  assert.match(reset, /Password updated/);
});
