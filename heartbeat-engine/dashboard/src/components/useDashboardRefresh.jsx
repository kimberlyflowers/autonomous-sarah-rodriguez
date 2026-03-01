import { useState, useCallback, useRef, useEffect } from 'react';
import useSSE from './useSSE.jsx';

// Custom hook for dashboard data refresh coordination
function useDashboardRefresh() {
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const refreshCallbacks = useRef(new Map());

  // Handle SSE messages
  const handleSSEMessage = useCallback((data) => {
    console.log('[Dashboard] SSE message received:', data.type, data);

    switch (data.type) {
      case 'connected':
        setConnectionStatus('connected');
        break;

      case 'heartbeat':
        setConnectionStatus('connected');
        break;

      case 'dashboard_refresh':
        // Trigger full dashboard refresh
        console.log('[Dashboard] Triggering full refresh');
        setLastRefresh(Date.now());

        // Call all registered refresh callbacks
        refreshCallbacks.current.forEach((callback, componentName) => {
          try {
            callback();
          } catch (error) {
            console.warn(`[Dashboard] Refresh callback error for ${componentName}:`, error);
          }
        });
        break;

      case 'data_update_cycles':
      case 'data_update_actions':
      case 'data_update_rejections':
      case 'data_update_handoffs':
      case 'data_update_metrics':
        // Trigger specific component refresh
        const updateType = data.type.replace('data_update_', '');
        console.log(`[Dashboard] Triggering ${updateType} refresh`);

        const callback = refreshCallbacks.current.get(updateType);
        if (callback) {
          try {
            callback(data.data);
          } catch (error) {
            console.warn(`[Dashboard] Specific refresh callback error for ${updateType}:`, error);
          }
        }
        break;

      default:
        console.log('[Dashboard] Unknown SSE event type:', data.type);
    }
  }, []);

  // Setup SSE connection
  const sse = useSSE('/api/events/dashboard', handleSSEMessage, {
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    debug: process.env.NODE_ENV === 'development'
  });

  // Update connection status based on SSE state
  useEffect(() => {
    if (sse.isConnected) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('disconnected');
    }
  }, [sse.isConnected]);

  // Register a component for refresh callbacks
  const registerRefreshCallback = useCallback((componentName, callback) => {
    console.log(`[Dashboard] Registering refresh callback for: ${componentName}`);
    refreshCallbacks.current.set(componentName, callback);

    // Return cleanup function
    return () => {
      console.log(`[Dashboard] Unregistering refresh callback for: ${componentName}`);
      refreshCallbacks.current.delete(componentName);
    };
  }, []);

  // Manual refresh trigger
  const triggerRefresh = useCallback(() => {
    console.log('[Dashboard] Manual refresh triggered');
    setLastRefresh(Date.now());

    refreshCallbacks.current.forEach((callback, componentName) => {
      try {
        callback();
      } catch (error) {
        console.warn(`[Dashboard] Manual refresh callback error for ${componentName}:`, error);
      }
    });
  }, []);

  return {
    lastRefresh,
    connectionStatus,
    registerRefreshCallback,
    triggerRefresh,
    isConnected: connectionStatus === 'connected'
  };
}

export default useDashboardRefresh;