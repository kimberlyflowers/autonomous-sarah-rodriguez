import React, { useState, useEffect } from 'react';

function SubAgentDashboard({ theme, refreshContext }) {
  const [subAgentData, setSubAgentData] = useState({
    agents: [],
    stats: null,
    recentDelegations: []
  });
  const [activeView, setActiveView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSubAgentData();

    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('subagents', fetchSubAgentData);
      return cleanup;
    } else {
      const interval = setInterval(fetchSubAgentData, 45000);
      return () => clearInterval(interval);
    }
  }, [refreshContext]);

  const fetchSubAgentData = async () => {
    try {
      // Simulate sub-agent data - in real implementation this would come from backend
      setSubAgentData({
        agents: [
          {
            key: 'ghl_specialist',
            name: 'GHL Operations Specialist',
            description: 'Expert in GoHighLevel CRM operations, contacts, opportunities, and workflows',
            expertise: ['contacts', 'opportunities', 'calendars', 'workflows', 'pipelines', 'tasks'],
            toolCount: 15,
            active: true,
            lastUsed: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
            completedTasks: 23,
            successRate: 0.96
          },
          {
            key: 'communication_specialist',
            name: 'Communication Specialist',
            description: 'Expert in client communication, messaging, and relationship management',
            expertise: ['messaging', 'communication', 'relationships', 'follow_ups', 'campaigns'],
            toolCount: 12,
            active: true,
            lastUsed: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
            completedTasks: 18,
            successRate: 0.94
          },
          {
            key: 'data_analyst',
            name: 'Data Analysis Specialist',
            description: 'Expert in data analysis, pattern recognition, and business intelligence',
            expertise: ['analysis', 'patterns', 'metrics', 'reporting', 'insights'],
            toolCount: 10,
            active: false,
            lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            completedTasks: 12,
            successRate: 0.92
          },
          {
            key: 'task_coordinator',
            name: 'Task Planning & Coordination Specialist',
            description: 'Expert in task management, workflow optimization, and operational planning',
            expertise: ['planning', 'coordination', 'workflows', 'optimization', 'task_management'],
            toolCount: 11,
            active: false,
            lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            completedTasks: 8,
            successRate: 0.98
          },
          {
            key: 'escalation_specialist',
            name: 'Escalation & Issue Resolution Specialist',
            description: 'Expert in identifying, analyzing, and escalating complex issues',
            expertise: ['escalation', 'issue_resolution', 'risk_assessment', 'decision_support'],
            toolCount: 8,
            active: false,
            lastUsed: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            completedTasks: 3,
            successRate: 1.0
          }
        ],
        stats: {
          totalSubAgents: 5,
          activeSubAgents: 2,
          totalCompletedTasks: 64,
          averageSuccessRate: 0.96,
          totalSpecializedTools: 56,
          availableExpertise: ['contacts', 'opportunities', 'messaging', 'analysis', 'planning', 'escalation']
        },
        recentDelegations: [
          {
            id: 1,
            task: 'Analyze contact engagement patterns for Q4 leads',
            subAgent: 'data_analyst',
            agentName: 'Data Analysis Specialist',
            status: 'completed',
            delegatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            completedAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            executionTime: 4320000,
            result: 'Identified 23% increase in engagement with personalized messaging'
          },
          {
            id: 2,
            task: 'Update contact tags for high-value prospects',
            subAgent: 'ghl_specialist',
            agentName: 'GHL Operations Specialist',
            status: 'completed',
            delegatedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
            completedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
            executionTime: 900000,
            result: 'Successfully updated 47 contact records with new segmentation tags'
          },
          {
            id: 3,
            task: 'Design follow-up sequence for warm leads',
            subAgent: 'communication_specialist',
            agentName: 'Communication Specialist',
            status: 'in_progress',
            delegatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
            estimatedCompletion: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            progress: 'Analyzing current communication patterns and response rates'
          }
        ]
      });
      setError(null);
    } catch (error) {
      console.error('Failed to fetch sub-agent data:', error);
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

  const formatDuration = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10B981';
      case 'in_progress': return '#F59E0B';
      case 'failed': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getSuccessRateColor = (rate) => {
    if (rate >= 0.95) return '#10B981';
    if (rate >= 0.9) return '#6366F1';
    if (rate >= 0.8) return '#F59E0B';
    return '#EF4444';
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
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
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
      fontSize: 20,
      fontWeight: '700',
      color: '#111827',
      margin: 0,
    },
    statLabel: {
      fontSize: 11,
      color: '#6B7280',
      marginTop: 4,
    },
    agentGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: 16,
    },
    agentCard: {
      padding: 16,
      backgroundColor: '#f9fafb',
      borderRadius: 8,
      border: '1px solid #e5e7eb',
      position: 'relative',
    },
    activeIndicator: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: '#10B981',
    },
    inactiveIndicator: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: '#6B7280',
    },
    agentName: {
      fontSize: 14,
      fontWeight: '600',
      color: '#111827',
      margin: '0 0 4px 0',
    },
    agentDescription: {
      fontSize: 12,
      color: '#6B7280',
      marginBottom: 12,
      lineHeight: 1.4,
    },
    expertiseList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 12,
    },
    expertiseTag: {
      padding: '2px 6px',
      backgroundColor: '#E5E7EB',
      color: '#374151',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: '500',
    },
    agentStats: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 11,
      color: '#6B7280',
    },
    delegationList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    delegationItem: {
      padding: 12,
      backgroundColor: '#f9fafb',
      borderRadius: 6,
      border: '1px solid #e5e7eb',
    },
    delegationHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    delegationTask: {
      fontSize: 13,
      fontWeight: '600',
      color: '#111827',
      margin: 0,
    },
    delegationMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11,
    },
    statusBadge: {
      padding: '2px 6px',
      borderRadius: 8,
      fontSize: 10,
      fontWeight: '500',
      color: 'white',
    },
    delegationContent: {
      fontSize: 12,
      color: '#6B7280',
      lineHeight: 1.4,
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
            Sub-Agent Operations
          </h3>
        </div>
        <div style={styles.loadingState}>Loading sub-agent data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <span style={styles.icon}>🤖</span>
            Sub-Agent Operations
          </h3>
        </div>
        <div style={styles.errorState}>
          Failed to load sub-agent data: {error}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>
          <span style={styles.icon}>🤖</span>
          Sub-Agent Operations
        </h3>
      </div>

      <div style={styles.tabs}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'agents', label: 'Agents' },
          { key: 'delegations', label: 'Recent Delegations' }
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
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{subAgentData.stats.totalSubAgents}</div>
            <div style={styles.statLabel}>Total Agents</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{subAgentData.stats.activeSubAgents}</div>
            <div style={styles.statLabel}>Active Now</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{subAgentData.stats.totalCompletedTasks}</div>
            <div style={styles.statLabel}>Tasks Completed</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{Math.round(subAgentData.stats.averageSuccessRate * 100)}%</div>
            <div style={styles.statLabel}>Success Rate</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{subAgentData.stats.totalSpecializedTools}</div>
            <div style={styles.statLabel}>Specialized Tools</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{subAgentData.stats.availableExpertise.length}</div>
            <div style={styles.statLabel}>Expertise Areas</div>
          </div>
        </div>
      )}

      {activeView === 'agents' && (
        <div style={styles.agentGrid}>
          {subAgentData.agents.map((agent) => (
            <div key={agent.key} style={styles.agentCard}>
              <div style={agent.active ? styles.activeIndicator : styles.inactiveIndicator} />

              <h4 style={styles.agentName}>{agent.name}</h4>
              <p style={styles.agentDescription}>{agent.description}</p>

              <div style={styles.expertiseList}>
                {agent.expertise.map((exp, index) => (
                  <span key={index} style={styles.expertiseTag}>{exp}</span>
                ))}
              </div>

              <div style={styles.agentStats}>
                <span>{agent.toolCount} tools</span>
                <span>{agent.completedTasks} completed</span>
                <span style={{ color: getSuccessRateColor(agent.successRate) }}>
                  {Math.round(agent.successRate * 100)}% success
                </span>
                <span>Used {formatTimeAgo(agent.lastUsed)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeView === 'delegations' && (
        <div style={styles.delegationList}>
          {subAgentData.recentDelegations.map((delegation) => (
            <div key={delegation.id} style={styles.delegationItem}>
              <div style={styles.delegationHeader}>
                <h4 style={styles.delegationTask}>{delegation.task}</h4>
                <div style={styles.delegationMeta}>
                  <span style={{
                    ...styles.statusBadge,
                    backgroundColor: getStatusColor(delegation.status)
                  }}>
                    {delegation.status}
                  </span>
                  <span>{delegation.agentName}</span>
                  <span>{formatTimeAgo(delegation.delegatedAt)}</span>
                </div>
              </div>

              <div style={styles.delegationContent}>
                {delegation.status === 'completed' && delegation.result && (
                  <div>
                    <strong>Result:</strong> {delegation.result}
                    <br />
                    <strong>Duration:</strong> {formatDuration(delegation.executionTime)}
                  </div>
                )}
                {delegation.status === 'in_progress' && delegation.progress && (
                  <div>
                    <strong>Progress:</strong> {delegation.progress}
                    <br />
                    <strong>Est. completion:</strong> {formatTimeAgo(delegation.estimatedCompletion)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SubAgentDashboard;