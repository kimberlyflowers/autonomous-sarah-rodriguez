import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBloomStudioJob } from '../src/tools/bloom-studio-tools.js';

test('pending Bloom Studio jobs remain non-terminal and retain the request ID', () => {
  const result = normalizeBloomStudioJob({ status: 'IN_QUEUE' }, 'tenant-job-1');
  assert.equal(result.status, 'pending');
  assert.equal(result.pending, true);
  assert.equal(result.terminal, false);
  assert.equal(result.requestId, 'tenant-job-1');
});

test('completed Bloom Studio jobs surface the playable video URL', () => {
  const url = 'https://video.example/api/public/video/tenant/render-id';
  const result = normalizeBloomStudioJob({
    status: 'COMPLETED',
    output: { videoUrl: url },
  }, 'tenant-job-2');
  assert.equal(result.status, 'ready');
  assert.equal(result.terminal, true);
  assert.equal(result.videoUrl, url);
});

test('failed Bloom Studio jobs preserve exact provider evidence', () => {
  const result = normalizeBloomStudioJob({
    status: 'FAILED',
    error: 'GPU worker rejected the input',
  }, 'tenant-job-3');
  assert.equal(result.status, 'failed');
  assert.equal(result.terminal, true);
  assert.equal(result.error, 'GPU worker rejected the input');
});
