// Enhanced Tool Execution System for Sarah Rodriguez
// Retry logic, error recovery, parallel execution, and performance monitoring

import { createLogger } from '../logging/logger.js';
import { executeGHLTool } from './ghl-tools.js';
import { executeInternalTool } from './internal-tools.js';
import { executeBrowserTool } from './browser-tools.js';
import { executeWebSearchTool } from './web-search-tools.js';
import { executeImageTool } from './image-tools.js';
import { executeScrapeTools } from './scrape-tools.js';
import { trustGate } from '../trust/trust-gate.js';

const logger = createLogger('enhanced-executor');

/**
 * Tool execution status and result types
 */
export const EXECUTION_STATUS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRYING: 'retrying',
  TIMEOUT: 'timeout',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled'
};

/**
 * Enhanced Tool Executor
 * Handles complex tool execution with retry, parallel execution, and monitoring
 */
export class EnhancedToolExecutor {
  constructor(agentId = 'bloomie-sarah-rodriguez') {
    this.agentId = agentId;
    this.executionHistory = new Map();
    this.performanceMetrics = new Map();
    this.retryStrategies = new Map();
    this.executionQueue = [];
    this.activeExecutions = new Map();
    this.maxConcurrentExecutions = 5;
    this.defaultTimeout = 30000; // 30 seconds

    // Initialize default retry strategies
    this.initializeRetryStrategies();

    logger.info('Enhanced Tool Executor initialized', {
      agentId,
      maxConcurrent: this.maxConcurrentExecutions
    });
  }

  /**
   * Initialize retry strategies for different tool categories
   */
  initializeRetryStrategies() {
    this.retryStrategies.set('ghl_api', {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableErrors: ['rate_limit', 'timeout', 'service_unavailable', 'network_error']
    });

    this.retryStrategies.set('internal_tools', {
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 1.5,
      retryableErrors: ['database_timeout', 'temporary_failure']
    });

    this.retryStrategies.set('external_api', {
      maxRetries: 4,
      baseDelay: 2000,
      maxDelay: 15000,
      backoffMultiplier: 2,
      retryableErrors: ['timeout', 'service_error', 'rate_limit']
    });

    this.retryStrategies.set('file_operations', {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 8000,
      backoffMultiplier: 2,
      retryableErrors: ['file_locked', 'permission_denied', 'disk_full']
    });
  }

  /**
   * Execute single tool with enhanced capabilities
   */
  async executeTool(toolName, parameters, options = {}) {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();

    const execution = {
      id: executionId,
      toolName,
      parameters,
      options,
      startTime,
      status: EXECUTION_STATUS.RETRYING,
      attempts: 0,
      errors: [],
      metrics: {
        authorizationTime: 0,
        executionTime: 0,
        retryTime: 0
      }
    };

    this.activeExecutions.set(executionId, execution);

    try {
      logger.info('Starting enhanced tool execution', {
        executionId,
        toolName,
        agentId: this.agentId
      });

      const result = await this.executeWithRetry(execution);

      execution.status = result.success ? EXECUTION_STATUS.SUCCESS : EXECUTION_STATUS.FAILED;
      execution.result = result;
      execution.endTime = Date.now();
      execution.totalTime = execution.endTime - execution.startTime;

      // Record performance metrics
      this.recordPerformanceMetrics(toolName, execution);

      logger.info('Enhanced tool execution completed', {
        executionId,
        toolName,
        status: execution.status,
        attempts: execution.attempts,
        totalTime: execution.totalTime
      });

      return {
        ...result,
        execution: {
          id: executionId,
          attempts: execution.attempts,
          totalTime: execution.totalTime,
          status: execution.status
        }
      };

    } catch (error) {
      execution.status = EXECUTION_STATUS.FAILED;
      execution.error = error.message;
      execution.endTime = Date.now();
      execution.totalTime = execution.endTime - execution.startTime;

      logger.error('Enhanced tool execution failed', {
        executionId,
        toolName,
        error: error.message,
        attempts: execution.attempts
      });

      return {
        success: false,
        error: error.message,
        execution: {
          id: executionId,
          attempts: execution.attempts,
          totalTime: execution.totalTime,
          status: execution.status
        }
      };
    } finally {
      // Move to history and cleanup
      this.executionHistory.set(executionId, execution);
      this.activeExecutions.delete(executionId);

      // Cleanup old history (keep last 100)
      if (this.executionHistory.size > 100) {
        const oldestKey = this.executionHistory.keys().next().value;
        this.executionHistory.delete(oldestKey);
      }
    }
  }

