// Advanced Context Management System for Sarah Rodriguez
// Handles conversation memory, context compression, and multi-turn optimization

import { createLogger } from '../logging/logger.js';
import { executeInternalTool } from '../tools/internal-tools.js';
import { getAnthropicClient } from '../api/chat.js';

const logger = createLogger('context-manager');

/**
 * Context Management System
 * Handles conversation memory, context compression, and optimization
 */
export class ContextManager {
  constructor(agentId = 'bloomie-sarah-rodriguez') {
    this.agentId = agentId;
    this.maxContextLength = 100000; // Token limit for context
    this.compressionThreshold = 80000; // Compress at ~80% (Claude Code wU2 triggers at ~92%)
    this.conversationMemory = [];
    this.workingContext = new Map();
    this.contextPriority = {
      'system_critical': 10,
      'current_task': 9,
      'recent_actions': 8,
      'user_preferences': 7,
      'workflow_state': 6,
      'historical_context': 5,
      'background_info': 4,
      'reference_data': 3,
      'cached_results': 2,
      'metadata': 1
    };
  }

  /**
   * Add new conversation turn to context
   */
  async addConversationTurn(role, content, metadata = {}) {
    const turn = {
      role,
      content,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        id: `turn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        priority: this.contextPriority[metadata.type] || 5,
        tokens: this.estimateTokenCount(content)
      }
    };

    this.conversationMemory.push(turn);

    // Check if compression is needed
    const totalTokens = this.calculateTotalTokens();
    if (totalTokens > this.compressionThreshold) {
      await this.compressContext();
    }

    logger.debug('Added conversation turn', {
      role,
      tokens: turn.metadata.tokens,
      totalTokens: this.calculateTotalTokens(),
      memorySize: this.conversationMemory.length
    });

    return turn.metadata.id;
  }

  /**
   * Get optimized conversation history for model
   */
  getOptimizedHistory(maxTokens = null, includeSystemPrompt = true) {
    const targetTokens = maxTokens || this.maxContextLength;
    let selectedTurns = [];
    let currentTokens = 0;

    // Sort by priority and recency
    const prioritizedTurns = [...this.conversationMemory]
      .sort((a, b) => {
        // First by priority, then by recency
        if (a.metadata.priority !== b.metadata.priority) {
          return b.metadata.priority - a.metadata.priority;
        }
        return new Date(b.metadata.timestamp) - new Date(a.metadata.timestamp);
      });

    // Always include system messages and recent critical turns
    const criticalTurns = prioritizedTurns.filter(turn =>
      turn.role === 'system' ||
      turn.metadata.priority >= 8 ||
      (Date.now() - new Date(turn.metadata.timestamp).getTime()) < 300000 // Last 5 minutes
    );

    for (const turn of criticalTurns) {
      if (currentTokens + turn.metadata.tokens <= targetTokens) {
        selectedTurns.push(turn);
        currentTokens += turn.metadata.tokens;
      }
    }

    // Fill remaining space with other turns by priority
    const remainingTurns = prioritizedTurns.filter(turn => !criticalTurns.includes(turn));
    for (const turn of remainingTurns) {
      if (currentTokens + turn.metadata.tokens <= targetTokens) {
        selectedTurns.push(turn);
        currentTokens += turn.metadata.tokens;
      } else {
        break;
      }
    }

    // Sort final selection by timestamp for proper conversation order
    selectedTurns.sort((a, b) => new Date(a.metadata.timestamp) - new Date(b.metadata.timestamp));

    logger.info('Optimized conversation history', {
      totalAvailable: this.conversationMemory.length,
      selected: selectedTurns.length,
      tokens: currentTokens,
      targetTokens
    });

    return selectedTurns.map(turn => ({
      role: turn.role,
      content: turn.content
    }));
  }

  /**
   * Store working context for current operation
   */
  async storeWorkingContext(key, data, priority = 'workflow_state', ttl = null) {
    const contextItem = {
      data,
      priority: this.contextPriority[priority] || 5,
      timestamp: new Date().toISOString(),
      ttl,
      tokens: this.estimateTokenCount(JSON.stringify(data))
    };

    this.workingContext.set(key, contextItem);

    // Also persist important context to database
    if (priority === 'system_critical' || priority === 'current_task') {
      try {
        await executeInternalTool('bloom_store_context', {
          contextType: 'workflow_pattern',
          title: `Working Context: ${key}`,
          content: JSON.stringify(data),
          tags: [priority, 'working_context'],
          expiresAt: ttl ? new Date(Date.now() + ttl).toISOString() : null
        });
      } catch (error) {
        logger.warn('Failed to persist working context:', error);
      }
    }

    logger.debug('Stored working context', { key, priority, tokens: contextItem.tokens });
  }

  /**
   * Retrieve working context
   */
  getWorkingContext(key) {
    const item = this.workingContext.get(key);
    if (!item) return null;

    // Check TTL
    if (item.ttl && Date.now() > new Date(item.timestamp).getTime() + item.ttl) {
      this.workingContext.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * Get all current working context as formatted string
   */
  getFormattedWorkingContext() {
    const contexts = [];
    for (const [key, item] of this.workingContext.entries()) {
      // Check TTL
      if (item.ttl && Date.now() > new Date(item.timestamp).getTime() + item.ttl) {
        this.workingContext.delete(key);
        continue;
      }

      contexts.push({
        key,
        data: item.data,
        priority: item.priority,
        timestamp: item.timestamp
      });
    }

    if (contexts.length === 0) return '';

    // Sort by priority
    contexts.sort((a, b) => b.priority - a.priority);

    return contexts
      .map(ctx => `## ${ctx.key}\n${typeof ctx.data === 'string' ? ctx.data : JSON.stringify(ctx.data, null, 2)}`)
      .join('\n\n');
  }

  /**
   * Compress conversation context when approaching limits (Claude Code wU2 pattern)
   * Extracts memories to database before compression
   */
  async compressContext() {
    logger.info('Starting context compression with memory extraction', {
      currentSize: this.conversationMemory.length,
      totalTokens: this.calculateTotalTokens()
    });

    // Identify turns that can be compressed or removed
    const oldTurns = this.conversationMemory.filter(turn =>
      Date.now() - new Date(turn.metadata.timestamp).getTime() > 1800000 && // Older than 30 minutes
      turn.metadata.priority < 7 // Not high priority
    );

    if (oldTurns.length === 0) {
      logger.warn('Cannot compress context - all turns are recent or high priority');
      return;
    }

    // STEP 1: Extract memories to database (Claude Code pattern)
    await this.extractMemoriesToDatabase(oldTurns);

    // STEP 2: Create compressed summaries
    const summaries = await this.createContextSummaries(oldTurns);

    // STEP 3: Replace old turns with summaries
    this.conversationMemory = this.conversationMemory.filter(turn => !oldTurns.includes(turn));

    // STEP 4: Add summaries as system context
    for (const summary of summaries) {
      await this.addConversationTurn('system', summary, {
        type: 'background_info',
        source: 'context_compression',
        compressed: true
      });
    }

    logger.info('Context compression completed', {
      newSize: this.conversationMemory.length,
      totalTokens: this.calculateTotalTokens(),
      turnsCompressed: oldTurns.length,
      summariesCreated: summaries.length,
      memoriesExtracted: true
    });
  }

  /**
   * Extract memories to database before compression (Claude Code pattern)
   */
  async extractMemoriesToDatabase(turns) {
    try {
      // Get database pool
      const { createPool } = await import('../../database/setup.js');
      const pool = createPool();

      // Create memories table if it doesn't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS memories (
          id SERIAL PRIMARY KEY,
          agent_id VARCHAR(100) DEFAULT 'bloomie-sarah-rodriguez',
          memory_type VARCHAR(50) NOT NULL, -- fact, outcome, relationship, instruction, learning
          content TEXT NOT NULL,
          importance INTEGER NOT NULL CHECK (importance >= 1 AND importance <= 10),
          tags JSONB DEFAULT '[]',
          source_conversation TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Create index for efficient querying
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_type_importance
        ON memories(memory_type, importance DESC);
      `);

      // Convert turns to conversation text for Claude analysis
      const conversationText = turns.map(turn =>
        `${turn.role}: ${typeof turn.content === 'string' ? turn.content : JSON.stringify(turn.content)}`
      ).join('\n\n');

      // Call Claude to extract memories
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0.1,
        system: `You are Sarah Rodriguez's memory extraction system. Analyze the conversation and extract key information into 5 categories:

1. FACTS: Names, dates, preferences, decisions made
2. OUTCOMES: What was requested, what happened, results achieved
3. RELATIONSHIPS: Emotional tone, concerns, rapport, personality insights
4. INSTRUCTIONS: Rules, preferences, or guidelines for future reference
5. LEARNINGS: Errors encountered, lessons learned, process improvements

For each memory, provide:
- type: one of [fact, outcome, relationship, instruction, learning]
- content: the actual information (be specific and actionable)
- importance: 1-10 scale (10 = critical to remember, 1 = minor detail)
- tags: array of relevant keywords for searching

Respond with a JSON array of memory objects. Extract only truly important information worth preserving long-term.`,
        messages: [{
          role: 'user',
          content: `Analyze this conversation and extract important memories:\n\n${conversationText}`
        }]
      });

      const memoryData = JSON.parse(response.content[0].text);
      const sourceConversation = `${turns.length} turns from ${turns[0]?.metadata.timestamp} to ${turns[turns.length-1]?.metadata.timestamp}`;

      // Save each memory to database
      let savedCount = 0;
      for (const memory of memoryData) {
        try {
          await pool.query(`
            INSERT INTO memories (memory_type, content, importance, tags, source_conversation)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            memory.type,
            memory.content,
            memory.importance,
            JSON.stringify(memory.tags || []),
            sourceConversation
          ]);
          savedCount++;
        } catch (error) {
          logger.warn('Failed to save individual memory:', error.message);
        }
      }

      await pool.end();

      logger.info('Memory extraction completed', {
        turnsAnalyzed: turns.length,
        memoriesExtracted: memoryData.length,
        memoriesSaved: savedCount
      });

      return savedCount;

    } catch (error) {
      logger.error('Memory extraction failed:', error);
      return 0;
    }
  }

  /**
   * Load high-importance memories for session start
   */
  async loadMemoriesForSession(limit = 20) {
    try {
      const { createPool } = await import('../../database/setup.js');
      const pool = createPool();

      const result = await pool.query(`
        SELECT memory_type, content, importance, tags, created_at
        FROM memories
        WHERE agent_id = $1 AND importance >= 7
        ORDER BY importance DESC, created_at DESC
        LIMIT $2
      `, [this.agentId, limit]);

      await pool.end();

      const memories = result.rows;
      logger.info('Loaded memories for session', { count: memories.length });

      // Add memories to context as high-priority system messages
      for (const memory of memories) {
        await this.addConversationTurn('system',
          `[Memory: ${memory.memory_type}] ${memory.content}`, {
          type: 'system_critical',
          source: 'persistent_memory',
          priority: 9,
          importance: memory.importance
        });
      }

      return memories.length;

    } catch (error) {
      logger.error('Failed to load memories for session:', error);
      return 0;
    }
  }

  /**
   * Create summaries of conversation turns for compression
   */
  async createContextSummaries(turns) {
    const summaries = [];

    // Group turns by time periods (30 minute windows)
    const timeGroups = this.groupTurnsByTime(turns, 30 * 60 * 1000);

    for (const [timeWindow, windowTurns] of timeGroups.entries()) {
      if (windowTurns.length < 2) continue; // Don't summarize single turns

      const turnContent = windowTurns.map(turn => `${turn.role}: ${turn.content}`).join('\n');

      const summary = `[Compressed Context ${timeWindow}]\n` +
        `Summary of ${windowTurns.length} conversation turns:\n` +
        `Key activities: ${this.extractKeyActivities(windowTurns)}\n` +
        `Important decisions: ${this.extractDecisions(windowTurns)}\n` +
        `Context preserved for continuity.`;

      summaries.push(summary);
    }

    return summaries;
  }

  /**
   * Group turns by time windows
   */
  groupTurnsByTime(turns, windowMs) {
    const groups = new Map();

    turns.forEach(turn => {
      const timestamp = new Date(turn.metadata.timestamp).getTime();
      const windowStart = Math.floor(timestamp / windowMs) * windowMs;
      const windowKey = new Date(windowStart).toISOString().split('T')[0] + 'T' +
                       new Date(windowStart).toTimeString().split(' ')[0].substr(0, 5);

      if (!groups.has(windowKey)) {
        groups.set(windowKey, []);
      }
      groups.get(windowKey).push(turn);
    });

    return groups;
  }

  /**
   * Extract key activities from conversation turns
   */
  extractKeyActivities(turns) {
    const activities = [];

    for (const turn of turns) {
      if (turn.metadata.type === 'tool_execution') {
        activities.push(`Used tool: ${turn.metadata.tool}`);
      } else if (turn.content.includes('TASK COMPLETED')) {
        activities.push('Completed task');
      } else if (turn.content.toLowerCase().includes('delegat')) {
        activities.push('Delegated to sub-agent');
      }
    }

    return activities.length > 0 ? activities.slice(0, 3).join(', ') : 'General conversation';
  }

  /**
   * Extract important decisions from turns
   */
  extractDecisions(turns) {
    const decisions = [];

    for (const turn of turns) {
      if (turn.content.toLowerCase().includes('escalat')) {
        decisions.push('Escalated issue');
      } else if (turn.content.toLowerCase().includes('reject')) {
        decisions.push('Rejected action');
      } else if (turn.content.toLowerCase().includes('approv')) {
        decisions.push('Approved action');
      }
    }

    return decisions.length > 0 ? decisions.slice(0, 2).join(', ') : 'Routine decisions';
  }

  /**
   * Estimate token count for text content
   */
  estimateTokenCount(text) {
    if (typeof text !== 'string') {
      text = JSON.stringify(text);
    }
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate total tokens in conversation memory
   */
  calculateTotalTokens() {
    return this.conversationMemory.reduce((total, turn) => total + turn.metadata.tokens, 0);
  }

  /**
   * Clear old context based on age and priority
   */
  cleanupOldContext(maxAge = 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAge;

    const beforeCount = this.conversationMemory.length;
    this.conversationMemory = this.conversationMemory.filter(turn =>
      new Date(turn.metadata.timestamp).getTime() > cutoff ||
      turn.metadata.priority >= 8 // Keep high priority items regardless of age
    );

    // Cleanup working context TTL items
    for (const [key, item] of this.workingContext.entries()) {
      if (item.ttl && Date.now() > new Date(item.timestamp).getTime() + item.ttl) {
        this.workingContext.delete(key);
      }
    }

    const afterCount = this.conversationMemory.length;
    if (beforeCount !== afterCount) {
      logger.info('Context cleanup completed', {
        before: beforeCount,
        after: afterCount,
        removed: beforeCount - afterCount
      });
    }
  }

  /**
   * Get context statistics
   */
  getContextStats() {
    const totalTokens = this.calculateTotalTokens();
    const byPriority = {};
    const byType = {};

    this.conversationMemory.forEach(turn => {
      const priority = turn.metadata.priority;
      const type = turn.metadata.type || 'conversation';

      byPriority[priority] = (byPriority[priority] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
    });

    return {
      totalTurns: this.conversationMemory.length,
      totalTokens,
      utilizationPercent: Math.round((totalTokens / this.maxContextLength) * 100),
      workingContextSize: this.workingContext.size,
      distributionByPriority: byPriority,
      distributionByType: byType,
      averageTokensPerTurn: Math.round(totalTokens / this.conversationMemory.length) || 0
    };
  }
}

// Export singleton instance
export const contextManager = new ContextManager();