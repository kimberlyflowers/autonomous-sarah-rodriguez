import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard.jsx';
import Chat from './Chat.jsx';
import useDashboardRefresh from './components/useDashboardRefresh.jsx';

// Theme colors following the design specification
const theme = {
  bg: '#f7f7f7',        // Super light grey background
  surface: '#ffffff',    // Card surfaces
  accent: '#F4A261',     // Orange accent
  accent2: '#E76F8B',    // Pink accent
  text: '#111827',       // Dark text
  textMuted: '#6B7280',  // Muted text
  border: '#E5E7EB',     // Border color
  success: '#34A853',    // Green for success
  error: '#EF4444',      // Red for errors
};

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  // Setup real-time dashboard refresh system
  const dashboardRefresh = useDashboardRefresh();

  // Connection status comes from SSE connection
  const isConnected = dashboardRefresh.isConnected;

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: theme.bg,
    },
    header: {
      backgroundColor: theme.surface,
      borderBottom: `1px solid ${theme.border}`,
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    logo: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 18,
      fontWeight: 600,
      color: theme.text,
    },
    logoIcon: {
      width: 32,
      height: 32,
      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: 16,
    },
    nav: {
      display: 'flex',
      gap: 4,
      backgroundColor: theme.bg,
      padding: 4,
      borderRadius: 8,
    },
    navButton: {
      padding: '8px 16px',
      borderRadius: 6,
      border: 'none',
      backgroundColor: 'transparent',
      color: theme.textMuted,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    navButtonActive: {
      backgroundColor: theme.surface,
      color: theme.text,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    },
    status: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 12,
      fontWeight: 500,
      color: theme.textMuted,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: isConnected ? theme.success : theme.error,
    },
    main: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      padding: '20px',
      maxWidth: '100%',
      margin: '0 auto',
    },
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <div style={styles.logoIcon}>🤖</div>
          <div>Sarah Rodriguez</div>
        </div>

        <nav style={styles.nav}>
          <button
            style={{
              ...styles.navButton,
              ...(currentPage === 'dashboard' ? styles.navButtonActive : {}),
            }}
            onClick={() => handlePageChange('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            style={{
              ...styles.navButton,
              ...(currentPage === 'chat' ? styles.navButtonActive : {}),
            }}
            onClick={() => handlePageChange('chat')}
          >
            💬 Chat
          </button>
        </nav>

        <div style={styles.status}>
          <div style={styles.statusDot}></div>
          {isConnected ? 'Connected' : 'Offline'}
        </div>
      </header>

      <main style={styles.main}>
        {currentPage === 'dashboard' && (
          <Dashboard
            theme={theme}
            refreshContext={dashboardRefresh}
          />
        )}
        {currentPage === 'chat' && <Chat theme={theme} />}
      </main>
    </div>
  );
}

export default App;