  /**
   * Execute tool with retry logic
   */
  async executeWithRetry(execution) {
    const category = this.getToolCategory(execution.toolName);
    const retryStrategy = this.retryStrategies.get(category) || this.retryStrategies.get('internal_tools');

    let lastError = null;

    for (let attempt = 1; attempt <= retryStrategy.maxRetries + 1; attempt++) {
      execution.attempts = attempt;

      try {
        // Apply timeout
        const timeout = execution.options.timeout || this.defaultTimeout;
        const result = await Promise.race([
          this.executeSingleAttempt(execution),
          this.createTimeoutPromise(timeout)
        ]);

        if (result.timeout) {
          throw new Error('Tool execution timeout');
        }

        // Success on first try or retry
        if (result.success) {
          return result;
        }

        // Failed but might be retryable
        lastError = result.error || 'Unknown error';

        if (!this.isRetryableError(lastError, retryStrategy) || attempt > retryStrategy.maxRetries) {
          return result;
        }

        // Calculate delay for next retry
        const delay = this.calculateRetryDelay(attempt - 1, retryStrategy);

        logger.warn('Tool execution failed, retrying', {
          executionId: execution.id,
          toolName: execution.toolName,
          attempt,
          error: lastError,
          retryDelay: delay
        });

        await this.sleep(delay);

      } catch (error) {
        lastError = error.message;

        if (!this.isRetryableError(lastError, retryStrategy) || attempt > retryStrategy.maxRetries) {
          throw error;
        }

        const delay = this.calculateRetryDelay(attempt - 1, retryStrategy);
        logger.warn('Tool execution threw error, retrying', {
          executionId: execution.id,
          toolName: execution.toolName,
          attempt,
          error: error.message,
          retryDelay: delay
        });

        await this.sleep(delay);
      }
    }

    throw new Error(`Tool execution failed after ${retryStrategy.maxRetries} retries: ${lastError}`);
  }

