import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../src/api/video-studio.js', import.meta.url), 'utf8');

test('Video is a first-class workspace with the Bloomie sidebar removed', () => {
  assert.match(appSource, /function VideoStudioWorkspace/);
  assert.match(appSource, /\{k:"video",l:"Video"\}/);
  assert.match(appSource, /pg!=="book"&&pg!=="video"/);
  assert.match(appSource, /pg==="video"&&\(<VideoStudioWorkspace/);
});

test('Video workspace uses a tenant session bridge and opens characters', () => {
  assert.match(appSource, /bloom-studio-session/);
  assert.match(appSource, /defaultSection:'characters'/);
  assert.match(serverSource, /getUserOrgId\(req\)/);
  assert.match(serverSource, /\/api\/auth\/internal-session/);
  assert.match(serverSource, /BLOOM_STUDIO_API_KEY/);
});
