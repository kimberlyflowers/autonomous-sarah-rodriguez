// Agentic Task Execution API
// Handles autonomous task execution with multi-turn tool chaining

import express from 'express';
import { createLogger } from '../logging/logger.js';
import { AgentExecutor, EXECUTION_STATUS } from '../agent/executor.js';

const router = express.Router();
const logger = createLogger('execute-api');

// Active executions tracking
const activeExecutions = new Map();

// POST /api/execute/task - Execute a task using agentic system
router.post('/task', async (req, res) => {
  try {
    const { task, context = {}, agentId = 'bloomie-sarah-rodriguez' } = req.body;

    if (!task?.trim()) {
      return res.status(400).json({ error: 'Task description is required' });
    }

    // Create execution ID
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create executor instance
    const executor = new AgentExecutor(agentId);

    logger.info('Starting task execution', {
      executionId,
      task: task.substring(0, 100),
      agentId
    });

    // Execute task (this is async and can take time)
    const startTime = Date.now();
    const result = await executor.executeTask(task, {
      ...context,
      executionId,
      requestTime: new Date().toISOString()
    });

    // Log completion
    logger.info('Task execution completed', {
      executionId,
      status: result.status,
      duration: result.executionTime,
      turns: result.turns,
      toolsUsed: result.toolsUsed
    });

    // Return full result
    res.json({
      executionId,
      task,
      status: result.status,
      result: result.result,
      executionTime: result.executionTime,
      turns: result.turns,
      toolsUsed: result.toolsUsed,
      timestamp: new Date().toISOString(),
      // Include conversation history for debugging (optional)
      conversationHistory: context.includeHistory ? result.conversationHistory : undefined,
      toolHistory: result.toolHistory
    });

  } catch (error) {
    logger.error('Task execution failed:', error);
    res.status(500).json({
      error: 'Failed to execute task',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/execute/task-async - Execute a task asynchronously
router.post('/task-async', async (req, res) => {
  try {
    const { task, context = {}, agentId = 'bloomie-sarah-rodriguez' } = req.body;

    if (!task?.trim()) {
      return res.status(400).json({ error: 'Task description is required' });
    }

    // Create execution ID
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Starting async task execution', {
      executionId,
      task: task.substring(0, 100),
      agentId
    });

    // Store execution info
    activeExecutions.set(executionId, {
      status: 'running',
      task,
      agentId,
      startTime: Date.now(),
      context
    });

    // Start execution in background
    const executor = new AgentExecutor(agentId);
    executor.executeTask(task, {
      ...context,
      executionId,
      requestTime: new Date().toISOString()
    }).then(result => {
      // Update execution status
      activeExecutions.set(executionId, {
        status: 'completed',
        task,
        agentId,
        startTime: activeExecutions.get(executionId).startTime,
        result,
        completedAt: Date.now()
      });

      logger.info('Async task execution completed', {
        executionId,
        status: result.status,
        duration: result.executionTime
      });
    }).catch(error => {
      // Update execution status with error
      activeExecutions.set(executionId, {
        status: 'failed',
        task,
        agentId,
        startTime: activeExecutions.get(executionId).startTime,
        error: error.message,
        completedAt: Date.now()
      });

      logger.error('Async task execution failed:', { executionId, error });
    });

    // Return execution ID immediately
    res.json({
      executionId,
      status: 'started',
      message: 'Task execution started in background',
      statusEndpoint: `/api/execute/status/${executionId}`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to start async task execution:', error);
    res.status(500).json({
      error: 'Failed to start task execution',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/execute/status/:executionId - Get execution status
router.get('/status/:executionId', (req, res) => {
  try {
    const { executionId } = req.params;
    const execution = activeExecutions.get(executionId);

    if (!execution) {
      return res.status(404).json({
        error: 'Execution not found',
        executionId
      });
    }

    res.json({
      executionId,
      status: execution.status,
      task: execution.task,
      agentId: execution.agentId,
      startTime: new Date(execution.startTime).toISOString(),
      runtime: Date.now() - execution.startTime,
      result: execution.result,
      error: execution.error,
      completedAt: execution.completedAt ? new Date(execution.completedAt).toISOString() : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get execution status:', error);
    res.status(500).json({
      error: 'Failed to get execution status',
      message: error.message
    });
  }
});

// GET /api/execute/active - List active executions
router.get('/active', (req, res) => {
  try {
    const active = Array.from(activeExecutions.entries()).map(([id, execution]) => ({
      executionId: id,
      status: execution.status,
      task: execution.task.substring(0, 100) + (execution.task.length > 100 ? '...' : ''),
      agentId: execution.agentId,
      startTime: new Date(execution.startTime).toISOString(),
      runtime: Date.now() - execution.startTime
    }));

    res.json({
      count: active.length,
      executions: active,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to list active executions:', error);
    res.status(500).json({
      error: 'Failed to list executions',
      message: error.message
    });
  }
});

// DELETE /api/execute/cleanup - Clean up old executions
router.delete('/cleanup', (req, res) => {
  try {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    let cleaned = 0;

    for (const [id, execution] of activeExecutions.entries()) {
      if (execution.completedAt && execution.completedAt < cutoff) {
        activeExecutions.delete(id);
        cleaned++;
      }
    }

    logger.info(`Cleaned up ${cleaned} old executions`);

    res.json({
      cleaned,
      remaining: activeExecutions.size,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to cleanup executions:', error);
    res.status(500).json({
      error: 'Failed to cleanup executions',
      message: error.message
    });
  }
});

// Cleanup old executions periodically
setInterval(() => {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  let cleaned = 0;

  for (const [id, execution] of activeExecutions.entries()) {
    if (execution.completedAt && execution.completedAt < cutoff) {
      activeExecutions.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`Auto-cleaned ${cleaned} old executions`);
  }
}, 60 * 60 * 1000); // Run every hour

export default router;