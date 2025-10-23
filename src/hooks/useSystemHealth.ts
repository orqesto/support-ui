import { useState, useEffect, useCallback } from 'react';
import { healthService, type HealthResponse } from '../services/health.service';
import { useEmailProcessing } from './useEmailProcessing';

type SystemHealth = {
  health: HealthResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isWebSocketConnected: boolean;
};

export const useSystemHealth = (pollInterval = 10000): SystemHealth => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Get WebSocket status from email processing hook (disabled to avoid unnecessary subscriptions)
  const { socket } = useEmailProcessing(false);
  const isWebSocketConnected = socket?.connected || false;

  const fetchHealth = useCallback(async () => {
    try {
      setError(null);
      const response = await healthService.getStatus();
      if (response.success && response.data) {
        setHealth(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health status');
      console.error('Health check failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHealth();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [fetchHealth, pollInterval]);

  return {
    health,
    loading,
    error,
    refresh: fetchHealth,
    isWebSocketConnected,
  };
};
