import React, { useState, useEffect } from 'react';

function RejectionLog({ theme, refreshContext }) {
  const [rejections, setRejections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRejections();

    // Register for refresh callbacks if refresh context is available
    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('rejections', fetchRejections);
      return cleanup;
    }
  }, [refreshContext]);

  const fetchRejections = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard/rejections?limit=25');

      if (response.ok) {
        const data = await response.json();
        setRejections(data.rejections || []);
        setError(null);
      } else {
        throw new Error('Failed to fetch rejections');
      }
    } catch (error) {
      console.error('Failed to fetch rejections:', error);
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
    rejectionsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    },
    rejection: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 0',
      borderBottom: `1px solid ${theme.border}`,
    },
    rejectionLastChild: {
      borderBottom: 'none',
    },
    reasonIcon: {
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
      backgroundColor: theme.accent,
      color: 'white',
    },
    rejectionContent: {
      flex: 1,
      minWidth: 0,
    },
    candidateAction: {
      fontSize: 14,
      fontWeight: 600,
      color: theme.text,
      marginBottom: 4,
    },
    reason: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 1.4,
      marginBottom: 6,
    },
    reasonCode: {
      fontSize: 11,
      fontWeight: 600,
      color: theme.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    alternativeSuggested: {
      fontSize: 12,
      color: theme.success,
      fontStyle: 'italic',
      marginTop: 4,
      padding: '4px 8px',
      backgroundColor: theme.success + '15',
      borderRadius: 4,
      border: `1px solid ${theme.success}30`,
    },
    rejectionMeta: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 8,
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
    confidence: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
    },
    confidenceBar: {
      width: 40,
      height: 6,
      backgroundColor: theme.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    confidenceFill: {
      height: '100%',
      borderRadius: 3,
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
    const rejectionTime = new Date(timestamp);
    const diffMs = now - rejectionTime;
    const diffMins = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return rejectionTime.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }
  };

  const getConfidenceColor = (confidence) => {
    const percentage = confidence * 100;
    if (percentage >= 90) return theme.success;
    if (percentage >= 70) return theme.accent;
    return theme.textMuted;
  };

  const formatReasonCode = (code) => {
    const codes = {
      'RISK': '⚠ Risk',
      'SCOPE': '🎯 Scope',
      'TIMING': '⏰ Timing',
      'DUPLICATE': '🔄 Duplicate',
      'LOW_VALUE': '📉 Low Value',
      'INSUFFICIENT_DATA': '❓ Insufficient Data'
    };
    return codes[code] || code;
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>⚠ Decisions Not Taken</h2>
        <div style={styles.loading}>Loading rejections...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h2 style={styles.title}>⚠ Decisions Not Taken</h2>
        <div style={styles.error}>Failed to load rejections: {error}</div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>
        ⚠ Decisions Not Taken
        <span style={{ fontSize: 14, fontWeight: 400, color: theme.textMuted }}>
          ({rejections.length} reasoned rejections)
        </span>
      </h2>

      {rejections.length === 0 ? (
        <div style={styles.empty}>No rejected actions logged</div>
      ) : (
        <div style={styles.rejectionsList}>
          {rejections.map((rejection, index) => (
            <div
              key={rejection.id}
              style={{
                ...styles.rejection,
                ...(index === rejections.length - 1 ? styles.rejectionLastChild : {}),
              }}
            >
              <div style={styles.reasonIcon}>
                ⚠
              </div>

              <div style={styles.rejectionContent}>
                <div style={styles.candidateAction}>
                  {rejection.candidateAction}
                </div>

                <div style={styles.reason}>
                  {rejection.reason}
                </div>

                {rejection.reasonCode && (
                  <div style={styles.reasonCode}>
                    {formatReasonCode(rejection.reasonCode)}
                  </div>
                )}

                {rejection.alternativeSuggested && (
                  <div style={styles.alternativeSuggested}>
                    💡 Alternative: {rejection.alternativeSuggested}
                  </div>
                )}

                <div style={styles.rejectionMeta}>
                  <div style={styles.metaLeft}>
                    <span style={styles.timestamp}>
                      {formatTimestamp(rejection.timestamp)}
                    </span>
                  </div>

                  <div style={styles.confidence}>
                    <span style={{ color: getConfidenceColor(rejection.confidence) }}>
                      {Math.round(rejection.confidence * 100)}%
                    </span>
                    <div style={styles.confidenceBar}>
                      <div style={{
                        ...styles.confidenceFill,
                        width: `${rejection.confidence * 100}%`,
                        backgroundColor: getConfidenceColor(rejection.confidence),
                      }} />
                    </div>
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

export default RejectionLog;