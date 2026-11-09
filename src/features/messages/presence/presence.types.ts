/**
 * Thread presence (spec .planning/THREAD-PRESENCE-DESIGN-2026-11-09.md §5.1, §7): who else has a
 * thread open, and whether they are writing. The shapes the backend's presence socket sends.
 */
export type PresenceState = 'viewing' | 'writing_reply' | 'writing_note' | 'away';

/** The tunables the backend sends with every watch ack (platform settings, admin console). */
export interface PresenceSettings {
  enabled: boolean;
  heartbeatMs: number;
  expiryMs: number;
  writingIdleMs: number;
  awayAfterMs: number;
  listFlushMs: number;
  ticketWatchCap: number;
}

/** One agent on one thread. `since` (ISO) is when that agent's earliest entry there began. */
export interface PresenceViewer {
  userId: number;
  state: PresenceState;
  since: string;
}

/** `presence:watch` ack. Keys of `viewers` are survivor ids; `mapped` is requested → survivor. */
export interface WatchAck {
  ok: true;
  viewers: Record<string, PresenceViewer[]>;
  settings: PresenceSettings;
  mapped: Record<string, number>;
}

/** `presence:snapshot` ack: the live threads of the caller's teams. */
export interface SnapshotAck {
  ok: true;
  threads: Record<string, Array<{ userId: number; state: PresenceState }>>;
}

/** Server → client `presence:thread`: a watched thread's full viewer list (includes the caller). */
export interface PresenceThreadEvent {
  conversationId: number;
  viewers: PresenceViewer[];
}

/** Several tabs of one agent show as one entry with the strongest state (spec §5.1). */
export const PRESENCE_STATE_RANK: Record<PresenceState, number> = {
  writing_reply: 3,
  writing_note: 2,
  viewing: 1,
  away: 0,
};
