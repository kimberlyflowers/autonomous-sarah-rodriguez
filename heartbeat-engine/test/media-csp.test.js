import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'src', 'index.js'), 'utf8');

test('chat permits HTTPS media from connected rendering services', () => {
  assert.match(source, /mediaSrc:\s*\[[^\]]*"https:"/);
});
