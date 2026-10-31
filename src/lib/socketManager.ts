import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './config';
import { ensureFreshSession, isRateLimited, refreshRetryInMs } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { writeTabWorkspace } from '@/lib/tabWorkspace';
import { SOCKET_RECONNECTED_EVENT } from '@/lib/socketEvents';

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

/**
 * The pending "reconnect once renewal may be tried again" after a refusal for rate. Cancelled on
 * every teardown: it belongs to the socket that failed, and must not fire into a signed-out tab or
 * nudge the next socket (after an org switch or a new sign-in) mid-way through its own recovery.
 */
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
const cancelSocketRecovery = () => {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  // The recovery belonged to the socket being torn down. Left spent, the NEXT socket's first
  // expired-token refusal would skip renewal and sign the user out — the very sign-out a refusal
  // for rate must not cause.
  authRecoveryUsed = false;
};

/**
 * The views' re-read after a reconnect (SOCKET_RECONNECTED_EVENT) is spread and rationed. A
 * backend restart or deploy reconnects every agent's tab in the same second; each re-read is the
 * list, the board, the counts and the open thread. So each tab waits a random 0–5 s first, and
 * re-reads at most once per 30 s however often a flapping link reconnects.
 */
export const RECONNECT_RESYNC_JITTER_MS = 5_000;
export const RECONNECT_RESYNC_MIN_INTERVAL_MS = 30_000;
let lastReconnectResyncAt = Number.NEGATIVE_INFINITY;
let reconnectResyncTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleReconnectResync = () => {
  if (reconnectResyncTimer !== null) return;
  if (Date.now() - lastReconnectResyncAt < RECONNECT_RESYNC_MIN_INTERVAL_MS) return;
  lastReconnectResyncAt = Date.now();
  reconnectResyncTimer = setTimeout(() => {
    reconnectResyncTimer = null;
    eventListeners.get(SOCKET_RECONNECTED_EVENT)?.forEach((listener) => listener(undefined));
  }, Math.random() * RECONNECT_RESYNC_JITTER_MS);
};
const cancelReconnectResync = () => {
  if (reconnectResyncTimer !== null) clearTimeout(reconnectResyncTimer);
  reconnectResyncTimer = null;
};

/** Tear the socket down and send the user to the login screen. The terminal path only. */
const endSessionAndRedirect = () => {
  cancelSocketRecovery();
  socket?.disconnect();
  // A re-read pending for the socket torn down is not for the next one.
  cancelReconnectResync();
  socket = null;
  connectionCount = 0;
  activeOrgRooms.clear();
  authRecoveryUsed = false;
  localStorage.removeItem('auth-storage');
  writeTabWorkspace(null);
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

    // Per socket: its first connect is the start, every later one a reconnect (see below).
    let connectedBefore = false;
    socket.on('connect', () => {
      logger.info('✅ WebSocket connected', socket?.id);
      const reconnected = connectedBefore;
      connectedBefore = true;
      // A handshake got through, so whatever was wrong with our credentials is fixed. Arm the
      // one-shot recovery again for the NEXT expiry — a socket that lives for hours will cross
      // more than one 15-minute access-token boundary.
      authRecoveryUsed = false;
      // Re-join all active organization rooms after (re)connect
      for (const orgId of activeOrgRooms) {
        logger.info(`🏢 Re-joining organization room after connect: org-${orgId}`);
        socket?.emit('join-organization', orgId);
      }
      // Events sent while the socket was down never arrive: tell the views to re-read once —
      // spread and rationed (scheduleReconnectResync). Local only — the server never sends it.
      if (reconnected) scheduleReconnectResync();
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
        const failed = socket;
        void ensureFreshSession().then(
          () => {
            // Torn down or replaced while renewing: the next socket connects on its own.
            if (!failed || socket !== failed) return;
            logger.info('🔓 Session renewed — reconnecting the WebSocket');
            failed.connect();
          },
          (err: unknown) =>
            afterRefusedRenewal(err, {
              retry: () => {
                // Torn down or replaced while we waited: this recovery is not for that socket.
                if (!failed || socket !== failed) return;
                authRecoveryUsed = false;
                failed.connect();
              },
              endSession: endSessionAndRedirect,
            })
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

/**
 * The socket's renewal was refused. Refused for RATE (429, or this tab's cool-down after one) says
 * nothing about the session — signing out there sent people to a login page the same limit then
 * refused. Reconnect once renewal may be tried again; any other refusal ends the session.
 */
export const afterRefusedRenewal = (
  err: unknown,
  actions: { retry: () => void; endSession: () => void }
): 'retry' | 'ended' => {
  if (isRateLimited(err)) {
    logger.info('⏳ Session renewal refused for rate — reconnecting the WebSocket after the wait');
    cancelSocketRecovery();
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      actions.retry();
    }, Math.max(refreshRetryInMs(), 1_000));
    return 'retry';
  }
  actions.endSession();
  return 'ended';
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

  // Debounce disconnect so the socket survives a no-subscriber gap. Between app pages there is
  // none any more: the app shell (<Layout> in AppShellRoute) stays mounted above the router
  // <Outlet>, so the refcount never hits 0 on those clicks. The gap remains when moving between
  // the app shell and the console shells (AdminShell/WorkspaceShell), where a lazy chunk's
  // Suspense fallback can outlast a 1s window — 5s spans a navigation + chunk load.
  const DISCONNECT_DEBOUNCE_MS = 5000;
  if (connectionCount <= 0 && socket) {
    logger.info(`⏳ Scheduling disconnect in ${DISCONNECT_DEBOUNCE_MS / 1000}s...`);
    disconnectTimeout = setTimeout(() => {
      if (connectionCount <= 0 && socket) {
        logger.info('🔌 Disconnecting WebSocket (no active users)');
        cancelSocketRecovery();
        socket.disconnect();
        // A re-read pending for the socket torn down is not for the next one.
        cancelReconnectResync();
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
  cancelSocketRecovery();
  if (disconnectTimeout) {
    clearTimeout(disconnectTimeout);
    disconnectTimeout = null;
  }
  if (socket) {
    logger.info('🔌 Force disconnecting WebSocket');
    socket.disconnect();
    // A re-read pending for the socket torn down is not for the next one.
    cancelReconnectResync();
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
