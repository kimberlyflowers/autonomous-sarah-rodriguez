import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../dashboard/src/MobileApp.jsx', import.meta.url), 'utf8');

test('choosing New Work is not overwritten by background session refresh', () => {
  assert.match(source, /workSelectionInitializedRef = useRef\(false\)/);
  assert.match(source, /if \(!workSelectionInitializedRef\.current\)/);
  assert.match(source, /setWorkActiveId\(null\);setWorkDetail\(null\);setWorkError\(''\)/);
});

test('new Work submission selects the returned session and exposes request errors', () => {
  assert.match(source, /const nextWorkId = d\.build\?\.id \|\| workActiveId/);
  assert.match(source, /if \(!r\.ok\) throw new Error/);
  assert.match(source, /setWorkInput\(message\)/);
  assert.match(source, /role="alert"/);
});
