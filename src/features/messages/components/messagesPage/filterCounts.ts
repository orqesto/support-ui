import type { FilterState } from '../../stores/messagesStore';

/** Visible badge count: kanban-hidden filters (status/sla) excluded. Moved unchanged from MessagesPage. */
export const countActiveFilters = (filters: FilterState, isKanban: boolean): number =>
  (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
  (filters.departmentId && filters.departmentId !== 'all' ? 1 : 0) +
  // List-view Status(lifecycle)+Queue dropdowns are hidden in kanban (it drives
  // its own columns), so they only count toward the visible badge in list mode.
  // Needs us is the landing VIEW (its pill, no token), not a filter someone added.
  (!isKanban && filters.lifecycle && filters.lifecycle !== 'all' && filters.lifecycle !== 'needs_us'
    ? 1
    : 0) +
  (!isKanban && filters.queue && filters.queue !== 'all' ? 1 : 0) +
  (!isKanban && filters.columnId && filters.columnId !== 'all' ? 1 : 0) +
  (!isKanban && filters.read && filters.read !== 'all' ? 1 : 0) +
  // Kanban's own lifecycle selector (threadStatus) still counts in kanban mode.
  (isKanban && filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
  (filters.priority && filters.priority !== 'all' ? 1 : 0) +
  (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
  (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
  (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
  (filters.linked && filters.linked !== 'all' ? 1 : 0) +
  (filters.receivedAt && filters.receivedAt !== 'all' ? 1 : 0) +
  // Received is one filter whether it is a bucket or an explicit range.
  ((filters.ageRange && filters.ageRange !== 'all') || filters.receivedFrom || filters.receivedTo
    ? 1
    : 0) +
  (filters.search?.trim() ? 1 : 0) +
  (filters.slaBreached ? 1 : 0) +
  (filters.slaAtRisk ? 1 : 0) +
  (filters.hasAttachments ? 1 : 0);

// Full count (no isKanban gate) — used for "Clear All" disabled state so that
// list-mode filters set before switching to kanban can still be cleared.
export const countClearableFilters = (filters: FilterState): number =>
  (filters.messageSourceId && filters.messageSourceId !== 'all' ? 1 : 0) +
  (filters.departmentId && filters.departmentId !== 'all' ? 1 : 0) +
  (filters.status && filters.status !== 'all' ? 1 : 0) +
  (filters.threadStatus && filters.threadStatus !== 'all' ? 1 : 0) +
  (filters.lifecycle && filters.lifecycle !== 'all' && filters.lifecycle !== 'needs_us' ? 1 : 0) +
  (filters.queue && filters.queue !== 'all' ? 1 : 0) +
  (filters.columnId && filters.columnId !== 'all' ? 1 : 0) +
  (filters.read && filters.read !== 'all' ? 1 : 0) +
  (filters.priority && filters.priority !== 'all' ? 1 : 0) +
  (filters.assigneeId && filters.assigneeId !== 'all' ? 1 : 0) +
  (filters.aiState && filters.aiState !== 'all' ? 1 : 0) +
  (filters.labelId && filters.labelId !== 'all' ? 1 : 0) +
  (filters.linked && filters.linked !== 'all' ? 1 : 0) +
  (filters.receivedAt && filters.receivedAt !== 'all' ? 1 : 0) +
  // Received is one filter whether it is a bucket or an explicit range.
  ((filters.ageRange && filters.ageRange !== 'all') || filters.receivedFrom || filters.receivedTo
    ? 1
    : 0) +
  (filters.search?.trim() ? 1 : 0) +
  (filters.slaBreached ? 1 : 0) +
  (filters.slaAtRisk ? 1 : 0) +
  (filters.hasAttachments ? 1 : 0);
