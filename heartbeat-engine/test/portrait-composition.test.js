import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const imageTools = fs.readFileSync(path.join(here, '..', 'src', 'tools', 'image-tools.js'), 'utf8');
const chat = fs.readFileSync(path.join(here, '..', 'src', 'api', 'chat.js'), 'utf8');

test('generated images preserve composition unless cropping is explicitly requested', () => {
  assert.match(imageTools, /parameters\.allow_crop === true/);
  assert.match(imageTools, /image\.contain\(tw, th\)/);
  assert.match(imageTools, /composition_preserved/);
  assert.match(imageTools, /Provider returned a different aspect ratio; the full composition was fitted/);
});

test('Gemini receives the requested native aspect ratio and skips matching-ratio crops', () => {
  assert.match(imageTools, /nativeAspectRatio/);
  assert.match(imageTools, /requestedAspectRatio/);
  assert.match(imageTools, /aspectRatio: aspectRatio/);
  assert.match(imageTools, /Native aspect ratio already matches: resize only, never crop/);
  assert.match(imageTools, /aspect_ratio: requestedAspectRatio \|\| sizeToAspectRatio\(size\)/);
  assert.match(chat, /Never set allow_crop unless the user explicitly asks to crop/);
});

test('self-image repair uses the previous generated scene as its reference', () => {
  assert.match(chat, /isPortraitCompositionRepair/);
  assert.match(chat, /Using previous generated portrait as composition-repair reference/);
  assert.match(chat, /at least 12% of the frame above the highest hair/);
});