  /**
   * Execute single attempt of tool execution
   */
  async executeSingleAttempt(execution) {
    const authStart = Date.now();

    // TRUST GATE: Authorization check
    const authorization = await trustGate.authorizeAction(
      execution.toolName,
      execution.parameters,
      this.agentId,
      execution.id
    );

    execution.metrics.authorizationTime += Date.now() - authStart;

    if (!authorization.authorized) {
      return {
        success: false,
        blocked: true,
        reason: authorization.reason,
        code: authorization.code,
        requiredLevel: authorization.requiredLevel,
        currentLevel: authorization.currentLevel,
        escalated: authorization.escalate
      };
    }

    const execStart = Date.now();

    // Execute the actual tool
    let result;
    if (execution.toolName.startsWith('ghl_')) {
      result = await executeGHLTool(execution.toolName, execution.parameters);
    } else if (execution.toolName.startsWith('bloom_')) {
      result = await executeInternalTool(execution.toolName, execution.parameters);
    } else if (execution.toolName.startsWith('browser_')) {
      result = await executeBrowserTool(execution.toolName, execution.parameters);
    } else if (execution.toolName.startsWith('web_')) {
      result = await executeWebSearchTool(execution.toolName, execution.parameters);
    } else if (execution.toolName.startsWith('image_')) {
      result = await executeImageTool(execution.toolName, execution.parameters);
    } else if (execution.toolName.startsWith('scrape_')) {
      result = await executeScrapeTools(execution.toolName, execution.parameters);
    } else {
      throw new Error(`Unknown tool category: ${execution.toolName}`);
    }

    execution.metrics.executionTime += Date.now() - execStart;

    // Add authorization info to successful results
    if (result.success) {
      result.authorization = {
        level: authorization.level,
        category: authorization.category,
        risk: authorization.risk,
        limits: authorization.limits
      };
    }

    return result;
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel(toolExecutions, options = {}) {
    const batchId = this.generateExecutionId('batch');
    const maxConcurrent = options.maxConcurrent || this.maxConcurrentExecutions;
    const timeout = options.timeout || this.defaultTimeout * 2;

    logger.info('Starting parallel tool execution', {
      batchId,
      toolCount: toolExecutions.length,
      maxConcurrent,
      timeout
    });

    const results = [];
    const executing = [];

    // Execute tools in batches respecting concurrency limit
    for (let i = 0; i < toolExecutions.length; i += maxConcurrent) {
      const batch = toolExecutions.slice(i, i + maxConcurrent);

      const batchPromises = batch.map(async (toolExecution) => {
        const { toolName, parameters, options: toolOptions = {} } = toolExecution;
        return this.executeTool(toolName, parameters, {
          ...toolOptions,
          timeout: timeout / 2 // Individual tool timeout
        });
      });

      try {
        // Execute batch with timeout
        const batchResults = await Promise.race([
          Promise.all(batchPromises),
          this.createTimeoutPromise(timeout).then(() => {
            throw new Error('Parallel execution batch timeout');
          })
        ]);

        results.push(...batchResults);

      } catch (error) {
        logger.error('Parallel execution batch failed', {
          batchId,
          batchIndex: Math.floor(i / maxConcurrent),
          error: error.message
        });

        // Add failed results for remaining tools in batch
        for (let j = 0; j < batch.length; j++) {
          results.push({
            success: false,
            error: error.message,
            toolName: batch[j].toolName
          });
        }
      }
    }

    logger.info('Parallel tool execution completed', {
      batchId,
      totalTools: toolExecutions.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });

    return {
      batchId,
      results,
      summary: {
        total: toolExecutions.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        blocked: results.filter(r => r.blocked).length
      }
    };
  }

  /**
   * Execute tools with dependency management
   */
  async executeWithDependencies(toolGraph, options = {}) {
    const executionId = this.generateExecutionId('graph');
    const results = new Map();
    const completed = new Set();
    const failed = new Set();

    logger.info('Starting dependency-based tool execution', {
      executionId,
      toolCount: Object.keys(toolGraph).length
    });

    // Find tools with no dependencies to start with
    const readyToExecute = this.findReadyTools(toolGraph, completed, failed);

    while (readyToExecute.length > 0 && completed.size + failed.size < Object.keys(toolGraph).length) {
      // Execute all ready tools in parallel
      const executions = readyToExecute.map(toolId => ({
        toolName: toolGraph[toolId].toolName,
        parameters: this.resolveDependencyParameters(toolGraph[toolId].parameters, results),
        options: toolGraph[toolId].options || {}
      }));

      const batchResult = await this.executeParallel(executions);

      // Process results and update status
      for (let i = 0; i < readyToExecute.length; i++) {
        const toolId = readyToExecute[i];
        const result = batchResult.results[i];

        results.set(toolId, result);

        if (result.success) {
          completed.add(toolId);
        } else {
          failed.add(toolId);

          // Mark dependent tools as failed too
          this.markDependentToolsAsFailed(toolGraph, toolId, failed, results);
        }
      }

      // Find next batch of ready tools
      readyToExecute.splice(0); // Clear array
      readyToExecute.push(...this.findReadyTools(toolGraph, completed, failed));
    }

    logger.info('Dependency-based tool execution completed', {
      executionId,
      completed: completed.size,
      failed: failed.size,
      total: Object.keys(toolGraph).length
    });

    return {
      executionId,
      results: Object.fromEntries(results),
      summary: {
        total: Object.keys(toolGraph).length,
        completed: completed.size,
        failed: failed.size
      }
    };
  }

  /**
   * Get tools ready for execution (dependencies satisfied)
   */
  findReadyTools(toolGraph, completed, failed) {
    const ready = [];

    for (const [toolId, toolDef] of Object.entries(toolGraph)) {
      if (completed.has(toolId) || failed.has(toolId)) {
        continue;
      }

      const dependencies = toolDef.dependencies || [];
      const dependenciesSatisfied = dependencies.every(dep => completed.has(dep));

      if (dependenciesSatisfied) {
        ready.push(toolId);
      }
    }

    return ready;
  }

  /**
   * Resolve parameters that depend on other tool results
   */
  resolveDependencyParameters(parameters, results) {
    if (typeof parameters !== 'object' || parameters === null) {
      return parameters;
    }

    const resolved = { ...parameters };

    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        // Parameter references another tool result
        const reference = value.slice(2, -1); // Remove ${ and }
        const [toolId, path] = reference.split('.');

        if (results.has(toolId)) {
          const toolResult = results.get(toolId);
          resolved[key] = path ? this.getNestedValue(toolResult, path) : toolResult.result;
        }
      }
    }

