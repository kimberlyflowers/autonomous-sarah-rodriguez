import { useEffect, useRef, useCallback } from 'react';

// Custom hook for Server-Sent Events (SSE) integration
function useSSE(url, onMessage, options = {}) {
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const {
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    debug = false
  } = options;

  const reconnectAttempts = useRef(0);

  const log = useCallback((message, ...args) => {
    if (debug) {
      console.log(`[SSE] ${message}`, ...args);
    }
  }, [debug]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    log('Connecting to SSE endpoint:', url);

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        log('SSE connection established');
        reconnectAttempts.current = 0; // Reset on successful connection
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          log('Received SSE message:', data.type, data);

          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          log('Error parsing SSE message:', error, event.data);
        }
      };

      eventSource.onerror = (error) => {
        log('SSE connection error:', error);

        // Don't attempt reconnect if we've exceeded max attempts
        if (reconnectAttempts.current >= maxReconnectAttempts) {
          log(`Max reconnection attempts (${maxReconnectAttempts}) reached, giving up`);
          return;
        }

        // Close current connection
        eventSource.close();

        // Schedule reconnection
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          log(`Reconnection attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`);
          connect();
        }, reconnectInterval);
      };

    } catch (error) {
      log('Failed to create EventSource:', error);
    }
  }, [url, onMessage, reconnectInterval, maxReconnectAttempts, log]);

  const disconnect = useCallback(() => {
    log('Disconnecting SSE');

    // Clear any pending reconnection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, [log]);

  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Return connection control functions
  return {
    connect,
    disconnect,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN
  };
}

export default useSSE;