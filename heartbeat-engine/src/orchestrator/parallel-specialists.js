export async function runSpecialistsInParallel(tasks = [], execute, { maxTasks = 4 } = {}) {
  if (typeof execute !== 'function') throw new Error('A specialist executor is required');
  const selected = tasks.slice(0, maxTasks);
  if (selected.length < 2) throw new Error('Parallel specialist execution requires at least two independent tasks');

  const startedAt = Date.now();
  const settled = await Promise.allSettled(selected.map((task, index) => execute(task, index)));
  const results = settled.map((result, index) => result.status === 'fulfilled'
    ? { index, taskType: selected[index].taskType, success: true, ...result.value }
    : { index, taskType: selected[index].taskType, success: false, error: result.reason?.message || String(result.reason) });

  return {
    success: results.some(result => result.success),
    status: results.every(result => result.success) ? 'ready' : 'partial',
    terminal: true,
    executionMode: 'parallel',
    durationMs: Date.now() - startedAt,
    results,
  };
}

