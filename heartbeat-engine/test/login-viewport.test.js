import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '../dashboard/src/Login.jsx'), 'utf8');

test('desktop login owns one viewport and does not create an inner scrollbar', () => {
  assert.match(source, /data-testid="login-viewport"/);
  assert.match(source, /height:'100dvh'/);
  assert.match(source, /overflow:'hidden'/);
  assert.match(source, /overflowY:isLogin \? 'visible' : 'auto'/);
});

test('long signup remains scrollable without changing login behavior', () => {
  assert.match(source, /maxHeight:isLogin \? '100%' : 'calc\(100dvh - 24px\)'/);
  assert.match(source, /scrollbarGutter:isLogin \? undefined : 'stable'/);
});
