import React from 'react';

function StatusCard({ agentStatus, theme, lastUpdate }) {
  if (!agentStatus) {
    return (
      <div style={{
        backgroundColor: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ color: theme.textMuted }}>Loading agent status...</div>
      </div>
    );
  }

  const agent = agentStatus.agent || {};
  const metrics = agentStatus.metrics || {};

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
    },
    agentInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: 16,
      backgroundColor: theme.bg,
      borderRadius: 8,
      marginBottom: 16,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 12,
      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: 20,
      fontWeight: 600,
    },
    info: {
      flex: 1,
    },
    name: {
      fontSize: 18,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 2,
    },
    role: {
      fontSize: 14,
      color: theme.textMuted,
      marginBottom: 8,
    },
    levelBadge: {
      display: 'inline-block',
      padding: '4px 12px',
      backgroundColor: theme.accent,
      color: 'white',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
    },
    metricsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 12,
    },
    metric: {
      textAlign: 'center',
      padding: 12,
      backgroundColor: theme.bg,
      borderRadius: 8,
    },
    metricValue: {
      fontSize: 20,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 2,
    },
    metricLabel: {
      fontSize: 12,
      color: theme.textMuted,
      fontWeight: 500,
    },
    lastUpdate: {
      fontSize: 11,
      color: theme.textMuted,
      textAlign: 'right',
      marginTop: 12,
    },
  };

  const getAutonomyLevelName = (level) => {
    const levels = {
      1: 'Observer',
      2: 'Assistant',
      3: 'Operator',
      4: 'Partner'
    };
    return levels[level] || 'Unknown';
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>Agent Status</h2>

      <div style={styles.agentInfo}>
        <div style={styles.avatar}>
          {agent.name ? agent.name.split(' ').map(n => n[0]).join('') : 'SR'}
        </div>
        <div style={styles.info}>
          <div style={styles.name}>{agent.name || 'Sarah Rodriguez'}</div>
          <div style={styles.role}>
            {agent.role || 'Operations Agent'} • {agent.client || 'Youth Empowerment School'}
          </div>
          <div style={styles.levelBadge}>
            Level {agent.autonomyLevel || 1} {getAutonomyLevelName(agent.autonomyLevel)}
          </div>
        </div>
      </div>

      {metrics && (
        <div style={styles.metricsGrid}>
          <div style={styles.metric}>
            <div style={styles.metricValue}>{metrics.totalCycles || 0}</div>
            <div style={styles.metricLabel}>Total Cycles</div>
          </div>
          <div style={styles.metric}>
            <div style={styles.metricValue}>{metrics.totalActions || 0}</div>
            <div style={styles.metricLabel}>Actions Taken</div>
          </div>
          <div style={styles.metric}>
            <div style={styles.metricValue}>{metrics.totalRejections || 0}</div>
            <div style={styles.metricLabel}>Decisions Avoided</div>
          </div>
          <div style={styles.metric}>
            <div style={styles.metricValue}>{metrics.totalHandoffs || 0}</div>
            <div style={styles.metricLabel}>Escalations</div>
          </div>
        </div>
      )}

      {lastUpdate && (
        <div style={styles.lastUpdate}>
          Last updated: {new Date(lastUpdate).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export default StatusCard;