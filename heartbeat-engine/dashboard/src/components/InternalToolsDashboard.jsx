import React, { useState, useEffect } from 'react';

function InternalToolsDashboard({ theme, refreshContext }) {
  const [internalData, setInternalData] = useState({
    tasks: [],
    decisions: [],
    observations: [],
    contexts: []
  });
  const [activeTab, setActiveTab] = useState('tasks');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchInternalData();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('internal', fetchInternalData);
      return cleanup;
    } else {
      const interval = setInterval(fetchInternalData, 30000);
      return () => clearInterval(interval);
    }
  }, [refreshContext]);

  const fetchInternalData = async () => {
    try {
      // Note: These endpoints would need to be created to fetch internal tools data
      // For now, we'll simulate the data structure

      // In a real implementation, these would be actual API calls:
      // const tasksResponse = await fetch('/api/internal/tasks');
      // const decisionsResponse = await fetch('/api/internal/decisions');
      // etc.

      // Simulated data for now
      setInternalData({
        tasks: [
          {
            id: 1,
            title: "Follow up with new leads from GHL",
            status: "in_progress",
            priority: "high",
            category: "ghl_ops",
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 2,
            title: "Analyze contact engagement patterns",
            status: "pending",
            priority: "medium",
            category: "analysis",
            created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 3,
            title: "Update contact tags based on behavior",
            status: "completed",
            priority: "medium",
            category: "ghl_ops",
            created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString()
          }
        ],
        decisions: [
          {
            id: 1,
            decision: "Chose not to send follow-up email to unengaged contact",
            category: "action_rejected",
            confidence: 0.85,
            reasoning: "Contact has not opened last 3 emails, marked as low engagement",
            created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString()
          },
          {
            id: 2,
            decision: "Escalated complex pricing inquiry to human",
            category: "escalation",
            confidence: 0.95,
            reasoning: "Custom pricing requires human judgment beyond my autonomy level",
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
          }
        ],
        observations: [
          {
            id: 1,
            observation: "Contact response rate increased 23% after personalization",
            significance: "high",
            context: "A/B testing different message approaches",
            created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 2,
            observation: "Calendar booking rate higher on Tuesday/Wednesday",
            significance: "medium",
            context: "Weekly pattern analysis over 30 days",
            created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
          }
        ],
        contexts: [
          {
            id: 1,
            title: "Client prefers morning appointments",
            context_type: "client_preference",
            content: "Contact consistently books 9-11am slots, avoid afternoon suggestions",
            tags: ["scheduling", "preferences"],
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
          },
          {
            id: 2,
            title: "High-value leads pattern identified",
            context_type: "workflow_pattern",
            content: "Leads from LinkedIn with company size 50+ have 60% higher conversion",
            tags: ["lead_quality", "conversion"],
            created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
          }
        ]
      });
      setError(null);
    } catch (error) {
      console.error('Failed to fetch internal data:', error);
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
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return `${diffMins}m ago`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10B981';
      case 'in_progress': return '#F59E0B';
      case 'pending': return '#6B7280';
      case 'blocked': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#DC2626';
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#6B7280';
    }
  };

  const getSignificanceColor = (significance) => {
    switch (significance) {
      case 'high': return '#DC2626';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#6B7280';
    }
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
    content: {
      minHeight: 300,
    },
    itemList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    item: {
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
    },
    itemHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    itemTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#111827',
      margin: 0,
    },
    itemMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11,
    },
    badge: {
      padding: '2px 6px',
      borderRadius: 8,
      fontSize: 10,
      fontWeight: '500',
      color: 'white',
    },
    itemContent: {
      fontSize: 12,
      color: '#6B7280',
      lineHeight: 1.4,
    },
    tags: {
      display: 'flex',
      gap: 4,
      marginTop: 8,
    },
    tag: {
      padding: '2px 6px',
      backgroundColor: '#E5E7EB',
      color: '#374151',
      borderRadius: 4,
      fontSize: 10,
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

  const renderTasks = () => (
    <div style={styles.itemList}>
      {internalData.tasks.map((task) => (
        <div key={task.id} style={styles.item}>
          <div style={styles.itemHeader}>
            <h4 style={styles.itemTitle}>{task.title}</h4>
            <div style={styles.itemMeta}>
              <span style={{
                ...styles.badge,
                backgroundColor: getStatusColor(task.status)
              }}>
                {task.status}
              </span>
              <span style={{
                ...styles.badge,
                backgroundColor: getPriorityColor(task.priority)
              }}>
                {task.priority}
              </span>
              <span>{formatTimeAgo(task.created_at)}</span>
            </div>
          </div>
          <div style={styles.itemContent}>
            Category: {task.category} • ID: {task.id}
          </div>
        </div>
      ))}
    </div>
  );

  const renderDecisions = () => (
    <div style={styles.itemList}>
      {internalData.decisions.map((decision) => (
        <div key={decision.id} style={styles.item}>
          <div style={styles.itemHeader}>
            <h4 style={styles.itemTitle}>{decision.decision}</h4>
            <div style={styles.itemMeta}>
              <span style={{
                ...styles.badge,
                backgroundColor: decision.category === 'escalation' ? '#EF4444' : '#6366F1'
              }}>
                {decision.category}
              </span>
              <span style={{
                ...styles.badge,
                backgroundColor: decision.confidence > 0.8 ? '#10B981' : '#F59E0B'
              }}>
                {Math.round(decision.confidence * 100)}%
              </span>
              <span>{formatTimeAgo(decision.created_at)}</span>
            </div>
          </div>
          <div style={styles.itemContent}>
            {decision.reasoning}
          </div>
        </div>
      ))}
    </div>
  );

  const renderObservations = () => (
    <div style={styles.itemList}>
      {internalData.observations.map((observation) => (
        <div key={observation.id} style={styles.item}>
          <div style={styles.itemHeader}>
            <h4 style={styles.itemTitle}>{observation.observation}</h4>
            <div style={styles.itemMeta}>
              <span style={{
                ...styles.badge,
                backgroundColor: getSignificanceColor(observation.significance)
              }}>
                {observation.significance}
              </span>
              <span>{formatTimeAgo(observation.created_at)}</span>
            </div>
          </div>
          <div style={styles.itemContent}>
            Context: {observation.context}
          </div>
        </div>
      ))}
    </div>
  );

  const renderContexts = () => (
    <div style={styles.itemList}>
      {internalData.contexts.map((context) => (
        <div key={context.id} style={styles.item}>
          <div style={styles.itemHeader}>
            <h4 style={styles.itemTitle}>{context.title}</h4>
            <div style={styles.itemMeta}>
              <span style={{
                ...styles.badge,
                backgroundColor: '#6366F1'
              }}>
                {context.context_type}
              </span>
              <span>{formatTimeAgo(context.created_at)}</span>
            </div>
          </div>
          <div style={styles.itemContent}>
            {context.content}
          </div>
          {context.tags && (
            <div style={styles.tags}>
              {context.tags.map((tag, index) => (
                <span key={index} style={styles.tag}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🧠</span>
            Internal Operations
          </h3>
        </div>
        <div style={styles.loadingState}>Loading internal data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🧠</span>
            Internal Operations
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load internal data: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>🧠</span>
          Internal Operations
        </h3>
      </div>

      <div style={styles.tabs}>
        {[
          { key: 'tasks', label: 'Tasks', count: internalData.tasks.length },
          { key: 'decisions', label: 'Decisions', count: internalData.decisions.length },
          { key: 'observations', label: 'Observations', count: internalData.observations.length },
          { key: 'contexts', label: 'Context', count: internalData.contexts.length }
        ].map((tab) => (
          <button
            key={tab.key}
            style={{
              ...styles.tab,
              ...(activeTab === tab.key ? styles.activeTab : {})
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {activeTab === 'tasks' && renderTasks()}
        {activeTab === 'decisions' && renderDecisions()}
        {activeTab === 'observations' && renderObservations()}
        {activeTab === 'contexts' && renderContexts()}
      </div>
    </div>
  );
}

export default InternalToolsDashboard;