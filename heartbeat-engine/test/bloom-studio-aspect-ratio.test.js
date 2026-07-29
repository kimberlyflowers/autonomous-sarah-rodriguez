import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.join(here, '..', 'src', 'tools', 'bloom-studio-tools.js'),
  'utf8'
);

test('portrait Bloomie references are framed to 16:9 without center cropping the person', () => {
  assert.match(source, /const frameWidth = 1280/);
  assert.match(source, /const frameHeight = 720/);
  assert.match(source, /image\.clone\(\)\.scaleToFit\(frameWidth - 80, frameHeight - 40\)/);
  assert.match(source, /background\.composite\(/);
});

test('native 16:9 Bloomie references bypass the blurred portrait surround', () => {
  assert.match(source, /const isExact16By9 = image\.bitmap\.width \* frameHeight === image\.bitmap\.height \* frameWidth/);
  assert.match(source, /if \(isExact16By9\)/);
  assert.match(source, /normalizedImage = image\.clone\(\)\.resize\(frameWidth, frameHeight\)/);
});
