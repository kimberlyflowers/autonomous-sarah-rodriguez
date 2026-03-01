import React, { useState, useEffect } from 'react';

function AgenticExecutions({ theme, refreshContext }) {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchExecutions();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('executions', fetchExecutions);
      return cleanup;
    } else {
      const interval = setInterval(fetchExecutions, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [refreshContext]);

  const fetchExecutions = async () => {
    try {
      const response = await fetch('/api/execute/active');
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
        setError(null);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch executions:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#10B981'; // Green
      case 'completed': return '#6366F1'; // Blue
      case 'failed': return '#EF4444'; // Red
      default: return '#6B7280'; // Gray
    }
  };

  const formatDuration = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
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
    count: {
      backgroundColor: executions.length > 0 ? '#10B981' : '#6B7280',
      color: 'white',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: '500',
    },
    executionList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    executionItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
    },
    executionInfo: {
      flex: 1,
    },
    executionId: {
      fontSize: 12,
      color: '#6B7280',
      fontFamily: 'monospace',
    },
    executionTask: {
      fontSize: 14,
      fontWeight: '500',
      color: '#111827',
      marginTop: 2,
    },
    executionMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      fontSize: 12,
      color: '#6B7280',
    },
    statusIndicator: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
    },
    emptyState: {
      textAlign: 'center',
      padding: 40,
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
            <span style={styles.icon}>🤖</span>
            Agentic Executions
          </h3>
        </div>
        <div style={styles.loadingState}>Loading executions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🤖</span>
            Agentic Executions
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load executions: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>🤖</span>
          Agentic Executions
        </h3>
        <span style={styles.count}>{executions.length}</span>
      </div>

      {executions.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎯</div>
          <div>No active executions</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Sarah is ready to execute autonomous tasks
          </div>
        </div>
      ) : (
        <div style={styles.executionList}>
          {executions.map((execution) => (
            <div key={execution.executionId} style={styles.executionItem}>
              <div style={styles.executionInfo}>
                <div style={styles.executionId}>
                  ID: {execution.executionId}
                </div>
                <div style={styles.executionTask}>
                  {execution.task}
                </div>
                <div style={styles.executionMeta}>
                  <div style={styles.statusIndicator}>
                    <div
                      style={{
                        ...styles.statusDot,
                        backgroundColor: getStatusColor(execution.status)
                      }}
                    />
                    {execution.status}
                  </div>
                  <div>Runtime: {formatDuration(execution.runtime)}</div>
                  <div>Agent: {execution.agentId}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgenticExecutions;