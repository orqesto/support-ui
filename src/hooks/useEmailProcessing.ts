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

export const useEmailProcessing = (enabled = true) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<EmailProcessingState>({
    status: 'idle',
    total: 0,
    current: 0,
    processed: 0,
    failed: 0,
    isProcessing: false,
  });

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
          // Individual message errors shouldn't stop the whole process
          // Only increment failed count and keep processing
          setState((prev) => ({
            ...prev,
            failed: prev.failed + 1,
            // Only set to error status if processing hasn't started
            // (meaning it's a critical error like API failure)
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
  }, [enabled]);

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
  };
};
