import React, { useState, useEffect } from 'react';

function TrustGateStatus({ theme, agentId = 'bloomie-sarah-rodriguez', refreshContext }) {
  const [trustStatus, setTrustStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTrustStatus();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('trust', fetchTrustStatus);
      return cleanup;
    } else {
      const interval = setInterval(fetchTrustStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [refreshContext, agentId]);

  const fetchTrustStatus = async () => {
    try {
      const response = await fetch(`/api/execute/trust-status/${agentId}`);
      if (response.ok) {
        const data = await response.json();
        setTrustStatus(data);
        setError(null);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch trust status:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getAutonomyLevelInfo = (level) => {
    const levels = {
      1: { name: 'Observer', color: '#6366F1', description: 'Read-only operations, analysis, planning' },
      2: { name: 'Assistant', color: '#10B981', description: 'Basic write operations with oversight' },
      3: { name: 'Operator', color: '#F59E0B', description: 'Independent operations within boundaries' },
      4: { name: 'Manager', color: '#8B5CF6', description: 'Full autonomous decision-making' }
    };
    return levels[level] || { name: 'Unknown', color: '#6B7280', description: 'Unknown level' };
  };

  const getUsageColor = (used, limit) => {
    if (limit === 0) return '#6B7280'; // Gray for not allowed
    const percentage = used / limit;
    if (percentage >= 0.9) return '#EF4444'; // Red for high usage
    if (percentage >= 0.7) return '#F59E0B'; // Orange for medium usage
    return '#10B981'; // Green for low usage
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
    autonomyBadge: {
      padding: '6px 12px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: '600',
      color: 'white',
    },
    content: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 20,
    },
    section: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#374151',
      marginBottom: 8,
    },
    levelInfo: {
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
    },
    levelName: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
    },
    levelDescription: {
      fontSize: 12,
      color: '#6B7280',
    },
    usageGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
    },
    usageItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 8,
      backgroundColor: '#f9fafb',
      borderRadius: 4,
      fontSize: 12,
    },
    usageLabel: {
      color: '#6B7280',
      textTransform: 'capitalize',
    },
    usageValue: {
      fontWeight: '600',
    },
    permissionsList: {
      maxHeight: 200,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    permissionItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 6,
      backgroundColor: '#f9fafb',
      borderRadius: 4,
      fontSize: 11,
    },
    toolName: {
      fontFamily: 'monospace',
      color: '#374151',
    },
    riskBadge: {
      padding: '2px 6px',
      borderRadius: 8,
      fontSize: 10,
      fontWeight: '500',
      color: 'white',
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

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'low': return '#10B981';
      case 'medium': return '#F59E0B';
      case 'high': return '#EF4444';
      case 'critical': return '#7C2D12';
      default: return '#6B7280';
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🛡️</span>
            Trust Gate Status
          </h3>
        </div>
        <div style={styles.loadingState}>Loading trust status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🛡️</span>
            Trust Gate Status
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load trust status: {error}
        </div>
      </div>
    );
  }

  const levelInfo = getAutonomyLevelInfo(trustStatus.trustGate.autonomyLevel);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>🛡️</span>
          Trust Gate Status
        </h3>
        <div style={{
          ...styles.autonomyBadge,
          backgroundColor: levelInfo.color
        }}>
          Level {trustStatus.trustGate.autonomyLevel} - {levelInfo.name}
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Autonomy Level</div>
          <div style={styles.levelInfo}>
            <div style={{
              ...styles.levelName,
              color: levelInfo.color
            }}>
              Level {trustStatus.trustGate.autonomyLevel} - {levelInfo.name}
            </div>
            <div style={styles.levelDescription}>
              {levelInfo.description}
            </div>
          </div>

          <div style={styles.sectionTitle}>Daily Usage Limits</div>
          <div style={styles.usageGrid}>
            {Object.entries(trustStatus.trustGate.remaining).map(([category, remaining]) => {
              if (category === 'total') return null;
              const used = trustStatus.trustGate.actionUsage[category] || 0;
              const limit = trustStatus.trustGate.dailyLimits[category] || 0;
              return (
                <div key={category} style={styles.usageItem}>
                  <span style={styles.usageLabel}>{category.replace('_', ' ')}</span>
                  <span style={{
                    ...styles.usageValue,
                    color: getUsageColor(used, limit)
                  }}>
                    {used}/{limit}
                  </span>
                </div>
              );
            })}
            <div style={styles.usageItem}>
              <span style={styles.usageLabel}>Total Actions</span>
              <span style={{
                ...styles.usageValue,
                color: getUsageColor(
                  trustStatus.trustGate.actionUsage.total || 0,
                  trustStatus.trustGate.dailyLimits.total || 0
                )
              }}>
                {trustStatus.trustGate.actionUsage.total || 0}/{trustStatus.trustGate.dailyLimits.total || 0}
              </span>
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Authorized Tools ({trustStatus.permissions.authorizedActions?.length || 0})
          </div>
          <div style={styles.permissionsList}>
            {trustStatus.permissions.authorizedActions?.slice(0, 10).map((tool, index) => (
              <div key={index} style={styles.permissionItem}>
                <span style={styles.toolName}>{tool.action}</span>
                <span style={{
                  ...styles.riskBadge,
                  backgroundColor: getRiskColor(tool.risk)
                }}>
                  {tool.risk}
                </span>
              </div>
            ))}
            {trustStatus.permissions.authorizedActions?.length > 10 && (
              <div style={{...styles.permissionItem, fontStyle: 'italic'}}>
                ... and {trustStatus.permissions.authorizedActions.length - 10} more tools
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrustGateStatus;