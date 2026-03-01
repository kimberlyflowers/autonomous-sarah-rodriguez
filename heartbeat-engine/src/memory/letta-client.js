// BLOOM Heartbeat Engine - Letta Memory Client
// Interfaces with Letta server for long-term agent memory

import axios from 'axios';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('letta');

class LettaClient {
  constructor() {
    this.baseUrl = process.env.LETTA_SERVER_URL || 'http://letta-server.railway.internal:8283';
    this.isAvailable = false;

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add interceptors for logging
    this.client.interceptors.response.use(
      response => {
        logger.debug('Letta API Success', {
          method: response.config.method,
          url: response.config.url,
          status: response.status
        });
        return response;
      },
      error => {
        logger.error('Letta API Error', {
          method: error.config?.method,
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message
        });
        throw error;
      }
    );
  }

  // Test connection to Letta server
  async testConnection() {
    try {
      const response = await this.client.get('/health');
      this.isAvailable = response.status === 200;
      logger.info('✅ Letta connection test successful');
      return true;
    } catch (error) {
      this.isAvailable = false;
      logger.warn('❌ Letta connection test failed:', error.message);
      return false;
    }
  }

  // Get relevant memory for current context
  async getRelevantMemory(context) {
    if (!this.isAvailable) {
      logger.warn('Letta not available, using fallback memory');
      return await this.getFallbackMemory(context);
    }

    try {
      const {
        agentId,
        currentContext,
        recentActions,
        triggerContext
      } = context;

      logger.info('Retrieving relevant memory...', {
        agentId,
        contextKeys: Object.keys(currentContext || {}),
        recentActionsCount: recentActions?.length || 0
      });

      // Build search query based on context
      const searchQuery = this.buildMemoryQuery(currentContext, triggerContext);

      const response = await this.client.post('/memory/search', {
        agentId,
        query: searchQuery,
        limit: 20,
        relevanceThreshold: 0.5
      });

      const memories = response.data.memories || [];

      logger.info(`Retrieved ${memories.length} relevant memories`);

      return {
        recentActions: recentActions || [],
        patterns: this.extractPatterns(memories),
        preferences: this.extractPreferences(memories),
        previousDecisions: this.extractPreviousDecisions(memories),
        contextualMemories: memories
      };

    } catch (error) {
      logger.error('Failed to get memory from Letta:', error.message);
      return await this.getFallbackMemory(context);
    }
  }

  // Store memory from current cycle
  async storeMemory(memoryData) {
    if (!this.isAvailable) {
      logger.warn('Letta not available, storing in fallback');
      return await this.storeFallbackMemory(memoryData);
    }

    try {
      const {
        agentId,
        cycleId,
        actions,
        rejections,
        handoffs,
        environmentSnapshot,
        trigger,
        duration
      } = memoryData;

      logger.info('Storing cycle memory...', {
        agentId,
        cycleId,
        actionsCount: actions?.length || 0,
        rejectionsCount: rejections?.length || 0,
        handoffsCount: handoffs?.length || 0
      });

      // Store cycle summary
      await this.client.post('/memory/store', {
        agentId,
        type: 'cycle_summary',
        content: {
          cycleId,
          timestamp: new Date().toISOString(),
          duration,
          trigger,
          summary: this.generateCycleSummary(actions, rejections, handoffs),
          environmentSnapshot
        },
        metadata: {
          cycle_id: cycleId,
          actions_count: actions?.length || 0,
          rejections_count: rejections?.length || 0,
          handoffs_count: handoffs?.length || 0
        }
      });

      // Store individual actions as memories
      for (const action of actions || []) {
        await this.client.post('/memory/store', {
          agentId,
          type: 'action',
          content: {
            action_type: action.action_type,
            description: action.description,
            target_system: action.target_system,
            success: action.success,
            timestamp: new Date().toISOString()
          },
          metadata: {
            cycle_id: cycleId,
            action_type: action.action_type
          }
        });
      }

      // Store significant rejections (learning opportunities)
      for (const rejection of rejections || []) {
        if (rejection.confidence > 0.8) {
          await this.client.post('/memory/store', {
            agentId,
            type: 'decision_pattern',
            content: {
              decision_type: 'rejection',
              candidate: rejection.candidate,
              reason: rejection.reason,
              confidence: rejection.confidence,
              timestamp: new Date().toISOString()
            },
            metadata: {
              cycle_id: cycleId,
              reason_code: rejection.reason_code
            }
          });
        }
      }

      // Store handoffs (learning from human feedback)
      for (const handoff of handoffs || []) {
        await this.client.post('/memory/store', {
          agentId,
          type: 'escalation',
          content: {
            issue: handoff.issue,
            analysis: handoff.analysis,
            recommendation: handoff.recommendation,
            urgency: handoff.urgency,
            timestamp: new Date().toISOString()
          },
          metadata: {
            cycle_id: cycleId,
            urgency: handoff.urgency
          }
        });
      }

      logger.info('✅ Memory stored successfully');

    } catch (error) {
      logger.error('Failed to store memory in Letta:', error.message);
      await this.storeFallbackMemory(memoryData);
    }
  }

