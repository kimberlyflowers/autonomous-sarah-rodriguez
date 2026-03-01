import React, { useState, useEffect } from 'react';

function TrustMetrics({ theme, refreshContext }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMetrics();

    // Register for refresh callbacks if refresh context is available
    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('metrics', fetchMetrics);
      return cleanup;
    }
  }, [refreshContext]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/metrics');

      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        setError(null);
      } else {
        throw new Error('Failed to fetch metrics');
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
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
    metricsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 16,
      marginBottom: 20,
    },
    metricCard: {
      padding: 16,
      backgroundColor: theme.bg,
      borderRadius: 8,
      border: `1px solid ${theme.border}`,
    },
    metricLabel: {
      fontSize: 12,
      fontWeight: 600,
      color: theme.textMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    metricValue: {
      fontSize: 20,
      fontWeight: 700,
      color: theme.text,
      marginBottom: 4,
    },
    metricSubtext: {
      fontSize: 11,
      color: theme.textMuted,
    },
    graduationSection: {
      padding: 16,
      marginTop: 16,
      borderRadius: 8,
      border: `2px solid ${theme.border}`,
    },
    graduationTitle: {
      fontSize: 16,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    graduationEligible: {
      borderColor: theme.success,
      backgroundColor: theme.success + '10',
    },
    graduationNotEligible: {
      borderColor: theme.accent,
      backgroundColor: theme.accent + '10',
    },
    requirementsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    requirement: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 13,
      padding: '6px 0',
    },
    requirementMet: {
      color: theme.success,
    },
    requirementNotMet: {
      color: theme.textMuted,
    },
    requirementIcon: {
      width: 16,
      height: 16,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 10,
      fontWeight: 600,
      flexShrink: 0,
    },
    iconMet: {
      backgroundColor: theme.success,
      color: 'white',
    },
    iconNotMet: {
      backgroundColor: theme.textMuted,
      color: 'white',
    },
    progressBar: {
      width: '100%',
      height: 6,
      backgroundColor: theme.border,
      borderRadius: 3,
      overflow: 'hidden',
      marginTop: 4,
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      transition: 'width 0.5s ease',
    },
    periodInfo: {
      fontSize: 12,
      color: theme.textMuted,
      textAlign: 'center',
      fontStyle: 'italic',
      marginTop: 16,
    },
  };

  const getPercentageColor = (value, isReverse = false) => {
    const num = parseFloat(value);
    if (isNaN(num)) return theme.textMuted;

    if (isReverse) {
      if (num <= 20) return theme.success;
      if (num <= 50) return theme.accent;
      return theme.error;
    } else {
      if (num >= 90) return theme.success;
      if (num >= 70) return theme.accent;
      return theme.error;
    }
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>📊 Trust Metrics</h2>
        <div style={styles.loading}>Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>📊 Trust Metrics</h2>
        <div style={styles.error}>Failed to load metrics: {error}</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>📊 Trust Metrics</h2>
        <div style={styles.loading}>No metrics data available</div>
      </div>
    );
  }

  const graduation = metrics.graduation || {};
  const isEligible = graduation.eligible;

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>📊 Trust Metrics</h2>

      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Cycle Success</div>
          <div style={{
            ...styles.metricValue,
            color: getPercentageColor(metrics.cycles?.successRate)
          }}>
            {metrics.cycles?.successRate || '0'}%
          </div>
          <div style={styles.metricSubtext}>
            {metrics.cycles?.successful || 0} of {metrics.cycles?.total || 0} cycles
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Action Success</div>
          <div style={{
            ...styles.metricValue,
            color: getPercentageColor(metrics.actions?.successRate)
          }}>
            {metrics.actions?.successRate || 'N/A'}
            {metrics.actions?.successRate !== 'N/A' && '%'}
          </div>
          <div style={styles.metricSubtext}>
            {metrics.actions?.total || 0} actions taken
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Approval Rate</div>
          <div style={{
            ...styles.metricValue,
            color: getPercentageColor(metrics.performance?.approvalRate)
          }}>
            {metrics.performance?.approvalRate || 'N/A'}
            {metrics.performance?.approvalRate !== 'N/A' && '%'}
          </div>
          <div style={styles.metricSubtext}>
            Decision accuracy
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Avg Cycle Time</div>
          <div style={styles.metricValue}>
            {metrics.performance?.avgCycleDuration ?
              `${Math.round(metrics.performance.avgCycleDuration / 1000)}s` :
              'N/A'
            }
          </div>
          <div style={styles.metricSubtext}>
            Processing efficiency
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Escalations</div>
          <div style={{
            ...styles.metricValue,
            color: getPercentageColor(metrics.decisions?.escalationAppropriate)
          }}>
            {metrics.decisions?.escalationAppropriate || 'N/A'}
            {metrics.decisions?.escalationAppropriate !== 'N/A' && '%'}
          </div>
          <div style={styles.metricSubtext}>
            {metrics.decisions?.handoffs || 0} escalated
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Conservative Decisions</div>
          <div style={{
            ...styles.metricValue,
            color: theme.accent
          }}>
            {metrics.decisions?.rejections || 0}
          </div>
          <div style={styles.metricSubtext}>
            Actions rejected
          </div>
        </div>
      </div>

      <div style={{
        ...styles.graduationSection,
        ...(isEligible ? styles.graduationEligible : styles.graduationNotEligible)
      }}>
        <div style={styles.graduationTitle}>
          {isEligible ? '🎯' : '📋'} Autonomy Level Graduation
        </div>

        {isEligible ? (
          <div>
            <div style={{
              fontSize: 14,
              color: theme.success,
              fontWeight: 600,
              marginBottom: 8
            }}>
              ✅ Eligible for Level {graduation.nextLevel} promotion!
            </div>
            <div style={{
              fontSize: 13,
              color: theme.text,
              lineHeight: 1.4
            }}>
              Sarah has met all requirements for the next autonomy level.
              All metrics are within acceptable ranges for increased responsibility.
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              fontSize: 14,
              color: theme.text,
              fontWeight: 600,
              marginBottom: 12
            }}>
              Requirements for Level 2 (Assistant):
            </div>

            {graduation.requirements && (
              <div style={styles.requirementsList}>
                {Object.entries(graduation.requirements).map(([key, req]) => {
                  const isMet = req.met || false;
                  return (
                    <div
                      key={key}
                      style={{
                        ...styles.requirement,
                        ...(isMet ? styles.requirementMet : styles.requirementNotMet)
                      }}
                    >
                      <div style={{
                        ...styles.requirementIcon,
                        ...(isMet ? styles.iconMet : styles.iconNotMet)
                      }}>
                        {isMet ? '✓' : '○'}
                      </div>
                      <span>
                        {req.description || key}: {req.current || 'N/A'} / {req.required || 'N/A'}
                      </span>
                      {req.progress !== undefined && (
                        <div style={styles.progressBar}>
                          <div style={{
                            ...styles.progressFill,
                            width: `${Math.min(100, req.progress * 100)}%`,
                            backgroundColor: isMet ? theme.success : theme.accent,
                          }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {graduation.reason && (
              <div style={{
                fontSize: 12,
                color: theme.textMuted,
                marginTop: 12,
                fontStyle: 'italic'
              }}>
                Status: {graduation.reason}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={styles.periodInfo}>
        Metrics calculated for: {metrics.period || 'Recent period'}
        <br />
        Last updated: {new Date(metrics.lastUpdated).toLocaleString()}
      </div>
    </div>
  );
}

export default TrustMetrics;