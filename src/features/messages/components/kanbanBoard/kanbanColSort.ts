import type { SortingState } from '@/features/messages/stores/messagesStore';
import { workspaceStateStorage } from '@/stores/workspaceScopedStorage';

/**
 * Each board column's sort, remembered for this user in this workspace (owner, 2026-11-11: a sort
 * picked on the board reset to newest-first on leaving the page or reloading). Same storage and
 * key scheme as the list view's sort (`messages-filters`), so both views keep the user's choice.
 */
export const KANBAN_COL_SORT_KEY = 'kanban-col-sort';

const SORT_BY: ReadonlySet<string> = new Set<SortingState['sortBy']>([
  'time',
  'priority',
  'sla',
  'priority_sla',
  'last_client_reply',
  'last_our_reply',
]);

const isSorting = (value: unknown): value is SortingState => {
  if (typeof value !== 'object' || value === null) return false;
  const { sortBy, sortOrder } = value as Record<string, unknown>;
  return (
    typeof sortBy === 'string' &&
    SORT_BY.has(sortBy) &&
    (sortOrder === 'asc' || sortOrder === 'desc')
  );
};

/** The saved column sorts; anything unreadable or unknown is dropped (that column sorts newest-first). */
export const loadColSort = (): Record<string, SortingState> => {
  try {
    const raw = workspaceStateStorage.getItem(KANBAN_COL_SORT_KEY);
    if (typeof raw !== 'string') return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, sort]) => isSorting(sort))
        .map(([colId, sort]) => {
          const { sortBy, sortOrder } = sort as SortingState;
          return [colId, { sortBy, sortOrder }];
        })
    );
  } catch {
    return {};
  }
};

export const saveColSort = (colSort: Record<string, SortingState>): void => {
  try {
    void workspaceStateStorage.setItem(KANBAN_COL_SORT_KEY, JSON.stringify(colSort));
  } catch {
    // Blocked storage: the sort lasts until reload.
  }
};
