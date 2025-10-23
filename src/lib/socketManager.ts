import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import { API_BASE_URL } from './config';

type EventCallback = (data: unknown) => void;

let socket: Socket | null = null;
let connectionCount = 0;
let disconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const eventListeners: Map<string, Set<EventCallback>> = new Map();

export const getSocket = (): Socket => {
  // Clear any pending disconnect
  if (disconnectTimeout) {
    clearTimeout(disconnectTimeout);
    disconnectTimeout = null;
  }

  if (!socket) {
    console.log('🔌 Creating new WebSocket connection');
    socket = io(API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 3,
    });

    socket.on('connect', () => {
      console.log('✅ WebSocket connected', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
    });
  }

  connectionCount++;
  console.log(`📊 Active connections: ${connectionCount}`);

  return socket;
};

// Subscribe to events (with automatic deduplication)
export const subscribeToEvent = (event: string, callback: EventCallback) => {
  if (!socket) {
    throw new Error('Socket not initialized. Call getSocket() first.');
  }

  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());

    // Add single listener to socket that broadcasts to all subscribers
    socket.on(event, (data: unknown) => {
      console.log(`📧 Event received: ${event}`, data);

      const callbacks = eventListeners.get(event);
      if (callbacks) {
        console.log(`  ↳ Broadcasting to ${callbacks.size} subscriber(s)`);
        // Call each unique callback
        callbacks.forEach((cb) => cb(data));
      }
    });

    console.log(`🎧 Subscribed to event: ${event}`);
  }

  eventListeners.get(event)!.add(callback);
  console.log(`📝 Added callback for ${event} (${eventListeners.get(event)!.size} total)`);
};

// Unsubscribe from events
export const unsubscribeFromEvent = (event: string, callback: EventCallback) => {
  const callbacks = eventListeners.get(event);
  if (callbacks) {
    callbacks.delete(callback);
    console.log(`🗑️  Removed callback for ${event} (${callbacks.size} remaining)`);

    // Clean up if no more callbacks
    if (callbacks.size === 0) {
      socket?.off(event);
      eventListeners.delete(event);
      console.log(`🔇 Unsubscribed from event: ${event}`);
    }
  }
};

export const releaseSocket = () => {
  connectionCount--;
  console.log(`📊 Active connections: ${connectionCount}`);

  // Delay disconnect to handle React StrictMode double-mounting
  if (connectionCount <= 0 && socket) {
    console.log('⏳ Scheduling disconnect in 1 second...');
    disconnectTimeout = setTimeout(() => {
      if (connectionCount <= 0 && socket) {
        console.log('🔌 Disconnecting WebSocket (no active users)');
        socket.disconnect();
        socket = null;
        connectionCount = 0;
      } else {
        console.log('✅ Disconnect cancelled - components reconnected');
      }
    }, 1000);
  }
};

export const forceDisconnect = () => {
  if (socket) {
    console.log('🔌 Force disconnecting WebSocket');
    socket.disconnect();
    socket = null;
    connectionCount = 0;
  }
};
