/**
 * Saved views — three built-in presets plus whatever the user names.
 *
 * The named ones are rows on the server now. They were localStorage, which made a view a
 * property of the BROWSER rather than of the person: it did not follow anyone to a second
 * machine, and clearing site data took it. The shape did not change, which is why moving
 * it was a swap of this module rather than a rewrite of its callers.
 *
 * localStorage is still here, in two roles: the fallback for the window where this
 * frontend is live and the endpoint is not (it ships from `main`, the API through
 * staging), and the source for the one-time upload of what people already saved.
 */
import { logger } from '@/lib/logger';
import { savedViewService, type RemoteSavedView } from '@/services/savedView.service';
import type { FilterState } from '@/stores/messagesStore';
import { keyAppliesInMode } from './filterSchema';

export type SavedView = {
  name: string;
  filters: Partial<FilterState>;
  /** Built-ins cannot be deleted. */
  builtIn?: boolean;
  /** The row's id, once it is one. Absent for built-ins and for local-only views. */
  id?: number;
};

const STORAGE_KEY = 'odly-inbox-saved-views';

/**
 * Mine and Unassigned carry no lifecycle. They answer "whose is it", and pinning them to
 * open threads was an extra assumption that also made them useless on the kanban board,
 * where every column hard-sets its own lifecycle and overrides anything shared.
 *
 * Inbox is lifecycle-only, so it is inherently a list-view idea — see `viewAppliesTo`.
 */
export const BUILT_IN_VIEWS: SavedView[] = [
  // No "Inbox"/"Open" preset: it was `lifecycle: 'open'` and nothing else, which the
  // Status filter already offers by that name. A pill that duplicates one click of an
  // existing control is a second way to reach the same place, and it was the only view
  // that could not work on the kanban board.
  { name: 'Mine', filters: { assigneeId: 'me' }, builtIn: true },
  { name: 'Unassigned', filters: { assigneeId: 'unassigned' }, builtIn: true },
  { name: 'Breached', filters: { slaBreached: true }, builtIn: true },
];

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;

/** This browser's copy. Anything malformed is dropped rather than thrown — a corrupt
 *  entry written by an older build must never take the inbox down with it. */
export const readLocalSavedViews = (): SavedView[] => {
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

const clearSavedViewStorage = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    logger.error('Saved views: could not clear storage', err);
  }
};

const fromRemote = (row: RemoteSavedView): SavedView => ({
  id: row.id,
  name: row.name,
  filters: row.filters,
});

/**
 * Where a user's own views are coming from right now.
 *
 * `local` is not a mode anyone chooses — it is what the UI falls back to when the
 * endpoint is not there, which is a real state for as long as the frontend is ahead of
 * the API. The distinction is visible to the caller because it changes what a delete
 * means, and it is worth telling the user their views are on this machine only.
 */
export type SavedViewSource = 'remote' | 'local';

export type LoadedSavedViews = { views: SavedView[]; source: SavedViewSource };

/**
 * Read the user's views, and carry across whatever this browser had saved.
 *
 * The upload runs once and only for names the server does not already have: someone with
 * a "VIP" on their laptop and a different "VIP" on the server keeps the server's, because
 * the alternative is a local copy silently overwriting the one their other machine also
 * sees. Storage is cleared only after every upload has been accepted — a half-migrated
 * user who loses the local copy loses views.
 */
export const loadSavedViews = async (): Promise<LoadedSavedViews> => {
  let remote: SavedView[];
  try {
    remote = (await savedViewService.list()).map(fromRemote);
  } catch (err) {
    // Not an error worth showing: an older API has no such route, and the local views
    // still work. Anything else (offline, 500) has the same right answer here.
    logger.error('Saved views: falling back to this browser’s copy', err);
    return { views: readLocalSavedViews(), source: 'local' };
  }

  const local = readLocalSavedViews();
  if (local.length === 0) return { views: remote, source: 'remote' };

  const taken = new Set(remote.map((view) => view.name));
  const toUpload = local.filter((view) => !taken.has(view.name));
  try {
    const uploaded = await Promise.all(
      toUpload.map((view) => savedViewService.save(view.name, view.filters))
    );
    clearSavedViewStorage();
    return { views: [...remote, ...uploaded.map(fromRemote)], source: 'remote' };
  } catch (err) {
    // Keep the local copy — it is the only one of these views that exists.
    logger.error('Saved views: could not carry this browser’s views across', err);
    return { views: [...remote, ...toUpload], source: 'remote' };
  }
};

/**
 * Can this view do anything in the current board mode?
 *
 * The kanban columns each hard-set `lifecycle` (and use `view` for the queue axis), and
 * a column's own filters win over the shared ones — so a lifecycle or queue filter
 * cannot move a single card no matter what the bar sends. A view built only from those
 * would light up, change the header count, and leave the board untouched. Better not to
 * offer it there at all.
 */
export const viewAppliesTo = (view: SavedView, isKanban: boolean): boolean =>
  Object.keys(view.filters).every((key) => keyAppliesInMode(key, isKanban));

/**
 * Is this view's filter set currently applied?
 *
 * A SUBSET test, not an exact one: the pills add to what is already on rather than
 * replacing it, so Mine and Breached can both be lit at once. Requiring an exact match
 * would leave both dark the moment you combined them — which read as the pills being
 * broken, since the same pair applied from the menu worked fine.
 */
export const viewIsActive = (view: SavedView, filters: FilterState): boolean =>
  Object.keys(view.filters).every((key) => {
    const want = (view.filters as Record<string, unknown>)[key];
    const got = (filters as Record<string, unknown>)[key];
    return String(want) === String(got);
  });
