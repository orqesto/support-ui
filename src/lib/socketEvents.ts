/**
 * A LOCAL event the socket manager raises when the socket connects AGAIN after it had been
 * connected (a dropped network, a laptop waking, a renewed session) — never on its first connect.
 * While it was down, every server event was lost; a listener re-reads what it shows.
 *
 * Its own module, not socketManager: tests mock socketManager whole, and a listener subscribes to
 * this name through the ordinary `subscribeToEvent`.
 */
export const SOCKET_RECONNECTED_EVENT = 'app:socket-reconnected';
