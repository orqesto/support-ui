/**
 * Saved views — four built-in presets plus whatever the user names.
 *
 * Persisted to localStorage, deliberately: a view is a shortcut, not a shared artefact,
 * and putting it in the backend would mean a table, endpoints and a migration for
 * something that has not yet proved it earns them. The shape below is the one a future
 * backend would store, so moving it later is a swap of this module, not a rewrite of
 * its callers.
 */
import { logger } from '@/lib/logger';
import type { FilterState } from '@/stores/messagesStore';
import type { FilterKey } from './filterSchema';

export type SavedView = {
  name: string;
  filters: Partial<FilterState>;
  /** Built-ins cannot be deleted. */
  builtIn?: boolean;
};

const STORAGE_KEY = 'odly-inbox-saved-views';

export const BUILT_IN_VIEWS: SavedView[] = [
  { name: 'Inbox', filters: { lifecycle: 'open' }, builtIn: true },
  { name: 'Mine', filters: { assigneeId: 'me', lifecycle: 'open' }, builtIn: true },
  { name: 'Unassigned', filters: { assigneeId: 'unassigned', lifecycle: 'open' }, builtIn: true },
  { name: 'Breached', filters: { slaBreached: true }, builtIn: true },
];

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

/** Anything malformed is dropped rather than thrown — a corrupt entry written by an
 *  older build must never take the inbox down with it. */
export const loadSavedViews = (): SavedView[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is SavedView =>
        isRecord(row) && typeof row.name === 'string' && isRecord(row.filters)
    );
  } catch (err) {
    logger.error('Saved views: could not read storage', err);
    return [];
  }
};

export const persistSavedViews = (views: SavedView[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views.filter((view) => !view.builtIn)));
  } catch (err) {
    logger.error('Saved views: could not write storage', err);
  }
};

/**
 * Does the current filter state ARE this view?
 *
 * Compared on the keys the view names plus the keys currently set, so "Inbox" only
 * lights up on exactly `lifecycle: open` — not on `lifecycle: open` with three more
 * filters piled on, which is a different thing to be looking at.
 */
export const viewIsActive = (
  view: SavedView,
  filters: FilterState,
  activeKeys: FilterKey[]
): boolean => {
  const viewKeys = Object.keys(view.filters);
  if (viewKeys.length !== activeKeys.length) return false;
  return viewKeys.every((key) => {
    const want = (view.filters as Record<string, unknown>)[key];
    const got = (filters as Record<string, unknown>)[key];
    return String(want) === String(got);
  });
};
