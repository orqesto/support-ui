/**
 * What the inbox rows and kanban cards show about presence (spec §5.3, §6): per conversation, the
 * agents on it and their states, as the server's `presence:snapshot` and `presence:summary` send
 * them — the caller included (RowPresence filters it out). Entries keep their array identity while
 * unchanged, so a row subscribed to one conversation does not re-render for another.
 */
import { create } from 'zustand';
import type { PresenceState } from './presence.types';

export interface SummaryUser {
  userId: number;
  state: PresenceState;
}

export interface SummaryChange {
  conversationId: number;
  users: SummaryUser[];
}

/** The one empty list every row without viewers gets (a stable reference). */
export const NO_VIEWERS: readonly SummaryUser[] = Object.freeze([]);

interface PresenceSummaryStore {
  byConversation: Record<number, readonly SummaryUser[]>;
  /** False until a snapshot succeeds; false again on a disconnect or a later refusal. */
  available: boolean;
  applySnapshot: (threads: Record<string, SummaryUser[]>) => void;
  applyChanges: (changes: SummaryChange[]) => void;
  setAvailable: (available: boolean) => void;
  reset: () => void;
}

const sameUsers = (left: readonly SummaryUser[], right: readonly SummaryUser[]): boolean =>
  left.length === right.length &&
  left.every(
    (user, index) => user.userId === right[index].userId && user.state === right[index].state
  );

const clean = (users: SummaryUser[]): SummaryUser[] =>
  users.map((user) => ({ userId: user.userId, state: user.state }));

export const usePresenceSummaryStore = create<PresenceSummaryStore>((set) => ({
  byConversation: {},
  available: false,
  applySnapshot: (threads) =>
    set((store) => {
      const next: Record<number, readonly SummaryUser[]> = {};
      for (const [key, users] of Object.entries(threads)) {
        const id = Number(key);
        if (!Number.isInteger(id) || !Array.isArray(users) || users.length === 0) continue;
        const before = store.byConversation[id];
        const fresh = clean(users);
        next[id] = before && sameUsers(before, fresh) ? before : fresh;
      }
      return { byConversation: next };
    }),
  applyChanges: (changes) =>
    set((store) => {
      const next = { ...store.byConversation };
      let changed = false;
      for (const change of changes) {
        const id = change?.conversationId;
        if (!Number.isInteger(id) || !Array.isArray(change.users)) continue;
        if (change.users.length === 0) {
          if (id in next) {
            delete next[id];
            changed = true;
          }
          continue;
        }
        const fresh = clean(change.users);
        const before = next[id];
        if (before && sameUsers(before, fresh)) continue;
        next[id] = fresh;
        changed = true;
      }
      return changed ? { byConversation: next } : store;
    }),
  setAvailable: (available) => set({ available }),
  reset: () => set({ byConversation: {}, available: false }),
}));
