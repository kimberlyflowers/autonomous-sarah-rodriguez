const ENGINEERING_PATTERN = /\b(repository|repo|github|vercel|codebase|branch|pull request|deployment|deploy|build error|test failure|existing (?:site|website|app)|(?:edit|fix|change|update|replace|modify) (?:the|my|our|this|a|an)?\s*(?:site|website|app|webpage|page)|(?:edit|fix|change|update|replace|modify)\b[^.\n]{0,100}\b(?:on|in|for)\b[^.\n]{0,80}\b(?:site|website|app|webpage)|(?:https?:\/\/|www\.)[^\s]+)\b/i;

const ENGINEERING_TOOL_NAMES = new Set([
  'task_progress', 'bloom_clarify', 'model_status',
  'web_search', 'web_fetch', 'browser_task', 'browser_screenshot',
  'image_generate', 'image_edit', 'generate_images_parallel',
  'get_session_files', 'list_ai_images',
]);

const ENGINEERING_TOOL_PREFIXES = [
  'coding_workspace_', 'github_', 'vercel_', 'hyperframes_',
  'bloom_browser_',
];

export function isEngineeringTask(instruction = '') {
  return ENGINEERING_PATTERN.test(String(instruction || ''));
}

export function selectExecutionModel({
  requestedModel,
  instruction = '',
  openRouterAvailable = false,
  codingModel = 'google/gemini-2.5-flash',
} = {}) {
  if (!openRouterAvailable || !isEngineeringTask(instruction)) return requestedModel;
  return codingModel || requestedModel;
}

export function selectTaskTools(tools = [], instruction = '') {
  if (!isEngineeringTask(instruction)) return tools;
  return tools.filter(tool =>
    ENGINEERING_TOOL_NAMES.has(tool.name) ||
    ENGINEERING_TOOL_PREFIXES.some(prefix => tool.name.startsWith(prefix))
  );
}

export function compactToolResultForContext(value, {
  maxStringLength = 12000,
  maxArrayLength = 80,
  maxDepth = 8,
} = {}, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (/^data:(?:image|video|audio)\//i.test(value)) {
      return '[Binary media omitted; use the accompanying URL or metadata]';
    }
    return value.length > maxStringLength
      ? `${value.slice(0, maxStringLength)}\n...[tool result truncated for context efficiency]`
      : value;
  }
  if (depth >= maxDepth) return '[Nested tool result omitted]';
  if (Array.isArray(value)) {
    const compacted = value.slice(0, maxArrayLength)
      .map(item => compactToolResultForContext(item, { maxStringLength, maxArrayLength, maxDepth }, depth + 1));
    if (value.length > maxArrayLength) {
      compacted.push(`[${value.length - maxArrayLength} additional items omitted]`);
    }
    return compacted;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      if (/^(?:image|screenshot|video|audio)?_?base64$/i.test(key) || key === 'data_base64') {
        return [key, '[Binary media omitted; capture succeeded]'];
      }
      return [
        key,
        compactToolResultForContext(nested, { maxStringLength, maxArrayLength, maxDepth }, depth + 1),
      ];
    }));
  }
  return String(value);
}
