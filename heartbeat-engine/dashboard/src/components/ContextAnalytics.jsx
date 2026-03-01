import React, { useState, useEffect } from 'react';

function ContextAnalytics({ theme, refreshContext }) {
  const [contextData, setContextData] = useState({
    stats: null,
    modelUsage: null,
    memoryOptimization: null
  });
  const [activeView, setActiveView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchContextData();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('context', fetchContextData);
      return cleanup;
    } else {
      const interval = setInterval(fetchContextData, 30000);
      return () => clearInterval(interval);
    }
  }, [refreshContext]);

  const fetchContextData = async () => {
    try {
      // Simulate context analytics data - in real implementation from backend
      setContextData({
        stats: {
          totalTurns: 248,
          totalTokens: 156840,
          utilizationPercent: 78,
          workingContextSize: 12,
          averageTokensPerTurn: 632,
          distributionByPriority: {
            10: 8,    // system_critical
            9: 24,    // current_task
            8: 45,    // recent_actions
            7: 52,    // user_preferences
            6: 38,    // workflow_state
            5: 41,    // historical_context
            4: 28,    // background_info
            3: 12     // reference_data
          },
          distributionByType: {
            'current_task': 24,
            'assistant_response': 89,
            'tool_execution': 67,
            'tool_result': 45,
            'conversation': 23
          }
        },
        modelUsage: {
          currentModel: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          adaptiveEnabled: true,
          recentSwitches: [
            {
              timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
              from: 'claude-haiku-3-5-20250201',
              to: 'claude-sonnet-4-5-20250929',
              reason: 'Complex analysis task detected',
              useCase: 'analysis'
            },
            {
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              from: 'claude-sonnet-4-5-20250929',
              to: 'claude-haiku-3-5-20250201',
              reason: 'Quick response needed',
              useCase: 'quick_response'
            }
          ],
          tokenUsage: {
            'claude-sonnet-4-5-20250929': { input: 89420, output: 23650, cost: 15.23 },
            'claude-haiku-3-5-20250201': { input: 45280, output: 12100, cost: 3.45 },
          },
          capabilities: {
            supportsTools: true,
            supportsImages: true,
            maxTokens: 200000,
            contextWindow: 200000
          }
        },
        memoryOptimization: {
          compressionsToday: 3,
          lastCompressionAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          turnsCompressed: 45,
          summariesCreated: 8,
          memoryEfficiency: 0.89,
          cacheHitRate: 0.76,
          workingContextItems: [
            {
              key: 'current_task',
              priority: 9,
              size: 1240,
              lastAccessed: new Date(Date.now() - 5 * 60 * 1000).toISOString()
            },
            {
              key: 'contact_analysis_results',
              priority: 6,
              size: 2890,
              lastAccessed: new Date(Date.now() - 15 * 60 * 1000).toISOString()
            },
            {
              key: 'workflow_preferences',
              priority: 7,
              size: 560,
              lastAccessed: new Date(Date.now() - 30 * 60 * 1000).toISOString()
            }
          ]
        }
      });
      setError(null);
    } catch (error) {
      console.error('Failed to fetch context data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
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
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getUtilizationColor = (percent) => {
    if (percent >= 90) return '#EF4444';
    if (percent >= 75) return '#F59E0B';
    if (percent >= 50) return '#6366F1';
    return '#10B981';
  };

  const getPriorityColor = (priority) => {
    if (priority >= 9) return '#DC2626';
    if (priority >= 7) return '#EA580C';
    if (priority >= 5) return '#D97706';
    return '#059669';
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
    chartContainer: {
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
    priorityBars: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    priorityBar: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    priorityLabel: {
      fontSize: 11,
      color: '#6B7280',
      width: 80,
      textAlign: 'right',
    },
    priorityBarFill: {
      height: 8,
      borderRadius: 4,
      transition: 'width 0.3s ease',
    },
    priorityCount: {
      fontSize: 11,
      color: '#6B7280',
      fontWeight: '600',
      minWidth: 20,
    },
    modelInfo: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
    },
    modelCard: {
      padding: 16,
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      border: '1px solid #e5e7eb',
    },
    modelName: {
      fontSize: 14,
      fontWeight: '600',
      color: '#111827',
      marginBottom: 8,
    },
    modelMeta: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      fontSize: 12,
      color: '#6B7280',
    },
    switchHistory: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    switchItem: {
      padding: 8,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      fontSize: 12,
    },
    switchMeta: {
      color: '#6B7280',
      marginBottom: 4,
    },
    switchReason: {
      color: '#111827',
      fontWeight: '500',
    },
    contextList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    contextItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 8,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
    },
    contextKey: {
      fontSize: 12,
      fontWeight: '600',
      color: '#111827',
    },
    contextMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11,
      color: '#6B7280',
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
            <span style={styles.icon}>🧠</span>
            Context Analytics
          </h3>
        </div>
        <div style={styles.loadingState}>Loading context analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🧠</span>
            Context Analytics
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load context data: {error}
        </div>
      </div>
    );
  }

  const maxPriorityCount = Math.max(...Object.values(contextData.stats.distributionByPriority));

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>🧠</span>
          Context Analytics
        </h3>
      </div>

      <div style={styles.tabs}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'model', label: 'Model Usage' },
          { key: 'memory', label: 'Memory Optimization' }
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
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{contextData.stats.totalTurns}</div>
              <div style={styles.statLabel}>Total Turns</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{Math.round(contextData.stats.totalTokens / 1000)}K</div>
              <div style={styles.statLabel}>Total Tokens</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue} style={{
                color: getUtilizationColor(contextData.stats.utilizationPercent)
              }}>
                {contextData.stats.utilizationPercent}%
              </div>
              <div style={styles.statLabel}>Context Utilization</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{contextData.stats.workingContextSize}</div>
              <div style={styles.statLabel}>Working Context</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{contextData.stats.averageTokensPerTurn}</div>
              <div style={styles.statLabel}>Avg Tokens/Turn</div>
            </div>
          </div>

          <div style={styles.chartContainer}>
            <h4 style={styles.chartTitle}>Context Distribution by Priority</h4>
            <div style={styles.priorityBars}>
              {Object.entries(contextData.stats.distributionByPriority)
                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                .map(([priority, count]) => (
                  <div key={priority} style={styles.priorityBar}>
                    <div style={styles.priorityLabel}>Priority {priority}</div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          ...styles.priorityBarFill,
                          width: `${(count / maxPriorityCount) * 100}%`,
                          backgroundColor: getPriorityColor(parseInt(priority))
                        }}
                      />
                    </div>
                    <div style={styles.priorityCount}>{count}</div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {activeView === 'model' && (
        <>
          <div style={styles.modelInfo}>
            <div style={styles.modelCard}>
              <h4 style={styles.modelName}>{contextData.modelUsage.currentModel}</h4>
              <div style={styles.modelMeta}>
                <div>Provider: {contextData.modelUsage.provider}</div>
                <div>Adaptive: {contextData.modelUsage.adaptiveEnabled ? 'Enabled' : 'Disabled'}</div>
                <div>Max Tokens: {contextData.modelUsage.capabilities.maxTokens.toLocaleString()}</div>
                <div>Tools: {contextData.modelUsage.capabilities.supportsTools ? '✅' : '❌'}</div>
                <div>Images: {contextData.modelUsage.capabilities.supportsImages ? '✅' : '❌'}</div>
              </div>
            </div>

            <div style={styles.modelCard}>
              <h4 style={styles.modelName}>Token Usage</h4>
              <div style={styles.modelMeta}>
                {Object.entries(contextData.modelUsage.tokenUsage).map(([model, usage]) => (
                  <div key={model}>
                    <strong>{model.split('-')[1]}</strong>: {Math.round(usage.input / 1000)}K in, {Math.round(usage.output / 1000)}K out
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.chartContainer}>
            <h4 style={styles.chartTitle}>Recent Model Switches</h4>
            <div style={styles.switchHistory}>
              {contextData.modelUsage.recentSwitches.map((switchEvent, index) => (
                <div key={index} style={styles.switchItem}>
                  <div style={styles.switchMeta}>
                    {formatTimeAgo(switchEvent.timestamp)} • {switchEvent.from} → {switchEvent.to}
                  </div>
                  <div style={styles.switchReason}>{switchEvent.reason}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeView === 'memory' && (
        <>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{contextData.memoryOptimization.compressionsToday}</div>
              <div style={styles.statLabel}>Compressions Today</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{contextData.memoryOptimization.turnsCompressed}</div>
              <div style={styles.statLabel}>Turns Compressed</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{contextData.memoryOptimization.summariesCreated}</div>
              <div style={styles.statLabel}>Summaries Created</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{Math.round(contextData.memoryOptimization.memoryEfficiency * 100)}%</div>
              <div style={styles.statLabel}>Memory Efficiency</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{Math.round(contextData.memoryOptimization.cacheHitRate * 100)}%</div>
              <div style={styles.statLabel}>Cache Hit Rate</div>
            </div>
          </div>

          <div style={styles.chartContainer}>
            <h4 style={styles.chartTitle}>Working Context Items</h4>
            <div style={styles.contextList}>
              {contextData.memoryOptimization.workingContextItems.map((item, index) => (
                <div key={index} style={styles.contextItem}>
                  <div style={styles.contextKey}>{item.key}</div>
                  <div style={styles.contextMeta}>
                    <span style={{
                      padding: '2px 6px',
                      backgroundColor: getPriorityColor(item.priority),
                      color: 'white',
                      borderRadius: 4,
                      fontSize: 10
                    }}>
                      P{item.priority}
                    </span>
                    <span>{formatBytes(item.size)}</span>
                    <span>{formatTimeAgo(item.lastAccessed)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ContextAnalytics;