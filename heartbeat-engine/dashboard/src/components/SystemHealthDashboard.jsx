import React, { useState, useEffect } from 'react';

function SystemHealthDashboard({ theme, refreshContext }) {
  const [systemData, setSystemData] = useState({
    health: null,
    metrics: {},
    alerts: [],
    uptime: 0
  });
  const [activeView, setActiveView] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSystemData();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('system', fetchSystemData);
      return cleanup;
    } else if (autoRefresh) {
      const interval = setInterval(fetchSystemData, 15000); // 15 second refresh for health data
      return () => clearInterval(interval);
    }
  }, [refreshContext, autoRefresh]);

  const fetchSystemData = async () => {
    try {
      // Simulate comprehensive system health data
      setSystemData({
        health: {
          overallHealth: 'healthy', // healthy, warning, critical, maintenance
          autoHealingEnabled: true,
          timestamp: new Date().toISOString(),
          uptime: 8640000, // 2.4 hours in milliseconds
          checks: {
            'context_manager': {
              healthy: true,
              name: 'Context Manager',
              metrics: { utilization: 67, totalTurns: 248, totalTokens: 156840, workingContextSize: 12 },
              message: 'Context utilization: 67%',
              critical: false,
              timestamp: new Date(Date.now() - 30000).toISOString()
            },
            'tool_performance': {
              healthy: true,
              name: 'Tool Performance',
              metrics: { successRate: 0.947, averageTime: 1245, totalExecutions: 1847 },
              message: 'Tool success rate: 95%',
              critical: true,
              timestamp: new Date(Date.now() - 30000).toISOString()
            },
            'trust_gate': {
              healthy: true,
              name: 'Trust Gate',
              metrics: { violations: 2, currentLevel: 1, dailyActions: 127 },
              message: 'Trust violations: 2/hour',
              critical: true,
              timestamp: new Date(Date.now() - 30000).toISOString()
            },
            'database': {
              healthy: true,
              name: 'Database Connection',
              metrics: { connectionTime: Date.now() - 150 },
              message: 'Database connection healthy',
              critical: true,
              timestamp: new Date(Date.now() - 30000).toISOString()
            },
            'api_connectivity': {
              healthy: false,
              name: 'External API Health',
              metrics: { error: 'Rate limit exceeded' },
              message: 'API error: Rate limit exceeded',
              critical: true,
              timestamp: new Date(Date.now() - 30000).toISOString()
            },
            'memory_usage': {
              healthy: true,
              name: 'Memory Usage',
              metrics: { heapUsed: 89234567, heapTotal: 134217728, utilization: 67 },
              message: 'Memory usage: 67%',
              critical: false,
              timestamp: new Date(Date.now() - 30000).toISOString()
            }
          },
          healingActions: [
            {
              check: 'api_connectivity',
              action: 'Rate limit detected - waited 60s',
              timestamp: new Date(Date.now() - 60000).toISOString()
            }
          ]
        },
        metrics: {
          tool_performance: [
            { timestamp: new Date(Date.now() - 300000).toISOString(), successRate: 0.945, averageTime: 1200, totalExecutions: 1820 },
            { timestamp: new Date(Date.now() - 240000).toISOString(), successRate: 0.943, averageTime: 1220, totalExecutions: 1835 },
            { timestamp: new Date(Date.now() - 180000).toISOString(), successRate: 0.946, averageTime: 1235, totalExecutions: 1840 },
            { timestamp: new Date(Date.now() - 120000).toISOString(), successRate: 0.948, averageTime: 1240, totalExecutions: 1845 },
            { timestamp: new Date(Date.now() - 60000).toISOString(), successRate: 0.947, averageTime: 1245, totalExecutions: 1847 }
          ],
          context_usage: [
            { timestamp: new Date(Date.now() - 300000).toISOString(), utilization: 62, totalTokens: 148000, totalTurns: 235 },
            { timestamp: new Date(Date.now() - 240000).toISOString(), utilization: 64, totalTokens: 152000, totalTurns: 240 },
            { timestamp: new Date(Date.now() - 180000).toISOString(), utilization: 65, totalTokens: 154000, totalTurns: 243 },
            { timestamp: new Date(Date.now() - 120000).toISOString(), utilization: 66, totalTokens: 155500, totalTurns: 246 },
            { timestamp: new Date(Date.now() - 60000).toISOString(), utilization: 67, totalTokens: 156840, totalTurns: 248 }
          ],
          system_resources: [
            { timestamp: new Date(Date.now() - 300000).toISOString(), memoryMB: 82, memoryUtilization: 0.63 },
            { timestamp: new Date(Date.now() - 240000).toISOString(), memoryMB: 84, memoryUtilization: 0.64 },
            { timestamp: new Date(Date.now() - 180000).toISOString(), memoryMB: 85, memoryUtilization: 0.65 },
            { timestamp: new Date(Date.now() - 120000).toISOString(), memoryMB: 87, memoryUtilization: 0.66 },
            { timestamp: new Date(Date.now() - 60000).toISOString(), memoryMB: 85, memoryUtilization: 0.67 }
          ]
        },
        alerts: [
          {
            id: 'alert-1709834567890-abc123',
            timestamp: new Date(Date.now() - 60000).toISOString(),
            type: 'api_rate_limit',
            severity: 'warning',
            message: 'API rate limit exceeded - auto-healing applied',
            details: { service: 'Claude API', action: 'waited_60s' }
          },
          {
            id: 'alert-1709834567891-def456',
            timestamp: new Date(Date.now() - 180000).toISOString(),
            type: 'context_compression',
            severity: 'info',
            message: 'Context compression triggered at 85% utilization',
            details: { beforeTokens: 165000, afterTokens: 142000, compressionRatio: 0.14 }
          }
        ],
        uptime: 8640000
      });
      setError(null);
    } catch (error) {
      console.error('Failed to fetch system data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (uptimeMs) => {
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m ${seconds % 60}s`;
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffHours > 0) return `${diffHours}h ago`;
    return `${diffMins}m ago`;
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getHealthColor = (status) => {
    switch (status) {
      case 'healthy': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'critical': return '#EF4444';
      case 'maintenance': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'info': return '#6366F1';
      case 'warning': return '#F59E0B';
      case 'critical': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getCheckIcon = (healthy, critical) => {
    if (healthy) return '✅';
    return critical ? '🔴' : '⚠️';
  };

  const runManualHealthCheck = async () => {
    setLoading(true);
    // Simulate manual health check
    await new Promise(resolve => setTimeout(resolve, 2000));
    await fetchSystemData();
  };

  const toggleAutoHealing = async () => {
    // Simulate toggling auto-healing
    setSystemData(prev => ({
      ...prev,
      health: {
        ...prev.health,
        autoHealingEnabled: !prev.health.autoHealingEnabled
      }
    }));
  };

  const styles = {
    container: {
      backgroundColor: '#ffffff',
      borderRadius: 8,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e5e7eb',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: '#111827',
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    icon: {
      fontSize: 20,
    },
    controls: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    button: {
      padding: '6px 12px',
      backgroundColor: '#6366F1',
      color: 'white',
      border: 'none',
      borderRadius: 4,
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: '500',
      transition: 'background-color 0.2s',
    },
    tabs: {
      display: 'flex',
      gap: 4,
      marginBottom: 16,
      borderBottom: '1px solid #e5e7eb',
    },
    tab: {
      padding: '8px 16px',
      backgroundColor: 'transparent',
      border: 'none',
      borderBottom: '2px solid transparent',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: '500',
      color: '#6B7280',
      transition: 'all 0.2s',
    },
    activeTab: {
      color: '#6366F1',
      borderBottomColor: '#6366F1',
    },
    healthOverview: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: 16,
      marginBottom: 20,
    },
    healthCard: {
      padding: 16,
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      border: '1px solid #e5e7eb',
    },
    healthStatus: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    statusIndicator: {
      width: 12,
      height: 12,
      borderRadius: '50%',
    },
    statusText: {
      fontSize: 16,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    healthMeta: {
      fontSize: 11,
      color: '#6B7280',
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
    },
    checksGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: 12,
    },
    checkCard: {
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
    },
    checkHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    checkName: {
      fontSize: 13,
      fontWeight: '600',
      color: '#111827',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    checkMessage: {
      fontSize: 11,
      color: '#6B7280',
      marginBottom: 8,
    },
    checkMetrics: {
      display: 'flex',
      gap: 12,
      fontSize: 10,
      color: '#6B7280',
    },
    metricsChart: {
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
    },
    chartTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 12,
    },
    alertsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    alertItem: {
      padding: 10,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
    },
    alertHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    alertMessage: {
      fontSize: 12,
      color: '#111827',
      fontWeight: '500',
    },
    alertMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10,
      color: '#6B7280',
    },
    severityBadge: {
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 9,
      fontWeight: '500',
      color: 'white',
    },
    healingActions: {
      marginTop: 16,
      padding: 12,
      backgroundColor: '#F0F9FF',
      borderRadius: 6,
      border: '1px solid #BAE6FD',
    },
    healingTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: '#0284C7',
      marginBottom: 8,
    },
    healingList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    healingItem: {
      fontSize: 11,
      color: '#0369A1',
    },
    loadingState: {
      textAlign: 'center',
      padding: 20,
      color: '#6B7280',
    },
    errorState: {
      textAlign: 'center',
      padding: 20,
      color: '#EF4444',
      backgroundColor: '#FEF2F2',
      borderRadius: 6,
      border: '1px solid #FECACA',
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🏥</span>
            System Health
          </h3>
        </div>
        <div style={styles.loadingState}>Loading system health data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🏥</span>
            System Health
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load system data: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>🏥</span>
          System Health
        </h3>
        <div style={styles.controls}>
          <button
            style={{
              ...styles.button,
              backgroundColor: autoRefresh ? '#10B981' : '#6B7280'
            }}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
          </button>
          <button
            style={styles.button}
            onClick={runManualHealthCheck}
            disabled={loading}
          >
            Manual Check
          </button>
          <button
            style={{
              ...styles.button,
              backgroundColor: systemData.health.autoHealingEnabled ? '#10B981' : '#EF4444'
            }}
            onClick={toggleAutoHealing}
          >
            Auto-Heal {systemData.health.autoHealingEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'checks', label: 'Health Checks' },
          { key: 'metrics', label: 'Metrics' },
          { key: 'alerts', label: 'Alerts' }
        ].map((tab) => (
          <button
            key={tab.key}
            style={{
              ...styles.tab,
              ...(activeView === tab.key ? styles.activeTab : {})
            }}
            onClick={() => setActiveView(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeView === 'overview' && (
        <>
          <div style={styles.healthOverview}>
            <div style={styles.healthCard}>
              <div style={styles.healthStatus}>
                <div style={{
                  ...styles.statusIndicator,
                  backgroundColor: getHealthColor(systemData.health.overallHealth)
                }} />
                <span style={{
                  ...styles.statusText,
                  color: getHealthColor(systemData.health.overallHealth)
                }}>
                  {systemData.health.overallHealth}
                </span>
              </div>
              <div style={styles.healthMeta}>
                <span>Overall System Health</span>
                <span>Last check: {formatTimeAgo(systemData.health.timestamp)}</span>
              </div>
            </div>

            <div style={styles.healthCard}>
              <div style={styles.healthStatus}>
                <span style={styles.statusText}>⏱️ {formatUptime(systemData.health.uptime)}</span>
              </div>
              <div style={styles.healthMeta}>
                <span>System Uptime</span>
                <span>Started: {new Date(Date.now() - systemData.health.uptime).toLocaleString()}</span>
              </div>
            </div>

            <div style={styles.healthCard}>
              <div style={styles.healthStatus}>
                <span style={styles.statusText}>
                  {systemData.health.autoHealingEnabled ? '🔧 Enabled' : '❌ Disabled'}
                </span>
              </div>
              <div style={styles.healthMeta}>
                <span>Auto-Healing</span>
                <span>{systemData.health.healingActions.length} actions today</span>
              </div>
            </div>
          </div>

          {systemData.health.healingActions.length > 0 && (
            <div style={styles.healingActions}>
              <div style={styles.healingTitle}>Recent Auto-Healing Actions</div>
              <div style={styles.healingList}>
                {systemData.health.healingActions.slice(-3).map((action, index) => (
                  <div key={index} style={styles.healingItem}>
                    {formatTimeAgo(action.timestamp)}: {action.action} ({action.check})
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeView === 'checks' && (
        <div style={styles.checksGrid}>
          {Object.entries(systemData.health.checks).map(([checkId, check]) => (
            <div key={checkId} style={styles.checkCard}>
              <div style={styles.checkHeader}>
                <div style={styles.checkName}>
                  {getCheckIcon(check.healthy, check.critical)}
                  {check.name}
                </div>
                <span style={{ fontSize: 9, color: '#6B7280' }}>
                  {formatTimeAgo(check.timestamp)}
                </span>
              </div>
              <div style={styles.checkMessage}>{check.message}</div>
              {check.metrics && (
                <div style={styles.checkMetrics}>
                  {Object.entries(check.metrics).map(([key, value]) => (
                    <span key={key}>
                      {key}: {typeof value === 'number' ? Math.round(value) : value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeView === 'metrics' && (
        <>
          <div style={styles.metricsChart}>
            <h4 style={styles.chartTitle}>Tool Performance Trend</h4>
            <div style={{ fontSize: 11, color: '#6B7280' }}>
              {systemData.metrics.tool_performance?.slice(-1)[0] && (
                <span>
                  Latest: {Math.round(systemData.metrics.tool_performance.slice(-1)[0].successRate * 100)}% success rate,
                  {Math.round(systemData.metrics.tool_performance.slice(-1)[0].averageTime)}ms avg time
                </span>
              )}
            </div>
          </div>

          <div style={styles.metricsChart}>
            <h4 style={styles.chartTitle}>Context Usage Trend</h4>
            <div style={{ fontSize: 11, color: '#6B7280' }}>
              {systemData.metrics.context_usage?.slice(-1)[0] && (
                <span>
                  Latest: {systemData.metrics.context_usage.slice(-1)[0].utilization}% utilization,
                  {Math.round(systemData.metrics.context_usage.slice(-1)[0].totalTokens / 1000)}K tokens
                </span>
              )}
            </div>
          </div>

          <div style={styles.metricsChart}>
            <h4 style={styles.chartTitle}>System Resources</h4>
            <div style={{ fontSize: 11, color: '#6B7280' }}>
              {systemData.metrics.system_resources?.slice(-1)[0] && (
                <span>
                  Latest: {systemData.metrics.system_resources.slice(-1)[0].memoryMB}MB memory usage,
                  {Math.round(systemData.metrics.system_resources.slice(-1)[0].memoryUtilization * 100)}% utilization
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {activeView === 'alerts' && (
        <div style={styles.alertsList}>
          {systemData.alerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>
              No recent alerts
            </div>
          ) : (
            systemData.alerts.map((alert) => (
              <div key={alert.id} style={styles.alertItem}>
                <div style={styles.alertHeader}>
                  <div style={styles.alertMessage}>{alert.message}</div>
                  <div style={styles.alertMeta}>
                    <span style={{
                      ...styles.severityBadge,
                      backgroundColor: getSeverityColor(alert.severity)
                    }}>
                      {alert.severity}
                    </span>
                    <span>{formatTimeAgo(alert.timestamp)}</span>
                  </div>
                </div>
                {alert.details && (
                  <div style={{ fontSize: 10, color: '#6B7280', marginTop: 4 }}>
                    {JSON.stringify(alert.details)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SystemHealthDashboard;