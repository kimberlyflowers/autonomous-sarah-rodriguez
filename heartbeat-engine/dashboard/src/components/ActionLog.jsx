import React, { useState, useEffect } from 'react';

function ActionLog({ theme, refreshContext }) {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchActions();

    // Register for refresh callbacks if refresh context is available
    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('actions', fetchActions);
      return cleanup;
    }
  }, [refreshContext]);

  const fetchActions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/actions?limit=30');

      if (response.ok) {
        const data = await response.json();
        setActions(data.actions || []);
        setError(null);
      } else {
        throw new Error('Failed to fetch actions');
      }
    } catch (error) {
      console.error('Failed to fetch actions:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    card: {
      backgroundColor: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    },
    title: {
      fontSize: 18,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    loading: {
      textAlign: 'center',
      padding: 20,
      color: theme.textMuted,
    },
    error: {
      padding: 16,
      backgroundColor: '#FEF2F2',
      border: '1px solid #FECACA',
      borderRadius: 8,
      color: '#DC2626',
      fontSize: 14,
    },
    actionsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    },
    action: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 0',
      borderBottom: `1px solid ${theme.border}`,
    },
    actionLastChild: {
      borderBottom: 'none',
    },
    statusIcon: {
      width: 20,
      height: 20,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 600,
      marginTop: 2,
      flexShrink: 0,
    },
    successIcon: {
      backgroundColor: theme.success,
      color: 'white',
    },
    failureIcon: {
      backgroundColor: theme.error,
      color: 'white',
    },
    actionContent: {
      flex: 1,
      minWidth: 0,
    },
    actionHeader: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 4,
    },
    actionType: {
      fontSize: 14,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 2,
    },
    actionDescription: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 1.4,
      marginBottom: 6,
    },
    actionMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: theme.textMuted,
    },
    targetSystem: {
      padding: '2px 6px',
      backgroundColor: theme.bg,
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
    },
    timestamp: {
      fontWeight: 500,
    },
    empty: {
      textAlign: 'center',
      padding: 40,
      color: theme.textMuted,
    },
  };

  const formatActionType = (type) => {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const actionTime = new Date(timestamp);
    const diffMs = now - actionTime;
    const diffMins = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return actionTime.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  };

  const getSystemColor = (system) => {
    const colors = {
      'GHL': theme.accent,
      'EMAIL': theme.accent2,
      'CALENDAR': theme.success,
      'TASK': theme.textMuted
    };
    return colors[system] || theme.textMuted;
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>✅ Actions Taken</h2>
        <div style={styles.loading}>Loading actions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>✅ Actions Taken</h2>
        <div style={styles.error}>Failed to load actions: {error}</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>
        ✅ Actions Taken
        <span style={{ fontSize: 14, fontWeight: 400, color: theme.textMuted }}>
          ({actions.length} recent)
        </span>
      </h2>

      {actions.length === 0 ? (
        <div style={styles.empty}>No actions taken yet</div>
      ) : (
        <div style={styles.actionsList}>
          {actions.map((action, index) => (
            <div
              key={action.id}
              style={{
                ...styles.action,
                ...(index === actions.length - 1 ? styles.actionLastChild : {}),
              }}
            >
              <div style={{
                ...styles.statusIcon,
                ...(action.success ? styles.successIcon : styles.failureIcon),
              }}>
                {action.success ? '✓' : '✗'}
              </div>

              <div style={styles.actionContent}>
                <div style={styles.actionHeader}>
                  <div>
                    <div style={styles.actionType}>
                      {formatActionType(action.type)}
                    </div>
                    <div style={styles.actionDescription}>
                      {action.description}
                    </div>
                  </div>
                </div>

                <div style={styles.actionMeta}>
                  <span style={styles.timestamp}>
                    {formatTimestamp(action.timestamp)}
                  </span>
                  {action.targetSystem && (
                    <span style={{
                      ...styles.targetSystem,
                      backgroundColor: getSystemColor(action.targetSystem) + '20',
                      color: getSystemColor(action.targetSystem),
                    }}>
                      {action.targetSystem}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ActionLog;