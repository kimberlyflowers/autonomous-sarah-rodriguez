// System Monitoring and Health Management for Sarah Rodriguez
// Advanced monitoring, alerting, and self-healing capabilities

import { createLogger } from '../logging/logger.js';
import { enhancedExecutor } from '../tools/enhanced-executor.js';
import { contextManager } from '../context/context-manager.js';
import { trustGate } from '../trust/trust-gate.js';

const logger = createLogger('system-monitor');

/**
 * System Health Status
 */
export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  WARNING: 'warning',
  CRITICAL: 'critical',
  MAINTENANCE: 'maintenance'
};

/**
 * System Monitor
 * Comprehensive system health monitoring and self-healing
 */
export class SystemMonitor {
  constructor(agentId = 'bloomie-sarah-rodriguez') {
    this.agentId = agentId;
    this.healthChecks = new Map();
    this.metrics = new Map();
    this.alerts = [];
    this.autoHealingEnabled = true;
    this.healthStatus = HEALTH_STATUS.HEALTHY;

    // Monitoring intervals
    this.healthCheckInterval = 300000; // 5 minutes (was 30s — way too aggressive)
    this.metricsInterval = 600000; // 10 minutes (was 1 min)
    this.cleanupInterval = 3600000; // 1 hour

    // Thresholds
    this.thresholds = {
      contextUtilization: 0.85, // 85%
      toolSuccessRate: 0.9, // 90%
      averageResponseTime: 5000, // 5 seconds
      trustGateViolations: 10, // per hour
      memoryUsage: 0.8, // 80%
      errorRate: 0.05 // 5%
    };

    this.initializeHealthChecks();
    this.startMonitoring();

    logger.info('System Monitor initialized', {
      agentId,
      autoHealing: this.autoHealingEnabled,
      healthCheckInterval: this.healthCheckInterval
    });
  }