    return resolved;
  }

  /**
   * Mark tools that depend on failed tool as failed
   */
  markDependentToolsAsFailed(toolGraph, failedToolId, failed, results) {
    for (const [toolId, toolDef] of Object.entries(toolGraph)) {
      if (failed.has(toolId)) continue;

      const dependencies = toolDef.dependencies || [];
      if (dependencies.includes(failedToolId)) {
        failed.add(toolId);
        results.set(toolId, {
          success: false,
          error: `Dependency failed: ${failedToolId}`,
          dependencyFailure: true
        });

        // Recursively mark dependent tools
        this.markDependentToolsAsFailed(toolGraph, toolId, failed, results);
      }
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Get tool category for retry strategy
   */
  getToolCategory(toolName) {
    if (toolName.startsWith('ghl_')) return 'ghl_api';
    if (toolName.startsWith('bloom_')) return 'internal_tools';
    if (toolName.startsWith('browser_')) return 'external_api';
    if (toolName.startsWith('web_')) return 'external_api';
    if (toolName.startsWith('image_')) return 'external_api';
    if (toolName.includes('file_') || toolName.includes('_file')) return 'file_operations';
    return 'external_api';
  }

  /**
   * Check if error is retryable based on strategy
   */
  isRetryableError(error, strategy) {
    const errorLower = error.toLowerCase();
    return strategy.retryableErrors.some(retryableError =>
      errorLower.includes(retryableError.toLowerCase())
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attempt, strategy) {
    const delay = Math.min(
      strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt),
      strategy.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = delay * 0.1 * Math.random();
    return Math.round(delay + jitter);
  }

  /**
   * Create timeout promise
   */
  createTimeoutPromise(timeout) {
    return new Promise(resolve => {
      setTimeout(() => resolve({ timeout: true }), timeout);
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique execution ID
   */
  generateExecutionId(prefix = 'exec') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Record performance metrics
   */
  recordPerformanceMetrics(toolName, execution) {
    if (!this.performanceMetrics.has(toolName)) {
      this.performanceMetrics.set(toolName, {
        executions: 0,
        totalTime: 0,
        successCount: 0,
        failureCount: 0,
        retryCount: 0,
        averageTime: 0,
        successRate: 0
      });
    }

    const metrics = this.performanceMetrics.get(toolName);

    metrics.executions++;
    metrics.totalTime += execution.totalTime;

    if (execution.status === EXECUTION_STATUS.SUCCESS) {
      metrics.successCount++;
    } else {
      metrics.failureCount++;
    }

    if (execution.attempts > 1) {
      metrics.retryCount++;
    }

    metrics.averageTime = Math.round(metrics.totalTime / metrics.executions);
    metrics.successRate = metrics.successCount / metrics.executions;

    this.performanceMetrics.set(toolName, metrics);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(toolName = null) {
    if (toolName) {
      return this.performanceMetrics.get(toolName) || null;
    }

    const stats = {
      totalTools: this.performanceMetrics.size,
      totalExecutions: 0,
      overallSuccessRate: 0,
      averageExecutionTime: 0,
      toolStats: {}
    };

    let totalSuccessful = 0;
    let totalTime = 0;

    for (const [tool, metrics] of this.performanceMetrics.entries()) {
      stats.totalExecutions += metrics.executions;
      totalSuccessful += metrics.successCount;
      totalTime += metrics.totalTime;
      stats.toolStats[tool] = { ...metrics };
    }

    if (stats.totalExecutions > 0) {
      stats.overallSuccessRate = totalSuccessful / stats.totalExecutions;
      stats.averageExecutionTime = Math.round(totalTime / stats.totalExecutions);
    }

    return stats;
  }

  /**
   * Get active execution status
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(exec => ({
      id: exec.id,
      toolName: exec.toolName,
      status: exec.status,
      attempts: exec.attempts,
      startTime: exec.startTime,
      duration: Date.now() - exec.startTime
    }));
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 20) {
    return Array.from(this.executionHistory.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit)
      .map(exec => ({
        id: exec.id,
        toolName: exec.toolName,
        status: exec.status,
        attempts: exec.attempts,
        totalTime: exec.totalTime,
        startTime: exec.startTime,
        endTime: exec.endTime
      }));
  }

  /**
   * Clear performance metrics
   */
  clearMetrics() {
    this.performanceMetrics.clear();
    logger.info('Performance metrics cleared');
  }
}

// Export singleton instance
export const enhancedExecutor = new EnhancedToolExecutor();