import { TRIAGE_READ_COLUMN_IDS } from '@/lib/kanbanColumns';

/**
 * The read/unread filter's scope (moved out of `components/messages/filters/filterSchema` in
 * modularity task F2). The fields of the messages store's `FilterState` these helpers read, named
 * here so this file does not import the store, which imports it back.
 */
type TriageReadFilters = {
  queue?: string;
  columnId?: string;
  read?: 'all' | 'read' | 'unread';
};

/**
 * The lenses where read/unread is a real property of a thread.
 *
 * Read state is only ever WRITTEN from the triage surfaces — the per-row Mark
 * read/unread button and the "Mark as read?" prompt on close, both gated on
 * `isTriageMessage` (filtered = not_analysed + archived, suspicious, spam). Nothing marks
 * an ordinary inbox thread read: not opening it, not replying, not resolving.
 *
 * The backend predicate, by contrast, applies to EVERY conversation. Offering the control
 * outside triage therefore filtered on a column almost nothing writes: on the TraumaTeam
 * workspace `read=unread` returned 189 threads and `read=read` returned 3 — the only three
 * conversations in the workspace with a `conversation_reads` row. The filter was working;
 * there was no state for it to filter on, and no dot or toggle on those rows to show or
 * change it.
 *
 * ⛔ BOTH axes, not just `queue`. A triage lens is reached two ways and they are mutually
 * exclusive by construction: the Queue dropdown sets `queue`, while the quick chip sets
 * `columnId` and explicitly zeroes `queue` (MessagesPage — "selecting a column supersedes
 * the dropdown filters it overlaps with"). Keying on `queue` alone hid the control on
 * exactly the chips an agent uses to reach Suspicious and Spam.
 *
 * `TRIAGE_READ_COLUMN_IDS` is reused rather than restated: it is already the set of
 * columns that render the unread dot (`KanbanCard`), and a second hand-written copy is
 * how the two drift.
 */
export const readAppliesTo = (filters: TriageReadFilters): boolean =>
  (typeof filters.queue === 'string' && TRIAGE_READ_COLUMN_IDS.has(filters.queue)) ||
  (typeof filters.columnId === 'string' && TRIAGE_READ_COLUMN_IDS.has(filters.columnId));

/**
 * Drop a `read` value that the current lens cannot honour.
 *
 * Applied in the store's mutators, so ONE rule covers the token bar, the active-filter
 * count, the request and the shared URL alike. Without it, leaving a triage lens would
 * hide the control while the value kept narrowing the list — the invisible filter is
 * worse than the useless one it replaces.
 */
export const scopeReadToTriage = <T extends TriageReadFilters>(filters: T): T =>
  ('queue' in filters || 'columnId' in filters) &&
  !readAppliesTo(filters) &&
  filters.read &&
  filters.read !== 'all'
    ? { ...filters, read: 'all' }
    : filters;
