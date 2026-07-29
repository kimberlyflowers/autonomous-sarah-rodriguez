import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableWorkQueue } from '../src/orchestrator/durable-work-queue.js';

test('serializes steering messages for the same Work session', async () => {
  const events = [];
  const queue = new DurableWorkQueue({
    execute: async (_build, instruction) => {
      events.push(`start:${instruction}`);
      await new Promise(resolve => setTimeout(resolve, 10));
      events.push(`end:${instruction}`);
    },
  });

  await Promise.all([
    queue.enqueue({ id: 'build-1' }, 'first'),
    queue.enqueue({ id: 'build-1' }, 'second'),
  ]);

  assert.deepEqual(events, ['start:first', 'end:first', 'start:second', 'end:second']);
  assert.equal(queue.isActive('build-1'), false);
});

test('startup recovery re-enqueues unfinished durable records once', async () => {
  const executed = [];
  const queue = new DurableWorkQueue({
    execute: async (build, instruction, context) => {
      executed.push({ id: build.id, instruction, recovered: context.recovered });
    },
  });

  const recovered = await queue.recover(async () => [
    { id: 'queued-1', brief: 'resume queued work' },
    { id: 'building-1', brief: 'resume interrupted work' },
  ], build => ({ orgId: build.org_id }));
  await Promise.all([...queue.chains.values()]);

  assert.deepEqual(recovered, ['queued-1', 'building-1']);
  assert.deepEqual(executed, [
    { id: 'queued-1', instruction: 'resume queued work', recovered: true },
    { id: 'building-1', instruction: 'resume interrupted work', recovered: true },
  ]);
});

test('a failed execution runs the durable error handler and releases the build', async () => {
  const errors = [];
  const queue = new DurableWorkQueue({
    execute: async () => {
      throw new Error('provider unavailable');
    },
    onError: async (error, build) => errors.push(`${build.id}:${error.message}`),
  });

  await assert.rejects(queue.enqueue({ id: 'build-2' }, 'work'), /provider unavailable/);
  assert.deepEqual(errors, ['build-2:provider unavailable']);
  assert.equal(queue.isActive('build-2'), false);
});
