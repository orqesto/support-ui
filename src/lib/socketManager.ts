/* eslint-disable no-console */
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './config';

type EventCallback = (data: unknown) => void;

let socket: Socket | null = null;
let connectionCount = 0;
let disconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const eventListeners: Map<string, Set<EventCallback>> = new Map();
const activeOrgRooms: Set<number> = new Set();

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
      // Re-join all active organization rooms after (re)connect
      for (const orgId of activeOrgRooms) {
        console.log(`🏢 Re-joining organization room after connect: org-${orgId}`);
        socket?.emit('join-organization', orgId);
      }
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

  eventListeners.get(event)?.add(callback);
  console.log(`📝 Added callback for ${event} (${eventListeners.get(event)?.size} total)`);
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

// Join organization-specific room for targeted event delivery
// Tracks the room and automatically re-joins on reconnect
export const joinOrganizationRoom = (organizationId: number) => {
  activeOrgRooms.add(organizationId);
  if (socket?.connected) {
    console.log(`🏢 Joining organization room: org-${organizationId}`);
    socket.emit('join-organization', organizationId);
  } else {
    console.log(`🏢 Queued organization room join (will join on connect): org-${organizationId}`);
  }
};

// Leave organization room
export const leaveOrganizationRoom = (organizationId: number) => {
  activeOrgRooms.delete(organizationId);
  if (socket?.connected) {
    console.log(`🚪 Leaving organization room: org-${organizationId}`);
    socket.emit('leave-organization', organizationId);
  }
};
