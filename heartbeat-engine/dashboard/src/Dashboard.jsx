import React, { useState, useEffect } from 'react';
import StatusCard from './components/StatusCard.jsx';
import CycleTimeline from './components/CycleTimeline.jsx';
import ActionLog from './components/ActionLog.jsx';
import RejectionLog from './components/RejectionLog.jsx';
import HandoffLog from './components/HandoffLog.jsx';
import TrustMetrics from './components/TrustMetrics.jsx';

function Dashboard({ theme, refreshContext }) {
  const [agentStatus, setAgentStatus] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    fetchDashboardData();

    // Register for refresh callbacks if refresh context is available
    if (refreshContext) {
      const cleanup = refreshContext.registerRefreshCallback('status', fetchDashboardData);
      return cleanup;
    } else {
      // Fallback to periodic refresh if no SSE
      const interval = setInterval(fetchDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [refreshContext]);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard/status');
      if (response.ok) {
        const data = await response.json();
        setAgentStatus(data);
        setLastUpdate(new Date().toISOString());
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    },
  };

  return (
    <div style={styles.container}>
      <StatusCard
        agentStatus={agentStatus}
        theme={theme}
        lastUpdate={lastUpdate}
      />

      <CycleTimeline
        theme={theme}
        refreshContext={refreshContext}
      />

      <ActionLog
        theme={theme}
        refreshContext={refreshContext}
      />

      <RejectionLog
        theme={theme}
        refreshContext={refreshContext}
      />

      <HandoffLog
        theme={theme}
        refreshContext={refreshContext}
      />

      <TrustMetrics
        theme={theme}
        refreshContext={refreshContext}
      />
    </div>
  );
}

export default Dashboard;