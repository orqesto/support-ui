import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './config';
import { ensureFreshSession } from '@/lib/api-client';
import { logger } from '@/lib/logger';

type EventCallback = (data: unknown) => void;

let socket: Socket | null = null;
let connectionCount = 0;
let disconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const eventListeners: Map<string, Set<EventCallback>> = new Map();
// The single broadcast wrapper attached per event name. Kept so unsubscribe can remove
// EXACTLY this listener via socket.off(event, wrapper). A bare socket.off(event) would also
// strip socket.io's reserved listeners for the same name — notably the internal 'connect'
// handler (registered in getSocket) that re-joins org rooms after a reconnect.
const eventWrappers: Map<string, EventCallback> = new Map();
const activeOrgRooms: Set<number> = new Set();
/**
 * Whether the one-shot "refresh and retry the handshake" recovery has been spent since the last
 * successful connect. Reset on `connect`, so a long-lived socket can recover from every access-
 * token expiry it crosses — but a session that is genuinely revoked terminates on the second
 * refusal instead of looping refresh forever.
 */
let authRecoveryUsed = false;

/** Tear the socket down and send the user to the login screen. The terminal path only. */
const endSessionAndRedirect = () => {
  socket?.disconnect();
  socket = null;
  connectionCount = 0;
  activeOrgRooms.clear();
  authRecoveryUsed = false;
  localStorage.removeItem('auth-storage');
  window.location.href = '/login';
};

// Attach the one broadcast listener for `event` to the current socket and remember it so it
// can be removed precisely later.
const attachBroadcastWrapper = (event: string) => {
  if (!socket) return;
  const wrapper: EventCallback = (data: unknown) => {
    logger.debug(`📧 Event received: ${event}`, data);
    const callbacks = eventListeners.get(event);
    if (callbacks) {
      logger.info(`  ↳ Broadcasting to ${callbacks.size} subscriber(s)`);
      callbacks.forEach((cb) => cb(data));
    }
  };
  eventWrappers.set(event, wrapper);
  socket.on(event, wrapper);
};

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
      attachBroadcastWrapper(event);
    }

    socket.on('connect', () => {
      logger.info('✅ WebSocket connected', socket?.id);
      // A handshake got through, so whatever was wrong with our credentials is fixed. Arm the
      // one-shot recovery again for the NEXT expiry — a socket that lives for hours will cross
      // more than one 15-minute access-token boundary.
      authRecoveryUsed = false;
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
        !msg.includes('Session has been invalidated') &&
        !msg.includes('Invalid or expired token') &&
        !msg.includes('Authentication required')
      ) {
        return;
      }

      // ⚠️ A rejected handshake is NOT proof the session is over — it is the same mistake the
      // api-client used to make with 401s, in the one place nobody looked. The handshake reads
      // the access cookie, which now lasts fifteen minutes; a socket that drops and reconnects
      // after that boundary is refused for an EXPIRED token while a perfectly good refresh token
      // sits in the cookie jar. Signing the user out there would bounce them to /login every
      // time their laptop woke from sleep.
      //
      // So: try to renew once, then reconnect. `ensureFreshSession` is the same single-flight
      // queue the HTTP path uses, so this cannot race an in-progress refresh into a reuse
      // detection.
      if (!authRecoveryUsed) {
        authRecoveryUsed = true;
        logger.info('🔒 WS auth rejected — renewing the session before giving up');
        // Stop the reconnect storm while the refresh is in flight; socket.io would otherwise
        // retry every second and burn the one recovery attempt on a cookie that has not
        // changed yet.
        socket?.disconnect();
        void ensureFreshSession().then(
          () => {
            logger.info('🔓 Session renewed — reconnecting the WebSocket');
            socket?.connect();
          },
          () => endSessionAndRedirect()
        );
        return;
      }

      // Refreshed and still refused: the session really is revoked or expired.
      logger.info('🔒 WS auth rejected after a refresh — clearing session and redirecting');
      endSessionAndRedirect();
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
    // Add the single broadcast listener to the socket (tracked so it can be removed precisely)
    attachBroadcastWrapper(event);
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

    // Clean up if no more callbacks. Remove ONLY our broadcast wrapper — a bare
    // socket.off(event) would also delete socket.io's internal listeners for reserved
    // events (notably the 'connect' handler that re-joins org rooms after a reconnect).
    if (callbacks.size === 0) {
      const wrapper = eventWrappers.get(event);
      if (wrapper) {
        socket?.off(event, wrapper);
      }
      eventWrappers.delete(event);
      eventListeners.delete(event);
      logger.info(`🔇 Unsubscribed from event: ${event}`);
    }
  }
};

export const releaseSocket = () => {
  connectionCount = Math.max(0, connectionCount - 1);
  logger.info(`📊 Active connections: ${connectionCount}`);

  // Debounce disconnect so the socket survives the no-subscriber gap between unmounting one
  // page and mounting the next. Today every page renders its own <Layout> (which owns the
  // socket hooks), so EVERY navigation drops the refcount to 0; a lazy route's Suspense
  // fallback (no Layout) can exceed a 1s window and cause a real disconnect→reconnect churn.
  // 5s comfortably spans a navigation + chunk load. The proper fix is a persistent <Layout>
  // shell mounted once above the router <Outlet> so the refcount never hits 0 on navigation.
  const DISCONNECT_DEBOUNCE_MS = 5000;
  if (connectionCount <= 0 && socket) {
    logger.info(`⏳ Scheduling disconnect in ${DISCONNECT_DEBOUNCE_MS / 1000}s...`);
    disconnectTimeout = setTimeout(() => {
      if (connectionCount <= 0 && socket) {
        logger.info('🔌 Disconnecting WebSocket (no active users)');
        socket.disconnect();
        socket = null;
        connectionCount = 0;
        activeOrgRooms.clear();
        eventListeners.clear();
        eventWrappers.clear();
      } else {
        logger.info('✅ Disconnect cancelled - components reconnected');
      }
    }, DISCONNECT_DEBOUNCE_MS);
  }
};

export const forceDisconnect = () => {
  if (disconnectTimeout) {
    clearTimeout(disconnectTimeout);
    disconnectTimeout = null;
  }
  if (socket) {
    logger.info('🔌 Force disconnecting WebSocket');
    socket.disconnect();
    socket = null;
    connectionCount = 0;
    activeOrgRooms.clear();
    eventListeners.clear();
    eventWrappers.clear();
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
