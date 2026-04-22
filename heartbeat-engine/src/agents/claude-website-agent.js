// ═══════════════════════════════════════════════════════════════════════════
// Claude Managed Website Builder Agent
//
// Uses Anthropic's agentic tool-use loop to build websites via GHL end-to-end.
// If Claude cannot complete the task, throws { useFallback: true } so the
// calling code can fall back to the existing EnhancedToolExecutor harness.
//
// Usage:
//   import { runWebsiteTask } from './agents/claude-website-agent.js';
//   const result = await runWebsiteTask(task, context);
// ═══════════════════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../logging/logger.js';
import { executeGHLTool } from '../tools/ghl-tools.js';

const logger = createLogger('claude-website-agent');

const MAX_TURNS = 25; // max agentic turns before fallback

// ── GHL Website Builder tools exposed to Claude ──────────────────────────────
// Subset of ghl-tools.js focused on website/funnel/blog building
const WEBSITE_TOOLS = [
  {
    name: 'ghl_get_sites',
    description: 'List all websites and funnels in GoHighLevel for the location',
    input_schema: {
      type: 'object',
      properties: {
        locationId: { type: 'string', description: 'GHL location ID (defaults to env var)' },
        skip: { type: 'number', description: 'Pagination offset' },
        limit: { type: 'number', description: 'Max results (default 20)' }
      },
      required: []
    }
  },
  {
    name: 'ghl_create_site',
    description: 'Create a new website or funnel in GoHighLevel',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Website/funnel name' },
        type: { type: 'string', enum: ['website', 'funnel'], description: 'Type of site' },
        locationId: { type: 'string', description: 'GHL location ID' }
      },
      required: ['name']
    }
  },
  {
    name: 'ghl_update_site',
    description: 'Update an existing website or funnel',
    input_schema: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'ID of the site to update' },
        name: { type: 'string', description: 'New name for the site' },
        favicon: { type: 'string', description: 'Favicon URL' }
      },
      required: ['siteId']
    }
  },
  {
    name: 'ghl_get_pages',
    description: 'List all pages for a website or funnel',
    input_schema: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Website/funnel ID' },
        locationId: { type: 'string', description: 'GHL location ID' }
      },
      required: ['siteId']
    }
  },
  {
    name: 'ghl_create_page',
    description: 'Create a new page on a website or funnel',
    input_schema: {
      type: 'object',
      properties: {
        siteId: { type: 'string', description: 'Website/funnel ID' },
        name: { type: 'string', description: 'Page name' },
        path: { type: 'string', description: 'URL path (e.g. /about)' },
        title: { type: 'string', description: 'SEO page title' },
        description: { type: 'string', description: 'SEO meta description' }
      },
      required: ['siteId', 'name']
    }
  },
  {
    name: 'ghl_update_page',
    description: 'Update an existing page content, SEO, or settings',
    input_schema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID to update' },
        siteId: { type: 'string', description: 'Parent site ID' },
        name: { type: 'string', description: 'Page name' },
        path: { type: 'string', description: 'URL path' },
        title: { type: 'string', description: 'SEO page title' },
        description: { type: 'string', description: 'SEO meta description' },
        keywords: { type: 'string', description: 'SEO keywords' }
      },
      required: ['pageId']
    }
  },
  {
    name: 'ghl_publish_page',
    description: 'Publish or unpublish a page to make it live',
    input_schema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID' },
        siteId: { type: 'string', description: 'Site ID' }
      },
      required: ['pageId', 'siteId']
    }
  },
  {
    name: 'ghl_create_blog_post',
    description: 'Create a new blog post in GoHighLevel',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Blog post title' },
        rawHTML: { type: 'string', description: 'HTML content of the blog post' },
        status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'], description: 'Publication status' },
        blogId: { type: 'string', description: 'Blog ID (defaults to env var)' },
        locationId: { type: 'string', description: 'GHL location ID' },
        imageUrl: { type: 'string', description: 'Featured image URL' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Category IDs' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tag strings' },
        metaData: {
          type: 'object',
          description: 'SEO metadata',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' }
          }
        }
      },
      required: ['title', 'rawHTML']
    }
  },
  {
    name: 'ghl_update_blog_post',
    description: 'Update an existing blog post',
    input_schema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'Blog post ID' },
        title: { type: 'string', description: 'Updated title' },
        rawHTML: { type: 'string', description: 'Updated HTML content' },
        status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'] },
        imageUrl: { type: 'string', description: 'Featured image URL' }
      },
      required: ['postId']
    }
  },
  {
    name: 'ghl_get_blog_posts',
    description: 'List blog posts for a blog',
    input_schema: {
      type: 'object',
      properties: {
        blogId: { type: 'string', description: 'Blog ID (defaults to env var GHL_BLOG_ID)' },
        locationId: { type: 'string', description: 'GHL location ID' },
        limit: { type: 'number', description: 'Max posts to return' },
        skip: { type: 'number', description: 'Pagination offset' }
      },
      required: []
    }
  },
  {
    name: 'ghl_get_blog_categories',
    description: 'List blog categories',
    input_schema: {
      type: 'object',
      properties: {
        blogId: { type: 'string', description: 'Blog ID' },
        locationId: { type: 'string', description: 'GHL location ID' }
      },
      required: []
    }
  },
  {
    name: 'ghl_web_search',
    description: 'Search the web for research and content inspiration',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Number of results (default 5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'ghl_get_contact',
    description: 'Look up a GHL contact by email or phone',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email' },
        locationId: { type: 'string', description: 'GHL location ID' }
      },
      required: []
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// ClaudeWebsiteAgent — agentic loop powered by claude-sonnet-4-6
// ═══════════════════════════════════════════════════════════════════════════

export class ClaudeWebsiteAgent {
  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.WEBSITE_AGENT_MODEL || 'claude-sonnet-4-6';
    this.agentId = process.env.AGENT_ID || 'bloomie-sarah-rodriguez';
  }

  /**
   * Build or update a website/page/blog using GHL tools.
   * @param {string} task - Natural language description of what to build
   * @param {object} context - Optional extra context (orgId, clientName, etc.)
   * @returns {{ success: boolean, result: string, turns: number, toolsUsed: string[] }}
   */
  async buildWebsite(task, context = {}) {
    const startTime = Date.now();
    const toolsUsed = [];

    logger.info('Claude website agent starting', {
      model: this.model,
      task: task.substring(0, 120),
      context: Object.keys(context)
    });

    const systemPrompt = `You are Sarah Rodriguez, Content & Digital Marketing Executive at Bloomie Staffing.
You are a skilled autonomous website builder. When given a website task, you use GoHighLevel (GHL) tools to complete it end-to-end without asking for clarification.

Your approach:
1. Understand what needs to be built/updated
2. Check existing sites/pages if relevant
3. Create or update content using GHL tools
4. Publish when appropriate
5. Confirm completion with a brief summary

GHL Configuration:
- Location ID: ${process.env.GHL_LOCATION_ID || 'iGy4nrpDVU0W1jAvseL3'}
- Blog ID: ${process.env.GHL_BLOG_ID || 'DHQrtpkQ3Cp7c96FCyDu'}
- Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
${context.clientName ? `- Client: ${context.clientName}` : ''}
${context.notes ? `- Notes: ${context.notes}` : ''}

Complete the task fully. Be decisive — pick the best approach and execute it.`;

    const messages = [{ role: 'user', content: task }];

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: WEBSITE_TOOLS,
        messages
      });

      logger.info(`Claude website agent turn ${turn}`, {
        stopReason: response.stop_reason,
        contentBlocks: response.content.length
      });

      // Add assistant message to history
      messages.push({ role: 'assistant', content: response.content });

      // ── Task complete ──
      if (response.stop_reason === 'end_turn') {
        const textResult = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();

        const duration = Date.now() - startTime;
        logger.info('Claude website agent COMPLETED', {
          turns: turn,
          toolsUsed: toolsUsed.length,
          durationMs: duration
        });

        return {
          success: true,
          result: textResult || 'Website task completed successfully.',
          turns: turn,
          toolsUsed,
          durationMs: duration
        };
      }

      // ── Tool use ──
      if (response.stop_reason === 'tool_use') {
        const toolResultBlocks = [];

        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;

          logger.info('Claude website agent calling tool', {
            tool: block.name,
            inputKeys: Object.keys(block.input || {})
          });

          toolsUsed.push(block.name);

          try {
            const toolResult = await executeGHLTool(block.name, {
              ...block.input,
              // Inject defaults if not provided
              locationId: block.input.locationId || process.env.GHL_LOCATION_ID,
              blogId: block.input.blogId || process.env.GHL_BLOG_ID
            });

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(toolResult)
            });
          } catch (toolErr) {
            logger.warn('Claude website agent tool error', {
              tool: block.name,
              error: toolErr.message
            });
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error executing ${block.name}: ${toolErr.message}`,
              is_error: true
            });
          }
        }

        messages.push({ role: 'user', content: toolResultBlocks });
        continue;
      }

      // Unexpected stop reason
      logger.warn('Claude website agent unexpected stop', { stopReason: response.stop_reason, turn });
      break;
    }

    // Exceeded max turns — throw so caller can fall back
    const err = new Error(`Claude website agent exceeded ${MAX_TURNS} turns without completing task`);
    err.useFallback = true;
    err.toolsUsed = toolsUsed;
    throw err;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
let _agentInstance = null;

function getWebsiteAgent() {
  if (!_agentInstance) {
    _agentInstance = new ClaudeWebsiteAgent();
  }
  return _agentInstance;
}

// ═══════════════════════════════════════════════════════════════════════════
// runWebsiteTask — primary entry point
//
// Tries Claude managed agent first. If it fails or ANTHROPIC_API_KEY is
// missing, throws { useFallback: true } so the caller can fall back to
// the existing EnhancedToolExecutor harness.
//
// Example usage in a task handler:
//
//   import { runWebsiteTask } from './agents/claude-website-agent.js';
//   import { enhancedExecutor } from '../tools/enhanced-executor.js';
//
//   try {
//     const result = await runWebsiteTask(task.description, { clientName });
//     return { status: 'completed', result: result.result, via: 'claude-agent' };
//   } catch (err) {
//     if (err.useFallback) {
//       // Fall back to existing harness
//       return await enhancedExecutor.executeTool('ghl_website_builder', params);
//     }
//     throw err;
//   }
// ═══════════════════════════════════════════════════════════════════════════

export async function runWebsiteTask(task, context = {}) {
  // Check: no API key → skip Claude agent, go straight to harness
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set — skipping Claude website agent, using harness');
    const err = new Error('ANTHROPIC_API_KEY not configured');
    err.useFallback = true;
    throw err;
  }

  try {
    const agent = getWebsiteAgent();
    return await agent.buildWebsite(task, context);
  } catch (error) {
    // Re-throw with fallback flag if not already set
    if (!error.useFallback) {
      logger.warn('Claude website agent failed (non-turn-limit error)', { error: error.message });
      error.useFallback = true;
    }
    throw error;
  }
}

export default ClaudeWebsiteAgent;
