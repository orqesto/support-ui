import { useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
  releaseSocket,
} from '@/lib/socketManager';

type TelegramProcessingEvent = {
  type: 'bot_started' | 'message_received' | 'processing' | 'processed' | 'reply_sent' | 'error';
  data?: {
    botId?: number;
    botName?: string;
    messageId?: number;
    chatId?: number;
    sender?: string;
    content?: string;
    status?: string;
    error?: string;
    processTime?: number;
  };
};

type ProcessedMessage = {
  id: number;
  sender: string;
  content: string;
  status: string;
  processTime: number;
  timestamp: number;
  error?: string;
};

type TelegramProcessingState = {
  activeBots: number;
  isProcessing: boolean;
  recentMessages: ProcessedMessage[];
  totalProcessed: number;
  totalFailed: number;
  currentMessage?: {
    sender: string;
    content: string;
  };
};

const MAX_RECENT_MESSAGES = 10;

export const useTelegramProcessing = (enabled = true) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<TelegramProcessingState>({
    activeBots: 0,
    isProcessing: false,
    recentMessages: [],
    totalProcessed: 0,
    totalFailed: 0,
  });

  useEffect(() => {
    const socketInstance = getSocket();
    setSocket(socketInstance);

    if (!enabled) {
      return () => {
        releaseSocket();
      };
    }

    const handleTelegramEvent = (data: unknown) => {
      const event = data as TelegramProcessingEvent;

      switch (event.type) {
        case 'bot_started':
          setState((prev) => ({
            ...prev,
            activeBots: prev.activeBots + 1,
          }));
          break;

        case 'message_received':
          setState((prev) => ({
            ...prev,
            isProcessing: true,
            currentMessage: {
              sender: event.data?.sender ?? 'Unknown',
              content: event.data?.content ?? '',
            },
          }));
          break;

        case 'processing':
          // Keep current message displayed while processing
          break;

        case 'processed':
          setState((prev) => {
            const newMessage: ProcessedMessage = {
              id: event.data?.messageId ?? Date.now(),
              sender: event.data?.sender ?? 'Unknown',
              content: event.data?.content ?? prev.currentMessage?.content ?? '',
              status: event.data?.status ?? 'saved',
              processTime: event.data?.processTime ?? 0,
              timestamp: Date.now(),
            };

            return {
              ...prev,
              isProcessing: false,
              currentMessage: undefined,
              totalProcessed: prev.totalProcessed + 1,
              recentMessages: [newMessage, ...prev.recentMessages].slice(0, MAX_RECENT_MESSAGES),
            };
          });
          break;

        case 'reply_sent':
          // Update the most recent message to show reply was sent
          setState((prev) => ({
            ...prev,
            recentMessages: prev.recentMessages.map((msg, index) =>
              index === 0 ? { ...msg, status: 'replied' } : msg
            ),
          }));
          break;

        case 'error':
          setState((prev) => {
            const errorMessage: ProcessedMessage = {
              id: event.data?.messageId ?? Date.now(),
              sender: event.data?.sender ?? prev.currentMessage?.sender ?? 'Unknown',
              content: prev.currentMessage?.content ?? '',
              status: 'error',
              processTime: event.data?.processTime ?? 0,
              timestamp: Date.now(),
              error: event.data?.error,
            };

            return {
              ...prev,
              isProcessing: false,
              currentMessage: undefined,
              totalFailed: prev.totalFailed + 1,
              recentMessages: [errorMessage, ...prev.recentMessages].slice(0, MAX_RECENT_MESSAGES),
            };
          });
          break;
      }
    };

    subscribeToEvent('telegram:processing', handleTelegramEvent);

    return () => {
      unsubscribeFromEvent('telegram:processing', handleTelegramEvent);
      releaseSocket();
    };
  }, [enabled]);

  const reset = useCallback(() => {
    setState({
      activeBots: 0,
      isProcessing: false,
      recentMessages: [],
      totalProcessed: 0,
      totalFailed: 0,
    });
  }, []);

  return {
    socket,
    ...state,
    reset,
  };
};