  // Store human feedback for learning
  async storeFeedback(feedbackData) {
    if (!this.isAvailable) {
      logger.warn('Letta not available for feedback storage');
      return;
    }

    try {
      const {
        agentId,
        escalationId,
        resolution,
        feedback,
        resolvedAt
      } = feedbackData;

      await this.client.post('/memory/store', {
        agentId,
        type: 'human_feedback',
        content: {
          escalationId,
          resolution,
          feedback: feedback.summary,
          fullResponse: feedback.fullResponse,
          resolvedAt,
          timestamp: new Date().toISOString()
        },
        metadata: {
          escalation_id: escalationId,
          feedback_type: 'resolution'
        }
      });

      logger.info('✅ Human feedback stored for learning');

    } catch (error) {
      logger.error('Failed to store feedback:', error.message);
    }
  }

  // Build memory search query from context
  buildMemoryQuery(currentContext, triggerContext) {
    const queryParts = [];

    // Add environment-based queries
    if (currentContext?.ghl?.newInquiries?.length > 0) {
      queryParts.push('enrollment inquiry response follow-up');
    }

    if (currentContext?.ghl?.overdueFollowups?.length > 0) {
      queryParts.push('overdue follow-up reminder');
    }

    if (currentContext?.calendar?.needsPrep?.length > 0) {
      queryParts.push('appointment preparation reminder');
    }

    if (currentContext?.tasks?.overdue?.length > 0) {
      queryParts.push('overdue task management');
    }

    // Add trigger-based queries
    if (triggerContext?.type === 'manual') {
      queryParts.push('manual trigger decision pattern');
    }

    if (triggerContext?.triggerType) {
      queryParts.push(triggerContext.triggerType);
    }

    return queryParts.join(' ') || 'general operations pattern';
  }

  // Generate cycle summary for memory
  generateCycleSummary(actions, rejections, handoffs) {
    const summary = [];

    if (actions?.length > 0) {
      const actionTypes = actions.map(a => a.action_type);
      summary.push(`Executed ${actions.length} actions: ${actionTypes.join(', ')}`);
    }

    if (rejections?.length > 0) {
      summary.push(`Rejected ${rejections.length} potential actions for safety/scope reasons`);
    }

    if (handoffs?.length > 0) {
      summary.push(`Escalated ${handoffs.length} issues requiring human attention`);
    }

    return summary.join('. ') || 'Monitoring cycle completed';
  }

  // Extract patterns from memories
  extractPatterns(memories) {
    if (!memories || memories.length === 0) return [];

    const patterns = memories
      .filter(m => m.type === 'decision_pattern')
      .map(m => ({
        pattern: m.content.decision_type,
        description: `${m.content.candidate}: ${m.content.reason}`,
        confidence: m.content.confidence,
        frequency: 1 // Would be calculated from multiple instances
      }))
      .slice(0, 5); // Top 5 patterns

    return patterns;
  }

  // Extract preferences from memories
  extractPreferences(memories) {
    if (!memories || memories.length === 0) return [];

    // Extract client preferences from successful actions
    const preferences = memories
      .filter(m => m.type === 'action' && m.content.success)
      .map(m => ({
        preference: m.content.action_type,
        value: 'Preferred based on successful past actions',
        source: 'agent_learning',
        confidence: 0.8
      }))
      .slice(0, 3);

    return preferences;
  }

  // Extract previous similar decisions
  extractPreviousDecisions(memories) {
    if (!memories || memories.length === 0) return [];

    return memories
      .filter(m => m.type === 'escalation' || m.type === 'decision_pattern')
      .map(m => ({
        decision: m.content.issue || m.content.candidate,
        outcome: m.content.resolution || m.content.reason,
        timestamp: m.content.timestamp,
        type: m.type
      }))
      .slice(0, 5);
  }

  // Fallback memory when Letta is unavailable
  async getFallbackMemory(context) {
    logger.info('Using fallback memory system');

    return {
      recentActions: context.recentActions || [],
      patterns: [
        {
          pattern: 'follow_up_timing',
          description: 'Send follow-ups within 1 hour of inquiry',
          confidence: 0.9,
          frequency: 10
        }
      ],
      preferences: [
        {
          preference: 'response_timing',
          value: 'Quick response preferred for enrollments',
          source: 'default_config',
          confidence: 0.8
        }
      ],
      previousDecisions: [],
      contextualMemories: []
    };
  }

  // Store memory in fallback system (database)
  async storeFallbackMemory(memoryData) {
    try {
      // Store in memory_snapshots table
      const { createPool } = await import('../../database/setup.js');
      const pool = createPool();

      await pool.query(`
        INSERT INTO memory_snapshots (agent_id, cycle_id, memory_type, content, relevance_score)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        memoryData.agentId,
        memoryData.cycleId,
        'cycle_summary',
        JSON.stringify({
          actions: memoryData.actions,
          rejections: memoryData.rejections,
          handoffs: memoryData.handoffs,
          environmentSnapshot: memoryData.environmentSnapshot
        }),
        0.8
      ]);

      await pool.end();

      logger.info('✅ Memory stored in fallback database');

    } catch (error) {
      logger.error('Failed to store fallback memory:', error.message);
    }
  }
}

// Test connection on module load
export async function testLettaConnection() {
  try {
    const client = new LettaClient();
    return await client.testConnection();
  } catch (error) {
    logger.warn('Letta connection test failed:', error.message);
    return false;
  }
}

// Create and export singleton instance
export const lettaClient = new LettaClient();