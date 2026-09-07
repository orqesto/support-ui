import { create } from 'zustand';

/**
 * The BE's own-database pause codes (BYODB Phase 2 §3.6), as seen on a 503:
 * `DB_PROVISIONING` (the data is being moved), `DB_UNREACHABLE` (the client's Postgres is
 * not answering), `DB_SUSPENDED`. Set from the api-client response interceptor and read by
 * `DatabaseBanner`, so a paused workspace explains itself instead of failing every screen
 * with a generic "temporarily unavailable".
 *
 * Cleared by the next successful workspace-scoped response — the pause is over the moment
 * a request that needed the database got one. Not persisted.
 */
export type DatabasePauseCode = 'DB_PROVISIONING' | 'DB_UNREACHABLE' | 'DB_SUSPENDED';

export const DATABASE_PAUSE_CODES: readonly DatabasePauseCode[] = [
  'DB_PROVISIONING',
  'DB_UNREACHABLE',
  'DB_SUSPENDED',
];

export const isDatabasePauseCode = (code: unknown): code is DatabasePauseCode =>
  typeof code === 'string' && (DATABASE_PAUSE_CODES as readonly string[]).includes(code);

type DatabaseStatusState = {
  paused: DatabasePauseCode | null;
  message: string | null;
  setPaused: (code: DatabasePauseCode, message: string | null) => void;
  clear: () => void;
};

export const useDatabaseStatusStore = create<DatabaseStatusState>((set) => ({
  paused: null,
  message: null,
  setPaused: (code, message) => set({ paused: code, message }),
  clear: () => set({ paused: null, message: null }),
}));
