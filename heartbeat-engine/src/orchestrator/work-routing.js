export const WORK_EXECUTION_PATHS = Object.freeze({
  work: 'sarah',
  build: 'sarah-build',
});

export function normalizeWorkType(type = 'work') {
  return type === 'build' ? 'build' : 'work';
}

export function getWorkExecutionPath(type = 'work') {
  return WORK_EXECUTION_PATHS[normalizeWorkType(type)];
}
