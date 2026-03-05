// Web Search Tool for BLOOM Bloomie Agents
// Model-agnostic — works with any LLM provider
// Uses Brave Search API (free tier: 2,000 queries/month)
// Fallback: browser_task Google search if no API key configured

import { createLogger } from '../logging/logger.js';

const logger = createLogger('web-search');

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || '';
const BRAVE_BASE_URL = 'https://api.search.brave.com/res/v1';

/**
 * Web search tool definitions
 */
export const webSearchToolDefinitions = {
  web_search: {
    name: "web_search",
    description: "Search the web for current information. Returns relevant results with titles, URLs, and descriptions. Use this to research topics, find current news, look up facts, verify information, or find resources. Always use this when you need information that might have changed since your training data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query — be specific and concise for best results"
        },
        count: {
          type: "integer",
          description: "Number of results to return (default 5, max 20)",
          default: 5
        }
      },
      required: ["query"]
    },
    category: "web",
    operation: "read"
  },

  web_fetch: {
    name: "web_fetch",
    description: "Fetch and extract the text content from a specific URL. Use this to read articles, documentation, or any web page. Returns the visible text content of the page.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch content from"
        }
      },
      required: ["url"]
    },
    category: "web",
    operation: "read"
  }
};

/**
 * Web search executors
 */
export const webSearchToolExecutors = {
  web_search: async (params) => {
    const query = params.query;
    const count = Math.min(params.count || 5, 20);

    // Try Brave Search API first
    if (BRAVE_API_KEY) {
      return await braveSearch(query, count);
    }

    // Fallback: DuckDuckGo HTML lite (no API key needed, no browser needed)
    try {
      return await duckDuckGoSearch(query, count);
    } catch(e) {
      logger.warn('DuckDuckGo fallback failed, trying browser', { error: e.message });
    }

    // Last resort: use browser_task to search Google
    return await browserFallbackSearch(query, count);
  },

  web_fetch: async (params) => {
    const url = params.url;

    // Try direct fetch first
    try {
      return await directFetch(url);
    } catch (e) {
      // Fallback: use browser_task
      return await browserFallbackFetch(url);
    }
  }
};

/**
 * Brave Search API
 */
async function braveSearch(query, count) {
  try {
    logger.info('Brave search', { query, count });

    const url = `${BRAVE_BASE_URL}/web/search?q=${encodeURIComponent(query)}&count=${count}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status}`);
    }

    const data = await response.json();
    const results = (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description,
      age: r.age || null,
    }));

    logger.info('Brave search completed', { query, resultCount: results.length });

    return {
      success: true,
      query,
      results,
      resultCount: results.length,
      source: 'brave',
      message: results.length > 0
        ? `Found ${results.length} results for "${query}"`
        : `No results found for "${query}"`,
    };

  } catch (error) {
    logger.error('Brave search failed:', error);
    // Fall back to browser search
    return await browserFallbackSearch(query, count);
  }
}

/**
 * Direct URL fetch with text extraction
 */
async function directFetch(url) {
  logger.info('Direct fetch', { url });

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`);
  }

  const html = await response.text();

  // Basic HTML → text extraction (strip tags, scripts, styles)
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000); // Limit to ~10k chars

  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  return {
    success: true,
    url,
    title,
    content: text,
    contentLength: text.length,
    source: 'direct_fetch',
    message: `Fetched ${url} — ${text.length} characters`,
  };
}

/**
 * Fallback: use browser_task to search Google
 */
/**
 * DuckDuckGo HTML lite search — no API key needed, no browser needed
 */
async function duckDuckGoSearch(query, count) {
  logger.info('DuckDuckGo search (no API key fallback)', { query });
  
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BLOOM-Agent/1.0)',
    },
    signal: AbortSignal.timeout(10000), // 10 second timeout
  });

  if (!response.ok) throw new Error(`DuckDuckGo error: ${response.status}`);

  const html = await response.text();
  
  // Parse results from DDG HTML lite
  const results = [];
  const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([^<]*(?:<b>[^<]*<\/b>[^<]*)*)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < count) {
    const resultUrl = match[1].startsWith('//') ? 'https:' + match[1] : match[1];
    // Extract actual URL from DDG redirect
    const actualUrl = resultUrl.includes('uddg=') 
      ? decodeURIComponent(resultUrl.split('uddg=')[1]?.split('&')[0] || resultUrl)
      : resultUrl;
    results.push({
      title: match[2].replace(/<\/?b>/g, '').trim(),
      url: actualUrl,
      description: match[3].replace(/<\/?b>/g, '').replace(/<[^>]+>/g, '').trim(),
    });
  }

  if (results.length === 0) {
    throw new Error('No results parsed from DuckDuckGo');
  }

  logger.info('DuckDuckGo search completed', { query, resultCount: results.length });
  return { success: true, query, results };
}

async function browserFallbackSearch(query, count) {
  try {
    const BROWSER_AGENT_URL = process.env.BROWSER_AGENT_URL;
    const BROWSER_AGENT_SECRET = process.env.BROWSER_AGENT_SECRET;

    if (!BROWSER_AGENT_URL) {
      return {
        success: false,
        error: 'No search API configured and no browser agent available',
        message: 'Web search unavailable — configure BRAVE_SEARCH_API_KEY or BROWSER_AGENT_URL',
      };
    }

    logger.info('Browser fallback search', { query });

    const response = await fetch(`${BROWSER_AGENT_URL}/browse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: `Search Google for "${query}" and extract the top ${count} result titles, URLs, and descriptions. Return them as a structured list.`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        max_steps: 10,
        secret: BROWSER_AGENT_SECRET,
      }),
    });

    const data = await response.json();

    return {
      success: data.success,
      query,
      results: [], // Browser agent returns unstructured text
      rawResult: data.result,
      source: 'browser_fallback',
      message: data.success ? data.result : `Browser search failed: ${data.error}`,
    };

  } catch (error) {
    logger.error('Browser fallback search failed:', error);
    return {
      success: false,
      error: error.message,
      message: `Web search failed: ${error.message}`,
    };
  }
}

/**
 * Fallback: use browser_task to fetch a URL
 */
async function browserFallbackFetch(url) {
  try {
    const BROWSER_AGENT_URL = process.env.BROWSER_AGENT_URL;
    const BROWSER_AGENT_SECRET = process.env.BROWSER_AGENT_SECRET;

    if (!BROWSER_AGENT_URL) {
      return {
        success: false,
        error: 'Direct fetch failed and no browser agent available',
      };
    }

    const response = await fetch(`${BROWSER_AGENT_URL}/browse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: `Navigate to this URL and extract all the visible text content from the page. Return the main content.`,
        url,
        max_steps: 5,
        secret: BROWSER_AGENT_SECRET,
      }),
    });

    const data = await response.json();

    return {
      success: data.success,
      url,
      content: data.result,
      source: 'browser_fallback',
      message: data.success ? `Fetched via browser: ${url}` : `Fetch failed: ${data.error}`,
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute web search tool by name
 */
export async function executeWebSearchTool(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing web tool: ${toolName}`, parameters);

  if (!webSearchToolExecutors[toolName]) {
    throw new Error(`Unknown web tool: ${toolName}`);
  }

  try {
    const result = await webSearchToolExecutors[toolName](parameters);
    const duration = Date.now() - startTime;

    logger.info(`Web tool completed: ${toolName} (${duration}ms)`);
    return { ...result, executionTime: duration, tool: toolName };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Web tool failed: ${toolName} (${duration}ms)`, error.message);
    return { success: false, error: error.message, executionTime: duration, tool: toolName };
  }
}
