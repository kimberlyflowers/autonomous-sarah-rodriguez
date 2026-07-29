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

test('Bloom Studio inputs and jobs are scoped to the authenticated organization', () => {
  assert.match(source, /video-inputs\/\$\{organizationId\}\/\$\{crypto\.randomUUID\(\)\}\.mp3/);
  assert.match(source, /tenantSlug: organizationId/);
  assert.match(source, /requestId = `\$\{organizationId\}-\$\{crypto\.randomUUID\(\)\}`/);
});

test('Bloom Studio status checks retain the same organization boundary', () => {
  const statusBlock = source.slice(
    source.indexOf("if (name === 'bloom_studio_check_job')"),
    source.indexOf("if (name === 'bloom_studio_generate_video')")
  );
  assert.match(statusBlock, /pollBloomStudioJob\(params\.requestId, organizationId\)/);
  assert.match(source, /ugc_check_studio_job', \{ requestId, tenantSlug \}/);
});
