import React, { useState, useEffect } from 'react';

function CycleTimeline({ theme, refreshContext }) {
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCycles();

    // Register for refresh callbacks if refresh context is available
    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('cycles', fetchCycles);
      return cleanup;
    }
  }, [refreshContext]);

  const fetchCycles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/cycles?limit=20');

      if (response.ok) {
        const data = await response.json();
        setCycles(data.cycles || []);
        setError(null);
      } else {
        throw new Error('Failed to fetch cycles');
      }
    } catch (error) {
      console.error('Failed to fetch cycles:', error);
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
    timeline: {
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    },
    cycle: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 0',
      borderBottom: `1px solid ${theme.border}`,
      position: 'relative',
    },
    cycleLastChild: {
      borderBottom: 'none',
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: '50%',
      marginTop: 4,
      flexShrink: 0,
    },
    statusCompleted: {
      backgroundColor: theme.success,
    },
    statusRunning: {
      backgroundColor: theme.accent,
    },
    statusError: {
      backgroundColor: theme.error,
    },
    cycleContent: {
      flex: 1,
      minWidth: 0,
    },
    cycleHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    cycleMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      color: theme.textMuted,
    },
    cycleTime: {
      fontWeight: 500,
    },
    cycleDuration: {
      padding: '2px 6px',
      backgroundColor: theme.bg,
      borderRadius: 4,
      fontSize: 11,
    },
    countsRow: {
      display: 'flex',
      gap: 12,
      marginTop: 6,
    },
    countBadge: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12,
      padding: '2px 6px',
      borderRadius: 4,
      backgroundColor: theme.bg,
    },
    actions: {
      color: theme.success,
    },
    rejections: {
      color: theme.accent,
    },
    handoffs: {
      color: theme.textMuted,
    },
    empty: {
      textAlign: 'center',
      padding: 40,
      color: theme.textMuted,
    },
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return styles.statusCompleted;
      case 'running':
        return styles.statusRunning;
      case 'error':
        return styles.statusError;
      default:
        return { backgroundColor: theme.textMuted };
    }
  };

  const formatDuration = (durationMs) => {
    if (!durationMs) return 'N/A';

    const seconds = Math.round(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.round(seconds / 60);
    return `${minutes}m`;
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>🔄 Recent Activity</h2>
        <div style={styles.loading}>Loading recent cycles...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>🔄 Recent Activity</h2>
        <div style={styles.error}>Failed to load cycles: {error}</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>
        🔄 Recent Activity
        <span style={{ fontSize: 14, fontWeight: 400, color: theme.textMuted }}>
          ({cycles.length} cycles)
        </span>
      </h2>

      {cycles.length === 0 ? (
        <div style={styles.empty}>No recent heartbeat cycles</div>
      ) : (
        <div style={styles.timeline}>
          {cycles.map((cycle, index) => (
            <div
              key={cycle.cycleId}
              style={{
                ...styles.cycle,
                ...(index === cycles.length - 1 ? styles.cycleLastChild : {}),
              }}
            >
              <div style={{
                ...styles.statusDot,
                ...getStatusColor(cycle.status),
              }} />

              <div style={styles.cycleContent}>
                <div style={styles.cycleHeader}>
                  <div style={styles.cycleMeta}>
                    <span style={styles.cycleTime}>
                      {formatTime(cycle.startedAt)}
                    </span>
                    <span style={styles.cycleDuration}>
                      {formatDuration(cycle.duration)}
                    </span>
                    <span style={{
                      ...styles.cycleDuration,
                      backgroundColor: cycle.status === 'completed' ? theme.success + '20' :
                                      cycle.status === 'error' ? theme.error + '20' :
                                      theme.accent + '20',
                      color: cycle.status === 'completed' ? theme.success :
                             cycle.status === 'error' ? theme.error :
                             theme.accent,
                    }}>
                      {cycle.status}
                    </span>
                  </div>
                </div>

                <div style={styles.countsRow}>
                  {cycle.counts.actions > 0 && (
                    <div style={styles.countBadge}>
                      <span style={styles.actions}>✓</span>
                      <span>{cycle.counts.actions} actions</span>
                    </div>
                  )}
                  {cycle.counts.rejections > 0 && (
                    <div style={styles.countBadge}>
                      <span style={styles.rejections}>⚠</span>
                      <span>{cycle.counts.rejections} rejected</span>
                    </div>
                  )}
                  {cycle.counts.handoffs > 0 && (
                    <div style={styles.countBadge}>
                      <span style={styles.handoffs}>↗</span>
                      <span>{cycle.counts.handoffs} escalated</span>
                    </div>
                  )}
                  {cycle.counts.actions === 0 && cycle.counts.rejections === 0 && cycle.counts.handoffs === 0 && (
                    <div style={styles.countBadge}>
                      <span style={styles.handoffs}>—</span>
                      <span>no actions</span>
                    </div>
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

export default CycleTimeline;