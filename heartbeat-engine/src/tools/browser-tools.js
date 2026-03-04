// Browser Automation Tools for Sarah Rodriguez
// Connects to the browser-use sidecar service for AI-driven web interactions

import { createLogger } from '../logging/logger.js';

const logger = createLogger('browser-tools');

const BROWSER_AGENT_URL = process.env.BROWSER_AGENT_URL || 'http://sweet-nature.railway.internal:8080';
const BROWSER_AGENT_SECRET = process.env.BROWSER_AGENT_SECRET || '';

/**
 * Browser tool definitions — exposed to Claude as available tools
 */
export const browserToolDefinitions = {
  browser_task: {
    name: "browser_task",
    description: "Execute an AI-driven browser automation task. The browser agent can navigate websites, click buttons, fill forms, extract data, read page content, handle popups, and interact with web applications intelligently. Use this for any task requiring real browser interaction — logging into platforms, filling out forms, scraping data from pages, or automating web workflows.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Natural language description of what to accomplish in the browser. Be specific about what to click, fill, or extract."
        },
        url: {
          type: "string",
          description: "Starting URL to navigate to (optional — the agent can navigate on its own)"
        },
        max_steps: {
          type: "integer",
          description: "Maximum number of steps the browser agent can take (default 25, max 100)",
          default: 25
        }
      },
      required: ["task"]
    },
    category: "browser",
    operation: "write"
  },

  browser_screenshot: {
    name: "browser_screenshot",
    description: "Take a screenshot of a web page. Returns a base64-encoded PNG image. Useful for verifying page state, capturing visual content, or documenting web pages.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "URL of the page to screenshot"
        }
      },
      required: ["url"]
    },
    category: "browser",
    operation: "read"
  }
};

/**
 * Browser tool executors
 */
export const browserToolExecutors = {
  browser_task: async (params) => {
    try {
      logger.info('Executing browser task', {
        task: params.task.substring(0, 100),
        url: params.url || 'none',
        maxSteps: params.max_steps || 25
      });

      const response = await fetch(`${BROWSER_AGENT_URL}/browse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: params.task,
          url: params.url || undefined,
          max_steps: params.max_steps || 25,
          secret: BROWSER_AGENT_SECRET,
        }),
      });

      if (!response.ok) {
        throw new Error(`Browser agent returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      logger.info('Browser task completed', {
        success: data.success,
        steps: data.steps_taken,
        duration: data.duration_ms,
        finalUrl: data.url_final
      });

      if (data.success) {
        // Push screenshot to dashboard Screen Viewer (now included in browse response)
        try {
          if (data.screenshot_base64) {
            const { getBrowserService } = await import('../browser/browser-service.js');
            const browserSvc = getBrowserService();
            browserSvc.isRunning = true;
            browserSvc.currentUrl = data.url_final;
            browserSvc.lastScreenshot = data.screenshot_base64;
            browserSvc.lastScreenshotTime = Date.now();
            browserSvc.emit('screenshot', {
              data: data.screenshot_base64,
              url: data.url_final,
              timestamp: Date.now()
            });
            logger.info('Pushed screenshot to dashboard', { url: data.url_final });
          }
        } catch (ssErr) {
          logger.warn('Could not push screenshot to dashboard:', ssErr.message);
        }

        return {
          success: true,
          requested_url: params.url || 'none',
          result: data.result,
          steps_taken: data.steps_taken,
          duration_ms: data.duration_ms,
          url_final: data.url_final,
          message: `Browser navigated to ${params.url || 'requested page'}. Final URL: ${data.url_final}. Result: ${data.result}`
        };
      } else {
        return {
          success: false,
          error: data.error,
          duration_ms: data.duration_ms,
          message: `Browser task failed: ${data.error}`
        };
      }

    } catch (error) {
      logger.error('Browser task execution failed:', error);
      return {
        success: false,
        error: error.message,
        message: `Browser task failed: ${error.message}`
      };
    }
  },

  browser_screenshot: async (params) => {
    try {
      logger.info('Taking screenshot', { url: params.url });

      const response = await fetch(`${BROWSER_AGENT_URL}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: params.url,
          secret: BROWSER_AGENT_SECRET,
        }),
      });

      if (!response.ok) {
        throw new Error(`Browser agent returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        // Push to dashboard Screen Viewer
        try {
          const { getBrowserService } = await import('../browser/browser-service.js');
          const browserSvc = getBrowserService();
          browserSvc.isRunning = true;
          browserSvc.currentUrl = params.url;
          browserSvc.lastScreenshot = data.screenshot_base64;
          browserSvc.lastScreenshotTime = Date.now();
          browserSvc.emit('screenshot', {
            data: data.screenshot_base64,
            url: params.url,
            timestamp: Date.now()
          });
        } catch (e) { /* non-critical */ }

        return {
          success: true,
          screenshot_base64: data.screenshot_base64,
          message: `Screenshot captured for ${params.url}`
        };
      } else {
        return {
          success: false,
          error: data.error,
          message: `Screenshot failed: ${data.error}`
        };
      }

    } catch (error) {
      logger.error('Screenshot failed:', error);
      return {
        success: false,
        error: error.message,
        message: `Screenshot failed: ${error.message}`
      };
    }
  }
};

/**
 * Execute browser tool by name
 */
export async function executeBrowserTool(toolName, parameters) {
  const startTime = Date.now();
  logger.info(`Executing browser tool: ${toolName}`, parameters);

  if (!browserToolExecutors[toolName]) {
    throw new Error(`Unknown browser tool: ${toolName}`);
  }

  try {
    const result = await browserToolExecutors[toolName](parameters);
    const duration = Date.now() - startTime;

    logger.info(`Browser tool completed: ${toolName} (${duration}ms)`);

    return {
      ...result,
      executionTime: duration,
      tool: toolName
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`Browser tool failed: ${toolName} (${duration}ms)`, error.message);

    return {
      success: false,
      error: error.message,
      executionTime: duration,
      tool: toolName
    };
  }
}
