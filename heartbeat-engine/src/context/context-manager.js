// Lean Context Manager — no memory leaks, no external API calls, no extra pools
import { createLogger } from '../logging/logger.js';

const logger = createLogger('context-manager');
const MAX_MEMORY = 50; // Keep last 50 turns max — then drop oldest

export class ContextManager {
  constructor(agentId = 'bloomie-sarah-rodriguez') {
    this.agentId = agentId;
    this.conversationMemory = [];
    this.workingContext = new Map();
    this.maxContextLength = 100000;
    this.contextPriority = {
      'system_critical': 10, 'current_task': 9, 'recent_actions': 8,
      'user_preferences': 7, 'workflow_state': 6, 'historical_context': 5,
      'background_info': 4, 'reference_data': 3, 'cached_results': 2, 'metadata': 1
    };
  }

  async addConversationTurn(role, content, metadata = {}) {
    const tokens = typeof content === 'string' ? Math.ceil(content.length / 4) : 500;
    this.conversationMemory.push({
      role, content,
      metadata: { ...metadata, timestamp: new Date().toISOString(), priority: this.contextPriority[metadata.type] || 5, tokens }
    });
    // Hard cap — drop oldest non-critical turns
    while (this.conversationMemory.length > MAX_MEMORY) {
      const idx = this.conversationMemory.findIndex(t => t.metadata.priority < 8);
      if (idx >= 0) this.conversationMemory.splice(idx, 1);
      else this.conversationMemory.shift(); // all high priority, drop oldest anyway
    }
    return `turn-${Date.now()}`;
  }

  getOptimizedHistory(maxTokens = null) {
    const target = maxTokens || this.maxContextLength;
    let tokens = 0;
    const result = [];
    // Walk backwards — most recent first
    for (let i = this.conversationMemory.length - 1; i >= 0; i--) {
      const t = this.conversationMemory[i];
      if (tokens + t.metadata.tokens > target) break;
      result.unshift({ role: t.role, content: t.content });
      tokens += t.metadata.tokens;
    }

    // Safety: ensure every tool_result has a matching tool_use in the returned history.
    // Collect tool_use IDs from assistant messages
    const toolUseIds = new Set();
    for (const msg of result) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && block.id) toolUseIds.add(block.id);
        }
      }
    }
    // Strip orphaned tool_result blocks
    for (const msg of result) {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        msg.content = msg.content.filter(block => {
          if (block.type === 'tool_result' && block.tool_use_id) {
            return toolUseIds.has(block.tool_use_id);
          }
          return true;
        });
        // If emptied, replace with placeholder
        if (msg.content.length === 0) {
          msg.content = '[prior tool results trimmed]';
        }
      }
    }
    return result.filter(msg => msg.content && (typeof msg.content === 'string' ? msg.content.length > 0 : msg.content.length > 0));
  }

  async storeWorkingContext(key, data, priority = 'workflow_state', ttl = null) {
    this.workingContext.set(key, {
      data, priority: this.contextPriority[priority] || 5,
      timestamp: new Date().toISOString(), ttl
    });
    // Cap working context too
    if (this.workingContext.size > 20) {
      const oldest = [...this.workingContext.entries()].sort((a,b) => a[1].priority - b[1].priority)[0];
      if (oldest) this.workingContext.delete(oldest[0]);
    }
  }

  getWorkingContext(key) {
    const item = this.workingContext.get(key);
    if (!item) return null;
    if (item.ttl && Date.now() > new Date(item.timestamp).getTime() + item.ttl) {
      this.workingContext.delete(key);
      return null;
    }
    return item.data;
  }

  getFormattedWorkingContext() {
    const out = [];
    for (const [key, item] of this.workingContext.entries()) {
      if (item.ttl && Date.now() > new Date(item.timestamp).getTime() + item.ttl) {
        this.workingContext.delete(key); continue;
      }
      out.push(`## ${key}\n${typeof item.data === 'string' ? item.data : JSON.stringify(item.data, null, 2)}`);
    }
    return out.join('\n\n');
  }

  async compressContext() {
    // Simple: just trim to MAX_MEMORY, no API calls
    if (this.conversationMemory.length > MAX_MEMORY) {
      const keep = this.conversationMemory.slice(-MAX_MEMORY);
      this.conversationMemory = keep;
      logger.info('Context trimmed', { kept: keep.length });
    }
  }

  cleanupOldContext(maxAge = 86400000) {
    const cutoff = Date.now() - maxAge;
    this.conversationMemory = this.conversationMemory.filter(t =>
      new Date(t.metadata.timestamp).getTime() > cutoff || t.metadata.priority >= 8
    );
    for (const [key, item] of this.workingContext.entries()) {
      if (item.ttl && Date.now() > new Date(item.timestamp).getTime() + item.ttl)
        this.workingContext.delete(key);
    }
  }

  getContextStats() {
    const totalTokens = this.conversationMemory.reduce((s, t) => s + t.metadata.tokens, 0);
    return {
      totalTurns: this.conversationMemory.length,
      totalTokens,
      utilizationPercent: Math.round((totalTokens / this.maxContextLength) * 100),
      workingContextSize: this.workingContext.size,
      averageTokensPerTurn: Math.round(totalTokens / (this.conversationMemory.length || 1))
    };
  }
}

export const contextManager = new ContextManager();
