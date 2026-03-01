import React, { useState, useEffect } from 'react';

function HandoffLog({ theme, refreshContext }) {
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHandoffs();

    // Register for refresh callbacks if refresh context is available
    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('handoffs', fetchHandoffs);
      return cleanup;
    }
  }, [refreshContext]);

  const fetchHandoffs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/handoffs?limit=20');

      if (response.ok) {
        const data = await response.json();
        setHandoffs(data.handoffs || []);
        setError(null);
      } else {
        throw new Error('Failed to fetch handoffs');
      }
    } catch (error) {
      console.error('Failed to fetch handoffs:', error);
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
    handoffsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    },
    handoff: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '16px 0',
      borderBottom: `1px solid ${theme.border}`,
    },
    handoffLastChild: {
      borderBottom: 'none',
    },
    urgencyIcon: {
      width: 24,
      height: 24,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
      marginTop: 2,
      flexShrink: 0,
    },
    urgencyHigh: {
      backgroundColor: theme.error,
      color: 'white',
    },
    urgencyMedium: {
      backgroundColor: theme.accent,
      color: 'white',
    },
    urgencyLow: {
      backgroundColor: theme.textMuted,
      color: 'white',
    },
    urgencyCritical: {
      backgroundColor: '#DC2626',
      color: 'white',
      animation: 'pulse 2s infinite',
    },
    handoffContent: {
      flex: 1,
      minWidth: 0,
    },
    issueTitle: {
      fontSize: 14,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 6,
      lineHeight: 1.4,
    },
    analysisPath: {
      fontSize: 12,
      color: theme.textMuted,
      marginBottom: 8,
      fontStyle: 'italic',
    },
    recommendation: {
      fontSize: 13,
      color: theme.text,
      lineHeight: 1.4,
      marginBottom: 8,
      padding: '8px 12px',
      backgroundColor: theme.bg,
      borderRadius: 6,
      border: `1px solid ${theme.border}`,
    },
    humanResponse: {
      fontSize: 13,
      color: theme.success,
      lineHeight: 1.4,
      marginBottom: 8,
      padding: '8px 12px',
      backgroundColor: theme.success + '15',
      borderRadius: 6,
      border: `1px solid ${theme.success}30`,
    },
    handoffMeta: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
    },
    metaLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: theme.textMuted,
    },
    timestamp: {
      fontWeight: 500,
    },
    statusBadge: {
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
    },
    statusResolved: {
      backgroundColor: theme.success,
      color: 'white',
    },
    statusPending: {
      backgroundColor: theme.accent,
      color: 'white',
    },
    statusNotified: {
      backgroundColor: theme.bg,
      color: theme.textMuted,
      border: `1px solid ${theme.border}`,
    },
    confidence: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      color: theme.textMuted,
    },
    confidenceBar: {
      width: 30,
      height: 4,
      backgroundColor: theme.border,
      borderRadius: 2,
      overflow: 'hidden',
    },
    confidenceFill: {
      height: '100%',
      borderRadius: 2,
      backgroundColor: theme.accent,
      transition: 'width 0.3s ease',
    },
    empty: {
      textAlign: 'center',
      padding: 40,
      color: theme.textMuted,
    },
  };

  const formatTimestamp = (timestamp) => {
    const now = new Date();
    const handoffTime = new Date(timestamp);
    const diffMs = now - handoffTime;
    const diffMins = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return handoffTime.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const getUrgencyStyle = (urgency) => {
    switch (urgency?.toUpperCase()) {
      case 'CRITICAL':
        return styles.urgencyCritical;
      case 'HIGH':
        return styles.urgencyHigh;
      case 'MEDIUM':
        return styles.urgencyMedium;
      case 'LOW':
      default:
        return styles.urgencyLow;
    }
  };

  const getUrgencyIcon = (urgency) => {
    switch (urgency?.toUpperCase()) {
      case 'CRITICAL':
        return '🚨';
      case 'HIGH':
        return '🔴';
      case 'MEDIUM':
        return '🟡';
      case 'LOW':
      default:
        return '⚪';
    }
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>↗ Escalations</h2>
        <div style={styles.loading}>Loading handoffs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>↗ Escalations</h2>
        <div style={styles.error}>Failed to load handoffs: {error}</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>
        ↗ Escalations
        <span style={{ fontSize: 14, fontWeight: 400, color: theme.textMuted }}>
          ({handoffs.filter(h => !h.resolved).length} pending)
        </span>
      </h2>

      {handoffs.length === 0 ? (
        <div style={styles.empty}>No escalations to humans</div>
      ) : (
        <div style={styles.handoffsList}>
          {handoffs.map((handoff, index) => (
            <div
              key={handoff.id}
              style={{
                ...styles.handoff,
                ...(index === handoffs.length - 1 ? styles.handoffLastChild : {}),
              }}
            >
              <div style={{
                ...styles.urgencyIcon,
                ...getUrgencyStyle(handoff.urgency),
              }}>
                {getUrgencyIcon(handoff.urgency)}
              </div>

              <div style={styles.handoffContent}>
                <div style={styles.issueTitle}>
                  {handoff.issue}
                </div>

                {handoff.analysisPath && (
                  <div style={styles.analysisPath}>
                    Analysis: {handoff.analysisPath}
                  </div>
                )}

                {handoff.recommendation && (
                  <div style={styles.recommendation}>
                    <strong>Recommendation:</strong> {handoff.recommendation}
                  </div>
                )}

                {handoff.humanResponse && (
                  <div style={styles.humanResponse}>
                    <strong>Human Response:</strong> {handoff.humanResponse}
                  </div>
                )}

                <div style={styles.handoffMeta}>
                  <div style={styles.metaLeft}>
                    <span style={styles.timestamp}>
                      {formatTimestamp(handoff.timestamp)}
                    </span>
                    <span style={styles.confidence}>
                      {Math.round(handoff.confidence * 100)}%
                      <div style={styles.confidenceBar}>
                        <div style={{
                          ...styles.confidenceFill,
                          width: `${handoff.confidence * 100}%`,
                        }} />
                      </div>
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center'
                  }}>
                    {handoff.resolved ? (
                      <span style={{ ...styles.statusBadge, ...styles.statusResolved }}>
                        Resolved
                      </span>
                    ) : handoff.humanNotified ? (
                      <span style={{ ...styles.statusBadge, ...styles.statusNotified }}>
                        Notified
                      </span>
                    ) : (
                      <span style={{ ...styles.statusBadge, ...styles.statusPending }}>
                        Pending
                      </span>
                    )}

                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: getUrgencyStyle(handoff.urgency).backgroundColor,
                      textTransform: 'uppercase',
                    }}>
                      {handoff.urgency || 'LOW'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HandoffLog;