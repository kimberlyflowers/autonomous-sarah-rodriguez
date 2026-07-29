import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrowserBlockEvidence } from '../src/tools/browser-tools.js';

test('Google sorry pages are recognized as terminal anti-bot evidence', () => {
  const evidence = getBrowserBlockEvidence({
    url_final: 'https://www.google.com/sorry/index?continue=https://www.ubereats.com/',
    result: 'Navigation stopped.',
  });

  assert.match(evidence, /anti-bot challenge/i);
});

test('ordinary Uber Eats result pages are not marked blocked', () => {
  const evidence = getBrowserBlockEvidence({
    url_final: 'https://www.ubereats.com/search?q=lunch',
    result: 'Found nearby lunch options.',
  });

  assert.equal(evidence, null);
});
