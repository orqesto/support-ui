import { useEffect, useState, useCallback } from 'react';
import { useEmailProcessingSessions } from '@/hooks/useEmailProcessingSessions';
import { useEmailProcessingSocket } from '@/hooks/useEmailProcessingSocket';

export type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';

type ProcessingStatus = 'idle' | 'started' | 'processing' | 'complete' | 'error';

type EmailProcessingState = {
  status: ProcessingStatus;
  stage?: string;
  total: number;
  current: number;
  processed: number;
  failed: number;
  error?: string;
  isProcessing: boolean;
  fetchTime?: number;
  processTime?: number;
  totalTime?: number;
};

export const useEmailProcessing = (
  enabled = true,
  filterByDepartment?: string,
  filterByOrganization?: number
) => {
  const [state, setState] = useState<EmailProcessingState>({
    status: 'idle',
    stage: undefined,
    total: 0,
    current: 0,
    processed: 0,
    failed: 0,
    isProcessing: false,
  });

  const { sessions, setSessions, removeSession } = useEmailProcessingSessions({
    filterByDepartment,
    filterByOrganization,
    setState,
  });

  const { socket } = useEmailProcessingSocket({
    enabled,
    filterByDepartment,
    filterByOrganization,
    setSessions,
    setState,
  });

  // Auto-reset legacy 'complete' status after a delay.
  // This ensures ALL hook instances (DashboardPage, Layout, etc.) clear the status,
  // not just the one whose widget calls removeSession.
  useEffect(() => {
    if (state.status === 'complete') {
      const timer = setTimeout(() => {
        setState({
          status: 'idle',
          total: 0,
          current: 0,
          processed: 0,
          failed: 0,
          isProcessing: false,
        });
      }, 20000); // 20s — matches widget close delay + buffer
      return () => clearTimeout(timer);
    }
  }, [state.status]);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      total: 0,
      current: 0,
      processed: 0,
      failed: 0,
      isProcessing: false,
    });
  }, []);

  const progress = state.total > 0 ? (state.current / state.total) * 100 : 0;

  return {
    socket,
    ...state,
    progress,
    reset,
    removeSession,
    sessions, // Map of integration sessions for multi-widget display
  };
};
