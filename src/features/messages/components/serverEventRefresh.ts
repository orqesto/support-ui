import type { MessageThread } from '@/services/message.service';
import type { FilterState } from '@/stores/messagesStore';

/** The org-wide socket events the Threads page follows, besides new mail. */
export type ServerChangeEvent =
  | 'ticket:updated'
  | 'conv:status_changed'
  | 'conversation:updated'
  | 'message:replied'
  | 'conversation:routed';

/**
 * What one of those events makes the Threads page re-read (both coalesced):
 *  - 'list' — the list (and with it the counts and the board), as every event did before;
 *  - 'counts' — only the view counts: the event cannot have changed a row on screen, and cannot
 *    have brought a new row into the page shown.
 */
export type ServerEventRefresh = 'list' | 'counts';

export type ShownView = {
  /** Only the thread list's own rows are known here; the board and contacts read their own. */
  displayMode: 'threads' | 'kanban' | 'contacts';
  page: number;
  filters: FilterState;
  rows: readonly MessageThread[];
};

const numberOr = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The conversation ids a row stands for: the one it shows and the one its signals come from. */
const rowShows = (rows: readonly MessageThread[], conversationId: number): boolean =>
  rows.some(
    (row) =>
      row.latestMessage?.id === conversationId || row.latestIncomingMessage?.id === conversationId
  );

/** The team(s) the list is filtered to, or null when the filter admits any team. */
const filteredTeams = (filters: FilterState): Set<number> | null => {
  const raw = filters.departmentId;
  if (!raw || raw === 'all' || raw === 'needs_routing') return null;
  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return ids.length > 0 ? new Set(ids) : null;
};

/**
 * ⛔ The rule errs toward 'list'. A row that should newly appear in the view must never be
 * missed, and the browser CANNOT tell from a payload whether a thread it does not show now
 * belongs in the view: the lifecycle the list filters on (Needs us, Pending, On hold…) is derived
 * on the server from fields no event carries (who wrote last, the park, the spam verdict), and a
 * reply moves a thread to the top of a newest-first page. So only two facts the payload DOES carry
 * are trusted, and only on the list's first page (a thread leaving an earlier page would shift a
 * later one by a row):
 *
 *  1. `ticket:updated` names a ticket, not a thread. A ticket's status shows on its thread's row
 *     (the chip) and is a filter (`linkedTicketStatus`); it moves nothing else — a ticket that
 *     resolves its threads announces that with its own `conversation:updated`. No row on screen
 *     with a ticket and no ticket filter ⇒ nothing on screen can change.
 *  2. `conversation:routed` (to `departmentId`) and `conv:status_changed` (carries the thread's
 *     `departmentId`) about a thread NOT on screen, while the list is filtered to other teams: the
 *     thread is in none of them, so it cannot enter.
 *
 * Everything else re-reads the list as before: `conversation:updated` and `message:replied`
 * (no team; a bulk run or a merge announces ONE id for many threads), a thread on screen (no
 * endpoint returns one row of the list, so the row cannot be re-read alone), the board and
 * contacts (their rows are not known here), any later page.
 */
export const refreshForServerEvent = (
  event: ServerChangeEvent,
  payload: unknown,
  view: ShownView
): ServerEventRefresh => {
  if (view.displayMode !== 'threads' || view.page !== 1) return 'list';
  const data = (payload ?? {}) as Record<string, unknown>;

  if (event === 'ticket:updated') {
    const ticketFilter =
      (view.filters.linked ?? 'all') !== 'all' ||
      (view.filters.linkedTicketStatus ?? 'all') !== 'all';
    const ticketOnScreen = view.rows.some((row) => row.hasTicket || (row.ticketCount ?? 0) > 0);
    return ticketFilter || ticketOnScreen ? 'list' : 'counts';
  }

  if (event === 'conversation:routed' || event === 'conv:status_changed') {
    const conversationId = numberOr(data.conversationId);
    const team = numberOr(data.departmentId);
    const teams = filteredTeams(view.filters);
    if (conversationId === null || team === null || teams === null) return 'list';
    if (rowShows(view.rows, conversationId)) return 'list';
    return teams.has(team) ? 'list' : 'counts';
  }

  return 'list';
};
