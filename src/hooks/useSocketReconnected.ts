import { useEffect, useRef } from 'react';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { SOCKET_RECONNECTED_EVENT } from '@/lib/socketEvents';

/**
 * Runs `resync` each time the socket comes back after a drop (never on its first connect): the
 * events sent while it was down are lost, so a live view re-reads what it shows ONCE.
 */
export const useSocketReconnected = (resync: () => void): void => {
  const resyncRef = useRef(resync);
  useEffect(() => {
    resyncRef.current = resync;
  }, [resync]);

  useEffect(() => {
    getSocket();
    const onReconnected = () => resyncRef.current();
    subscribeToEvent(SOCKET_RECONNECTED_EVENT, onReconnected);
    return () => {
      unsubscribeFromEvent(SOCKET_RECONNECTED_EVENT, onReconnected);
      releaseSocket();
    };
  }, []);
};
