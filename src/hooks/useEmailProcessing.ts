import { useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';

type ProcessingStatus = 'idle' | 'started' | 'processing' | 'complete' | 'error';

type EmailProcessingEvent = {
  type: 'started' | 'found' | 'processing' | 'processed' | 'complete' | 'error';
  integrationId?: number;
  integrationName?: string;
  departmentRole?: string; // Department this integration belongs to
  data?: {
    total?: number;
    current?: number;
    messageId?: string;
    sender?: string;
    subject?: string;
    status?: string;
    aiSuggestion?: string;
    processed?: number;
    failed?: number;
    error?: string;
    // Performance timing fields (in milliseconds)
    fetchTime?: number;
    processTime?: number;
    totalTime?: number;
  };
};

export type ProcessingSession = {
  sessionKey: string; // Composite key: integrationId-departmentRole
  integrationId: number;
  integrationName: string;
  departmentRole?: string; // Department this integration belongs to
  status: ProcessingStatus;
  total: number;
  current: number;
  processed: number;
  failed: number;
  error?: string;
  isProcessing: boolean;
  // Performance timing (in milliseconds)
  fetchTime?: number;
  processTime?: number;
  totalTime?: number;
  progress: number;
};

type EmailProcessingState = {
  status: ProcessingStatus;
  total: number;
  current: number;
  processed: number;
  failed: number;
  error?: string;
  isProcessing: boolean;
  // Performance timing (in milliseconds)
  fetchTime?: number;
  processTime?: number;
  totalTime?: number;
};

export const useEmailProcessing = (enabled = true, filterByDepartment?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<EmailProcessingState>({
    status: 'idle',
    total: 0,
    current: 0,
    processed: 0,
    failed: 0,
    isProcessing: false,
  });

  // NEW: Track multiple processing sessions by sessionKey (integrationId-departmentRole)
  const [sessions, setSessions] = useState<Map<string, ProcessingSession>>(new Map());

  useEffect(() => {
    // Always get socket instance (for connection status)
    const socketInstance = getSocket();
    setSocket(socketInstance);

    // Skip event subscription if disabled
    if (!enabled) {
      return () => {
        releaseSocket();
      };
    }

    const handleProcessing = (data: unknown) => {
      const event = data as EmailProcessingEvent;

      // DEBUG: Log all events to see what we're receiving
      console.log('[useEmailProcessing] Event received:', {
        type: event.type,
        integrationId: event.integrationId,
        integrationName: event.integrationName,
        hasData: !!event.data,
        data: event.data
      });

      // If integrationId is provided, track this session separately
      if (event.integrationId) {
        // Filter by department if specified - ignore events from other departments
        if (filterByDepartment && event.departmentRole && event.departmentRole !== filterByDepartment) {
          console.log(`[useEmailProcessing] Ignoring event from ${event.departmentRole}, current filter: ${filterByDepartment}`);
          return;
        }
        setSessions((prev) => {
          const newSessions = new Map(prev);
          const integrationId = event.integrationId as number;
          const integrationName = event.integrationName ?? `Integration ${integrationId}`;
          const departmentRole = event.departmentRole ?? 'general';
          // Use composite key: integrationId-departmentRole
          const sessionKey = `${integrationId}-${departmentRole}`;
          const existing = newSessions.get(sessionKey);

          switch (event.type) {
            case 'started':
              newSessions.set(sessionKey, {
                sessionKey,
                integrationId,
                integrationName,
                departmentRole, // Use normalized value
                status: 'started',
                total: 0,
                current: 0,
                processed: 0,
                failed: 0,
                isProcessing: true,
                progress: 0,
              });
              break;

            case 'found':
              if (existing) {
                const total = event.data?.total ?? 0;
                newSessions.set(sessionKey, {
                  ...existing,
                  status: 'processing',
                  total,
                });
              }
              break;

            case 'processing':
              if (existing) {
                const current = event.data?.current ?? 0;
                const total = event.data?.total ?? existing.total;
                newSessions.set(sessionKey, {
                  ...existing,
                  status: 'processing',
                  current,
                  total,
                  progress: total > 0 ? (current / total) * 100 : 0,
                });
              } else {
                // Create session if it doesn't exist (page refresh during processing)
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentRole, // Use normalized value
                  status: 'processing',
                  total: event.data?.total ?? 0,
                  current: event.data?.current ?? 0,
                  processed: 0,
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                });
              }
              break;

            case 'processed':
              if (existing) {
                newSessions.set(sessionKey, {
                  ...existing,
                  processed: existing.processed + 1,
                });
              } else {
                // Create minimal session if processing in progress but page was refreshed
                newSessions.set(sessionKey, {
                  sessionKey,
                  integrationId,
                  integrationName,
                  departmentRole, // Use normalized value
                  status: 'processing',
                  total: 0,
                  current: 0,
                  processed: 1,
                  failed: 0,
                  isProcessing: true,
                  progress: 0,
                });
              }
              break;

            case 'complete':
              if (existing) {
                const processed = event.data?.processed ?? existing.processed;
                const failed = event.data?.failed ?? existing.failed;
                newSessions.set(sessionKey, {
                  ...existing,
                  status: 'complete',
                  processed,
                  failed,
                  isProcessing: false,
                  progress: 100,
                  fetchTime: event.data?.fetchTime,
                  processTime: event.data?.processTime,
                  totalTime: event.data?.totalTime,
                });
              }
              break;

            case 'error':
              if (existing) {
                newSessions.set(sessionKey, {
                  ...existing,
                  failed: existing.failed + 1,
                  ...(existing.status === 'idle' && {
                    status: 'error',
                    error: event.data?.error,
                    isProcessing: false,
                  }),
                });
              }
              break;
          }

          return newSessions;
        });
      }

      // Maintain backward compatibility with legacy single-session state
      switch (event.type) {
        case 'started':
          setState({
            status: 'started',
            total: 0,
            current: 0,
            processed: 0,
            failed: 0,
            isProcessing: true,
          });
          break;

        case 'found':
          setState((prev) => ({
            ...prev,
            status: 'processing',
            total: event.data?.total ?? 0,
          }));
          break;

        case 'processing':
          setState((prev) => ({
            ...prev,
            status: 'processing',
            current: event.data?.current ?? 0,
            total: event.data?.total ?? prev.total,
          }));
          break;

        case 'processed':
          setState((prev) => ({
            ...prev,
            processed: prev.processed + 1,
          }));
          break;

        case 'complete':
          setState((prev) => ({
            ...prev,
            status: 'complete',
            total: event.data?.total ?? prev.total,
            processed: event.data?.processed ?? 0,
            failed: event.data?.failed ?? 0,
            isProcessing: false,
            fetchTime: event.data?.fetchTime,
            processTime: event.data?.processTime,
            totalTime: event.data?.totalTime,
          }));
          break;

        case 'error':
          setState((prev) => ({
            ...prev,
            failed: prev.failed + 1,
            ...(prev.status === 'idle' && {
              status: 'error',
              error: event.data?.error,
              isProcessing: false,
            }),
          }));
          break;
      }
    };

    // Subscribe to events with automatic deduplication
    subscribeToEvent('email:processing', handleProcessing);

    return () => {
      unsubscribeFromEvent('email:processing', handleProcessing);
      releaseSocket();
    };
  }, [enabled, filterByDepartment]);

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
    sessions, // Map of integration sessions for multi-widget display
  };
};