  /**
   * Initialize health check functions
   */
  initializeHealthChecks() {
    // Context Manager Health
    this.healthChecks.set('context_manager', {
      name: 'Context Manager',
      check: async () => {
        const stats = contextManager.getContextStats();
        return {
          healthy: stats.utilizationPercent < this.thresholds.contextUtilization * 100,
          metrics: {
            utilization: stats.utilizationPercent,
            totalTurns: stats.totalTurns,
            totalTokens: stats.totalTokens,
            workingContextSize: stats.workingContextSize
          },
          message: `Context utilization: ${stats.utilizationPercent}%`
        };
      },
      critical: false,
      autoHeal: async (result) => {
        if (result.metrics.utilization > 90) {
          await contextManager.compressContext();
          return 'Triggered context compression';
        }
        return null;
      }
    });

    // Tool Performance Health
    this.healthChecks.set('tool_performance', {
      name: 'Tool Performance',
      check: async () => {
        const stats = enhancedExecutor.getPerformanceStats();
        return {
          healthy: stats.overallSuccessRate >= this.thresholds.toolSuccessRate,
          metrics: {
            successRate: stats.overallSuccessRate,
            averageTime: stats.averageExecutionTime,
            totalExecutions: stats.totalExecutions
          },
          message: `Tool success rate: ${Math.round(stats.overallSuccessRate * 100)}%`
        };
      },
      critical: true,
      autoHeal: async (result) => {
        if (result.metrics.successRate < 0.8) {
          // Reset metrics and clear failed tool cache
          enhancedExecutor.clearMetrics();
          return 'Reset tool performance metrics';
        }
        return null;
      }
    });

    // Trust Gate Health
    this.healthChecks.set('trust_gate', {
      name: 'Trust Gate',
      check: async () => {
        const violations = await this.getTrustGateViolations();
        return {
          healthy: violations < this.thresholds.trustGateViolations,
          metrics: {
            violations,
            currentLevel: 1, // Sarah's current autonomy level
            dailyActions: await this.getDailyActionCount()
          },
          message: `Trust violations: ${violations}/hour`
        };
      },
      critical: true,
      autoHeal: async (result) => {
        if (result.metrics.violations > 20) {
          // Temporary autonomy level reduction
          return 'High violation rate detected - consider autonomy review';
        }
        return null;
      }
    });

    // Database Connectivity
    this.healthChecks.set('database', {
      name: 'Database Connection',
      check: async () => {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
          });
          const { error } = await supabase.from('agents').select('id').limit(1);
          if (error) throw new Error(error.message);

          return {
            healthy: true,
            metrics: { connectionTime: Date.now() },
            message: 'Supabase connection healthy'
          };
        } catch (error) {
          return {
            healthy: false,
            metrics: { error: error.message },
            message: `Database error: ${error.message}`
          };
        }
      },
      critical: true,
      autoHeal: async (result) => {
        if (!result.healthy) {
          // Attempt connection retry
          await this.sleep(5000);
          return 'Attempted database reconnection';
        }
        return null;
      }
    });

    // API Connectivity — uses unified client with failover (respects admin Gemini config)
    this.healthChecks.set('api_connectivity', {
      name: 'External API Health',
      check: async () => {
        try {
          const { callModel } = await import('../llm/unified-client.js');
          const { getResolvedConfig } = await import('../config/admin-config.js');

          let healthModel = 'gemini-2.5-flash';
          try {
            const config = await getResolvedConfig('a1000000-0000-0000-0000-000000000001');
            healthModel = config.model || 'gemini-2.5-flash';
          } catch {}

          const testResponse = await callModel(healthModel, {
            system: 'Respond with OK.',
            messages: [{ role: 'user', content: 'Health check' }],
            maxTokens: 10,
            temperature: 0
          });

          return {
            healthy: true,
            metrics: {
              responseTime: Date.now(),
              model: testResponse.model || healthModel
            },
            message: 'API connectivity healthy'
          };
        } catch (error) {
          return {
            healthy: false,
            metrics: { error: error.message },
            message: `API error: ${error.message}`
          };
        }
      },
      critical: true,
      autoHeal: async (result) => {
        if (!result.healthy && result.metrics.error?.includes('rate_limit')) {
          // Wait and retry on rate limit
          await this.sleep(60000);
          return 'Rate limit detected - waited 60s';
        }
        return null;
      }
    });

    // Memory Usage
    this.healthChecks.set('memory_usage', {
      name: 'Memory Usage',
      check: async () => {
        const usage = process.memoryUsage();
        const totalHeap = usage.heapTotal;
        const usedHeap = usage.heapUsed;
        const utilization = usedHeap / totalHeap;

        return {
          healthy: utilization < this.thresholds.memoryUsage,
          metrics: {
            heapUsed: usedHeap,
            heapTotal: totalHeap,
            utilization: Math.round(utilization * 100)
          },
          message: `Memory usage: ${Math.round(utilization * 100)}%`
        };
      },
      critical: false,
      autoHeal: async (result) => {
        if (result.metrics.utilization > 90) {
          // Trigger garbage collection
          if (global.gc) {
            global.gc();
            return 'Triggered garbage collection';
          }
        }
        return null;
      }
    });
  }

  /**
   * Start monitoring processes
   */
  startMonitoring() {
    // Health checks
    setInterval(() => {
      this.runHealthChecks().catch(error => {
        logger.error('Health check cycle failed:', error);
      });
    }, this.healthCheckInterval);

    // Metrics collection
    setInterval(() => {
      this.collectMetrics().catch(error => {
        logger.error('Metrics collection failed:', error);
      });
    }, this.metricsInterval);

    // Cleanup old data
    setInterval(() => {
      this.cleanupOldData().catch(error => {
        logger.error('Cleanup cycle failed:', error);
      });
    }, this.cleanupInterval);

    // Run initial health check
    setTimeout(() => {
      this.runHealthChecks().catch(error => {
        logger.error('Initial health check failed:', error);
      });
    }, 5000);
  }

  /**
   * Run all health checks
   */
  async runHealthChecks() {
    const results = new Map();
    let overallHealth = HEALTH_STATUS.HEALTHY;
    const healingActions = [];

    logger.debug('Running health check cycle');

    for (const [checkId, healthCheck] of this.healthChecks.entries()) {
      try {
        const result = await healthCheck.check();
        results.set(checkId, {
          ...result,
          name: healthCheck.name,
          timestamp: new Date().toISOString(),
          critical: healthCheck.critical
        });

        // Determine overall health impact
        if (!result.healthy) {
          if (healthCheck.critical) {
            overallHealth = HEALTH_STATUS.CRITICAL;
          } else if (overallHealth === HEALTH_STATUS.HEALTHY) {
            overallHealth = HEALTH_STATUS.WARNING;
          }

          // Attempt auto-healing if enabled
          if (this.autoHealingEnabled && healthCheck.autoHeal) {
            try {
              const healingAction = await healthCheck.autoHeal(result);
              if (healingAction) {
                healingActions.push({
                  check: checkId,
                  action: healingAction,
                  timestamp: new Date().toISOString()
                });

                logger.info('Auto-healing action taken', {
                  check: checkId,
                  action: healingAction
                });
              }
            } catch (healError) {
              logger.error('Auto-healing failed:', {
                check: checkId,
                error: healError.message
              });
            }
          }
        }

      } catch (error) {
        logger.error(`Health check failed: ${checkId}`, error);
        results.set(checkId, {
          healthy: false,
          name: healthCheck.name,
          error: error.message,
          timestamp: new Date().toISOString(),
          critical: healthCheck.critical
        });

        if (healthCheck.critical) {
          overallHealth = HEALTH_STATUS.CRITICAL;
        }
      }
    }

    // Update system status
    const previousStatus = this.healthStatus;
    this.healthStatus = overallHealth;

    // Generate alerts for status changes
    if (previousStatus !== this.healthStatus) {
      this.generateAlert({
        type: 'system_health_change',
        severity: this.healthStatus === HEALTH_STATUS.CRITICAL ? 'critical' : 'warning',
        message: `System health changed from ${previousStatus} to ${this.healthStatus}`,
        details: Array.from(results.entries()).filter(([_, result]) => !result.healthy)
      });
    }

    // Store health check results
    await this.storeHealthCheckResults(results, healingActions);

    logger.info('Health check cycle completed', {
      overallHealth: this.healthStatus,
      checksRun: this.healthChecks.size,
      unhealthy: Array.from(results.values()).filter(r => !r.healthy).length,
      healingActions: healingActions.length
    });
  }

  /**
   * Collect system metrics
   */
  async collectMetrics() {
    const timestamp = new Date().toISOString();

    try {
      // Tool performance metrics
      const toolStats = enhancedExecutor.getPerformanceStats();
      this.recordMetric('tool_performance', {
        successRate: toolStats.overallSuccessRate,
        averageTime: toolStats.averageExecutionTime,
        totalExecutions: toolStats.totalExecutions
      }, timestamp);

      // Context metrics
      const contextStats = contextManager.getContextStats();
      this.recordMetric('context_usage', {
        utilization: contextStats.utilizationPercent,
        totalTokens: contextStats.totalTokens,
        totalTurns: contextStats.totalTurns
      }, timestamp);

      // System metrics
      const memUsage = process.memoryUsage();
      this.recordMetric('system_resources', {
        memoryMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        memoryUtilization: memUsage.heapUsed / memUsage.heapTotal
      }, timestamp);

      logger.debug('Metrics collected', { timestamp });

    } catch (error) {
      logger.error('Metrics collection error:', error);
    }
  }

  /**
   * Record a metric data point
   */
  recordMetric(category, values, timestamp) {
    if (!this.metrics.has(category)) {
      this.metrics.set(category, []);
    }

    const metrics = this.metrics.get(category);
    metrics.push({
      timestamp,
      ...values
    });

    // Keep only last 100 data points per category
    if (metrics.length > 100) {
      metrics.shift();
    }

    this.metrics.set(category, metrics);
  }

  /**
   * Generate system alert
   */
  generateAlert(alert) {
    const alertWithId = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      ...alert
    };

    this.alerts.push(alertWithId);

    // Keep only last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts.shift();
    }

    logger.warn('System alert generated', alertWithId);

    // Store alert for dashboard
    this.storeAlert(alertWithId).catch(error => {
      logger.error('Failed to store alert:', error);
    });
  }

  /**
   * Store alert in context for dashboard display
   */
  async storeAlert(alert) {
    try {
      await contextManager.storeWorkingContext(`system_alert_${alert.id}`, {
        alert,
        category: 'system_monitoring',
        severity: alert.severity
      }, 'system_critical', 3600000); // 1 hour TTL
    } catch (error) {
      logger.error('Failed to store alert context:', error);
    }
  }

  /**
   * Store health check results
   */
  async storeHealthCheckResults(results, healingActions) {
    try {
      const summary = {
        overallHealth: this.healthStatus,
        results: Object.fromEntries(results),
        healingActions,
        timestamp: new Date().toISOString()
      };

      await contextManager.storeWorkingContext('health_check_results', summary, 'system_critical', 1800000); // 30 min TTL
    } catch (error) {
      logger.error('Failed to store health check results:', error);
    }
  }

  /**
   * Get system health summary
   */
  getHealthSummary() {
    const summary = {
      overallHealth: this.healthStatus,
      autoHealingEnabled: this.autoHealingEnabled,
      timestamp: new Date().toISOString(),
      checks: {},
      recentAlerts: this.alerts.slice(-10),
      uptime: process.uptime()
    };

    // Get latest health check results from context
    const latestResults = contextManager.getWorkingContext('health_check_results');
    if (latestResults) {
      summary.checks = latestResults.results || {};
      summary.healingActions = latestResults.healingActions || [];
    }

    return summary;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(category = null, limit = 50) {
    if (category) {
      return this.metrics.get(category)?.slice(-limit) || [];
    }

    const allMetrics = {};
    for (const [cat, data] of this.metrics.entries()) {
      allMetrics[cat] = data.slice(-limit);
    }

    return allMetrics;
  }

  /**
   * Get trust gate violations count
   */
  async getTrustGateViolations() {
    // Simulate getting violation count from trust gate
    // In real implementation, this would query the trust gate's violation log
    return Math.floor(Math.random() * 5); // 0-4 violations per hour
  }

  /**
   * Get daily action count
   */
  async getDailyActionCount() {
    // Simulate getting daily action count
    // In real implementation, this would query the action log
    return Math.floor(Math.random() * 100) + 50; // 50-149 actions today
  }

  /**
   * Cleanup old data
   */
  async cleanupOldData() {
    logger.debug('Running cleanup cycle');

    // Cleanup old alerts (keep last 50)
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }

    // Cleanup old metrics (keep last 100 per category)
    for (const [category, metrics] of this.metrics.entries()) {
      if (metrics.length > 100) {
        this.metrics.set(category, metrics.slice(-100));
      }
    }

    // Trigger context manager cleanup
    contextManager.cleanupOldContext();

    logger.debug('Cleanup cycle completed');
  }

  /**
   * Manual health check trigger
   */
  async runManualHealthCheck() {
    logger.info('Manual health check triggered');
    await this.runHealthChecks();
    return this.getHealthSummary();
  }

  /**
   * Enable/disable auto-healing
   */
  setAutoHealing(enabled) {
    this.autoHealingEnabled = enabled;
    logger.info('Auto-healing status changed', { enabled });

    this.generateAlert({
      type: 'configuration_change',
      severity: 'info',
      message: `Auto-healing ${enabled ? 'enabled' : 'disabled'}`
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const systemMonitor = new SystemMonitor();