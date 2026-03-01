import React, { useState, useEffect } from 'react';

function ToolPerformance({ theme, refreshContext }) {
  const [performanceData, setPerformanceData] = useState({
    stats: null,
    activeExecutions: [],
    recentHistory: [],
    retryAnalysis: null
  });
  const [activeView, setActiveView] = useState('overview');
  const [selectedTool, setSelectedTool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPerformanceData();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('performance', fetchPerformanceData);
      return cleanup;
    } else {
      const interval = setInterval(fetchPerformanceData, 15000); // More frequent for performance data
      return () => clearInterval(interval);
    }
  }, [refreshContext]);

  const fetchPerformanceData = async () => {
    try {
      // Simulate enhanced tool performance data
      setPerformanceData({
        stats: {
          totalTools: 26,
          totalExecutions: 1847,
          overallSuccessRate: 0.947,
          averageExecutionTime: 1245,
          toolStats: {
            'ghl_search_contacts': {
              executions: 234,
              totalTime: 187500,
              successCount: 229,
              failureCount: 5,
              retryCount: 12,
              averageTime: 801,
              successRate: 0.979
            },
            'ghl_send_message': {
              executions: 156,
              totalTime: 298400,
              successCount: 142,
              failureCount: 14,
              retryCount: 28,
              averageTime: 1913,
              successRate: 0.910
            },
            'bloom_delegate_task': {
              executions: 67,
              totalTime: 456700,
              successCount: 64,
              failureCount: 3,
              retryCount: 8,
              averageTime: 6815,
              successRate: 0.955
            },
            'bloom_log_decision': {
              executions: 189,
              totalTime: 94500,
              successCount: 189,
              failureCount: 0,
              retryCount: 2,
              averageTime: 500,
              successRate: 1.0
            },
            'ghl_create_contact': {
              executions: 89,
              totalTime: 267000,
              successCount: 83,
              failureCount: 6,
              retryCount: 18,
              averageTime: 3000,
              successRate: 0.933
            }
          }
        },
        activeExecutions: [
          {
            id: 'exec-1709834567890-abc123',
            toolName: 'ghl_search_contacts',
            status: 'retrying',
            attempts: 2,
            startTime: Date.now() - 5000,
            duration: 5000
          },
          {
            id: 'exec-1709834567891-def456',
            toolName: 'bloom_analyze_patterns',
            status: 'success',
            attempts: 1,
            startTime: Date.now() - 12000,
            duration: 12000
          }
        ],
        recentHistory: [
          {
            id: 'exec-1709834567892-ghi789',
            toolName: 'ghl_update_contact',
            status: 'success',
            attempts: 1,
            totalTime: 1450,
            startTime: Date.now() - 45000,
            endTime: Date.now() - 43550
          },
          {
            id: 'exec-1709834567893-jkl012',
            toolName: 'ghl_send_message',
            status: 'failed',
            attempts: 3,
            totalTime: 8900,
            startTime: Date.now() - 120000,
            endTime: Date.now() - 111100
          },
          {
            id: 'exec-1709834567894-mno345',
            toolName: 'bloom_create_task',
            status: 'success',
            attempts: 1,
            totalTime: 670,
            startTime: Date.now() - 180000,
            endTime: Date.now() - 179330
          },
          {
            id: 'exec-1709834567895-pqr678',
            toolName: 'ghl_get_contact',
            status: 'success',
            attempts: 2,
            totalTime: 2340,
            startTime: Date.now() - 300000,
            endTime: Date.now() - 297660
          }
        ],
        retryAnalysis: {
          totalRetries: 89,
          retryRate: 0.048,
          mostRetriedTool: 'ghl_send_message',
          retryReasons: {
            'rate_limit': 34,
            'timeout': 28,
            'service_unavailable': 15,
            'network_error': 12
          },
          retryEffectiveness: 0.876 // Success rate after retry
        }
      });
      setError(null);
    } catch (error) {
      console.error('Failed to fetch performance data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
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

  const getSuccessRateColor = (rate) => {
    if (rate >= 0.95) return '#10B981';
    if (rate >= 0.9) return '#6366F1';
    if (rate >= 0.8) return '#F59E0B';
    return '#EF4444';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return '#10B981';
      case 'failed': return '#EF4444';
      case 'retrying': return '#F59E0B';
      case 'timeout': return '#EF4444';
      case 'blocked': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getPerformanceRating = (avgTime, successRate) => {
    const timeScore = avgTime < 1000 ? 3 : avgTime < 3000 ? 2 : 1;
    const successScore = successRate >= 0.95 ? 3 : successRate >= 0.9 ? 2 : 1;
    const total = timeScore + successScore;

    if (total >= 5) return { rating: 'Excellent', color: '#10B981' };
    if (total >= 4) return { rating: 'Good', color: '#6366F1' };
    if (total >= 3) return { rating: 'Fair', color: '#F59E0B' };
    return { rating: 'Poor', color: '#EF4444' };
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
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 12,
      marginBottom: 20,
    },
    statCard: {
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      textAlign: 'center',
    },
    statValue: {
      fontSize: 18,
      fontWeight: '700',
      color: '#111827',
      margin: 0,
    },
    statLabel: {
      fontSize: 11,
      color: '#6B7280',
      marginTop: 4,
    },
    toolsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    toolCard: {
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      border: '1px solid #e5e7eb',
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    selectedToolCard: {
      backgroundColor: '#EBF4FF',
      borderColor: '#6366F1',
    },
    toolHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    toolName: {
      fontSize: 13,
      fontWeight: '600',
      color: '#111827',
      fontFamily: 'monospace',
    },
    toolRating: {
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: '500',
      color: 'white',
    },
    toolMetrics: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 8,
      fontSize: 11,
      color: '#6B7280',
    },
    metric: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    },
    metricValue: {
      fontWeight: '600',
      color: '#111827',
    },
    executionsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    executionItem: {
      padding: 10,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
    },
    executionHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    executionId: {
      fontSize: 11,
      fontFamily: 'monospace',
      color: '#6B7280',
    },
    executionMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11,
      color: '#6B7280',
    },
    statusBadge: {
      padding: '2px 6px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: '500',
      color: 'white',
    },
    retryChart: {
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
    retryBars: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    retryBar: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    retryLabel: {
      fontSize: 11,
      color: '#6B7280',
      width: 100,
      textAlign: 'right',
    },
    retryBarFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: '#F59E0B',
      transition: 'width 0.3s ease',
    },
    retryCount: {
      fontSize: 11,
      color: '#6B7280',
      fontWeight: '600',
      minWidth: 20,
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
            <span style={styles.icon}>⚡</span>
            Tool Performance
          </h3>
        </div>
        <div style={styles.loadingState}>Loading performance data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>⚡</span>
            Tool Performance
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load performance data: {error}
        </div>
      </div>
    );
  }

  const maxRetryCount = Math.max(...Object.values(performanceData.retryAnalysis.retryReasons));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>⚡</span>
          Tool Performance
        </h3>
      </div>

      <div style={styles.tabs}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'tools', label: 'Tool Stats' },
          { key: 'active', label: 'Active' },
          { key: 'retries', label: 'Retry Analysis' }
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
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{performanceData.stats.totalTools}</div>
            <div style={styles.statLabel}>Total Tools</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{performanceData.stats.totalExecutions.toLocaleString()}</div>
            <div style={styles.statLabel}>Total Executions</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue} style={{
              color: getSuccessRateColor(performanceData.stats.overallSuccessRate)
            }}>
              {Math.round(performanceData.stats.overallSuccessRate * 100)}%
            </div>
            <div style={styles.statLabel}>Success Rate</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{formatDuration(performanceData.stats.averageExecutionTime)}</div>
            <div style={styles.statLabel}>Avg Execution Time</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{performanceData.retryAnalysis.totalRetries}</div>
            <div style={styles.statLabel}>Total Retries</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{Math.round(performanceData.retryAnalysis.retryEffectiveness * 100)}%</div>
            <div style={styles.statLabel}>Retry Success Rate</div>
          </div>
        </div>
      )}

      {activeView === 'tools' && (
        <div style={styles.toolsList}>
          {Object.entries(performanceData.stats.toolStats).map(([toolName, stats]) => {
            const performance = getPerformanceRating(stats.averageTime, stats.successRate);
            return (
              <div
                key={toolName}
                style={{
                  ...styles.toolCard,
                  ...(selectedTool === toolName ? styles.selectedToolCard : {})
                }}
                onClick={() => setSelectedTool(selectedTool === toolName ? null : toolName)}
              >
                <div style={styles.toolHeader}>
                  <div style={styles.toolName}>{toolName}</div>
                  <div style={{
                    ...styles.toolRating,
                    backgroundColor: performance.color
                  }}>
                    {performance.rating}
                  </div>
                </div>
                <div style={styles.toolMetrics}>
                  <div style={styles.metric}>
                    <div style={styles.metricValue}>{stats.executions}</div>
                    <div>Executions</div>
                  </div>
                  <div style={styles.metric}>
                    <div style={{
                      ...styles.metricValue,
                      color: getSuccessRateColor(stats.successRate)
                    }}>
                      {Math.round(stats.successRate * 100)}%
                    </div>
                    <div>Success Rate</div>
                  </div>
                  <div style={styles.metric}>
                    <div style={styles.metricValue}>{formatDuration(stats.averageTime)}</div>
                    <div>Avg Time</div>
                  </div>
                  <div style={styles.metric}>
                    <div style={styles.metricValue}>{stats.retryCount}</div>
                    <div>Retries</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeView === 'active' && (
        <div style={styles.executionsList}>
          <h4 style={styles.chartTitle}>Active Executions</h4>
          {performanceData.activeExecutions.map((execution) => (
            <div key={execution.id} style={styles.executionItem}>
              <div style={styles.executionHeader}>
                <div style={styles.toolName}>{execution.toolName}</div>
                <div style={styles.executionMeta}>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: getStatusColor(execution.status)
                  }}>
                    {execution.status}
                  </span>
                  <span>Attempt {execution.attempts}</span>
                  <span>{formatDuration(execution.duration)}</span>
                </div>
              </div>
              <div style={styles.executionId}>ID: {execution.id}</div>
            </div>
          ))}

          <h4 style={styles.chartTitle}>Recent History</h4>
          {performanceData.recentHistory.map((execution) => (
            <div key={execution.id} style={styles.executionItem}>
              <div style={styles.executionHeader}>
                <div style={styles.toolName}>{execution.toolName}</div>
                <div style={styles.executionMeta}>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: getStatusColor(execution.status)
                  }}>
                    {execution.status}
                  </span>
                  <span>{execution.attempts > 1 ? `${execution.attempts} attempts` : '1 attempt'}</span>
                  <span>{formatDuration(execution.totalTime)}</span>
                  <span>{formatTimeAgo(execution.endTime)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeView === 'retries' && (
        <div style={styles.retryChart}>
          <h4 style={styles.chartTitle}>Retry Reasons Analysis</h4>
          <div style={styles.retryBars}>
            {Object.entries(performanceData.retryAnalysis.retryReasons).map(([reason, count]) => (
              <div key={reason} style={styles.retryBar}>
                <div style={styles.retryLabel}>{reason.replace('_', ' ')}</div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      ...styles.retryBarFill,
                      width: `${(count / maxRetryCount) * 100}%`
                    }}
                  />
                </div>
                <div style={styles.retryCount}>{count}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: '#6B7280' }}>
            <strong>Most Retried Tool:</strong> {performanceData.retryAnalysis.mostRetriedTool}<br />
            <strong>Overall Retry Rate:</strong> {Math.round(performanceData.retryAnalysis.retryRate * 100)}%<br />
            <strong>Retry Effectiveness:</strong> {Math.round(performanceData.retryAnalysis.retryEffectiveness * 100)}% success after retry
          </div>
        </div>
      )}
    </div>
  );
}

export default ToolPerformance;