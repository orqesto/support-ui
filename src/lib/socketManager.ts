import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './config';
import { logger } from '@/lib/logger';

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
    logger.info('🔌 Creating new WebSocket connection');
    socket = io(API_BASE_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    // Re-attach any event listeners that survived a socket reset
    for (const event of eventListeners.keys()) {
      socket.on(event, (data: unknown) => {
        logger.debug(`📧 Event received: ${event}`, data);
        const callbacks = eventListeners.get(event);
        if (callbacks) {
          logger.info(`  ↳ Broadcasting to ${callbacks.size} subscriber(s)`);
          callbacks.forEach((cb) => cb(data));
        }
      });
    }

    socket.on('connect', () => {
      logger.info('✅ WebSocket connected', socket?.id);
      // Re-join all active organization rooms after (re)connect
      for (const orgId of activeOrgRooms) {
        logger.info(`🏢 Re-joining organization room after connect: org-${orgId}`);
        socket?.emit('join-organization', orgId);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info('❌ WebSocket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      const msg = err?.message ?? '';
      if (
        msg.includes('Session has been invalidated') ||
        msg.includes('Invalid or expired token') ||
        msg.includes('Authentication required')
      ) {
        logger.info('🔒 WS auth rejected — clearing session and redirecting to login');
        socket?.disconnect();
        socket = null;
        connectionCount = 0;
        activeOrgRooms.clear();
        localStorage.removeItem('auth-storage');
        window.location.href = '/login';
      }
    });
  }

  connectionCount++;
  logger.info(`📊 Active connections: ${connectionCount}`);

  return socket;
};

// Subscribe to events (with automatic deduplication)
export const subscribeToEvent = (event: string, callback: EventCallback) => {
  if (!socket) {
    logger.warn(`subscribeToEvent called for '${event}' but socket is not yet acquired — call getSocket() first`);
    return;
  }

  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());

    // Add single listener to socket that broadcasts to all subscribers
    socket.on(event, (data: unknown) => {
      logger.debug(`📧 Event received: ${event}`, data);

      const callbacks = eventListeners.get(event);
      if (callbacks) {
        logger.info(`  ↳ Broadcasting to ${callbacks.size} subscriber(s)`);
        // Call each unique callback
        callbacks.forEach((cb) => cb(data));
      }
    });

    logger.info(`🎧 Subscribed to event: ${event}`);
  }

  eventListeners.get(event)?.add(callback);
  logger.info(`📝 Added callback for ${event} (${eventListeners.get(event)?.size} total)`);
};

// Unsubscribe from events
export const unsubscribeFromEvent = (event: string, callback: EventCallback) => {
  const callbacks = eventListeners.get(event);
  if (callbacks) {
    callbacks.delete(callback);
    logger.info(`🗑️  Removed callback for ${event} (${callbacks.size} remaining)`);

    // Clean up if no more callbacks
    if (callbacks.size === 0) {
      socket?.off(event);
      eventListeners.delete(event);
      logger.info(`🔇 Unsubscribed from event: ${event}`);
    }
  }
};

export const releaseSocket = () => {
  connectionCount = Math.max(0, connectionCount - 1);
  logger.info(`📊 Active connections: ${connectionCount}`);

  // Delay disconnect to handle React StrictMode double-mounting
  if (connectionCount <= 0 && socket) {
    logger.info('⏳ Scheduling disconnect in 1 second...');
    disconnectTimeout = setTimeout(() => {
      if (connectionCount <= 0 && socket) {
        logger.info('🔌 Disconnecting WebSocket (no active users)');
        socket.disconnect();
        socket = null;
        connectionCount = 0;
        activeOrgRooms.clear();
        eventListeners.clear();
      } else {
        logger.info('✅ Disconnect cancelled - components reconnected');
      }
    }, 1000);
  }
};

export const forceDisconnect = () => {
  if (socket) {
    logger.info('🔌 Force disconnecting WebSocket');
    socket.disconnect();
    socket = null;
    connectionCount = 0;
    activeOrgRooms.clear();
    eventListeners.clear();
  }
};

// Join organization-specific room for targeted event delivery
// Tracks the room and automatically re-joins on reconnect
export const joinOrganizationRoom = (organizationId: number) => {
  activeOrgRooms.add(organizationId);
  if (socket?.connected) {
    logger.info(`🏢 Joining organization room: org-${organizationId}`);
    socket.emit('join-organization', organizationId);
  } else {
    logger.info(`🏢 Queued organization room join (will join on connect): org-${organizationId}`);
  }
};

// Leave organization room
export const leaveOrganizationRoom = (organizationId: number) => {
  activeOrgRooms.delete(organizationId);
  if (socket?.connected) {
    logger.info(`🚪 Leaving organization room: org-${organizationId}`);
    socket.emit('leave-organization', organizationId);
  }
};
