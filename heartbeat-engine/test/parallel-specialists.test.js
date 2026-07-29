import test from 'node:test';
import assert from 'node:assert/strict';
import { runSpecialistsInParallel } from '../src/orchestrator/parallel-specialists.js';

test('independent specialist tasks run concurrently and preserve result order', async () => {
  let active = 0;
  let peak = 0;
  const result = await runSpecialistsInParallel([
    { taskType: 'writing', specialistPrompt: 'A' },
    { taskType: 'coding', specialistPrompt: 'B' },
  ], async task => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active -= 1;
    return { output: task.specialistPrompt };
  });

  assert.equal(peak, 2);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.results.map(item => item.output), ['A', 'B']);
});

test('one specialist failure produces a typed partial result, not a false total failure', async () => {
  const result = await runSpecialistsInParallel([
    { taskType: 'writing', specialistPrompt: 'works' },
    { taskType: 'coding', specialistPrompt: 'fails' },
  ], async task => {
    if (task.specialistPrompt === 'fails') throw new Error('model unavailable');
    return { output: 'done' };
  });

  assert.equal(result.success, true);
  assert.equal(result.status, 'partial');
  assert.match(result.results[1].error, /model unavailable/);
});
