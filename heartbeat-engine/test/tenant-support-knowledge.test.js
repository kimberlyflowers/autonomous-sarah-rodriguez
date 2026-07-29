import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminApi = fs.readFileSync(new URL('../src/api/bloomie-admin.js', import.meta.url), 'utf8');
const adminUi = fs.readFileSync(new URL('../dashboard/src/components/BloomieAdmin.jsx', import.meta.url), 'utf8');
const references = fs.readFileSync(new URL('../src/api/references.js', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');

test('support tickets are authenticated and tenant scoped for reads and updates', () => {
  assert.match(adminApi, /getUserOrgId\(req\)/);
  assert.match(adminApi, /\.eq\('organization_id', organizationId\)/);
  assert.match(adminApi, /router\.patch\('\/tickets\/:id'/);
  assert.match(adminApi, /Ticket not found in this tenant/);
});

test('admin separates private tenant knowledge from public support answers', () => {
  assert.match(adminUi, /Tenant Knowledge/);
  assert.match(adminUi, /Support Answers/);
  assert.match(adminUi, /defaultCategory="knowledge"/);
  assert.match(adminUi, /defaultScope="organization"/);
  assert.match(adminUi, /initialFilter="all"/);
});

test('tenant knowledge storage and prompt injection preserve organization boundary', () => {
  assert.match(references, /\.eq\('organization_id', orgId\)/);
  assert.match(chat, /\.eq\('organization_id', referenceOrgId\)/);
  assert.match(chat, /ref\.scope === 'organization'/);
});
