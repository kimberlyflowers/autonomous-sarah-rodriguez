import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const login = fs.readFileSync(new URL('../dashboard/src/Login.jsx', import.meta.url), 'utf8');

test('shared Bloomie and Book Creator authentication uses dark mode', () => {
  assert.match(login, /product = 'bloomie'/);
  assert.match(login, /product === 'book_creator'/);
  assert.ok(login.includes("background:'radial-gradient(circle at 50% -10%,#2a2026"));
  assert.match(login, /background:'#18181b'/);
  assert.match(login, /background:'#222225'/);
  assert.match(login, /colorScheme:'dark'/);
  assert.match(login, /const text = '#f5f5f5'/);
});
