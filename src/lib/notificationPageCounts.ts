/**
 * Exact bell counts from a notifications page.
 *
 * `GET /api/notifications` (and each kind of `/by-kind`) sends the newest 20 rows, `total` (every
 * visible row) and — since 2026-11-04 — `unreadTotal` (every visible UNREAD row). A count taken
 * from the rows alone is the count of whatever landed on the page: on staging the bell's tab
 * title went UP when an admin lock hid a kind (other rows took the page), and read 15 with 18
 * unread. These helpers give the part of the server's count that lies BEYOND the page, so a hook
 * keeps its live +1 / -1 on the rows it holds and adds the rest.
 *
 * Only trusted when the client kept every row it was sent: a row dropped client-side means the
 * server answered something wider than asked (an old backend that ignored a filter), and its
 * counts then cover rows this surface does not own. An absent field (old backend) gives 0 — the
 * page count, today's behaviour.
 */
type PagePayload = {
  notifications: unknown[];
  total?: unknown;
  unreadTotal?: unknown;
};

/** Visible rows the server has beyond the page it sent (0 when unknown). */
export const rowsBeyondPage = (payload: PagePayload, keptRows: number): number =>
  typeof payload.total === 'number' && keptRows === payload.notifications.length
    ? Math.max(0, payload.total - keptRows)
    : 0;

/** Unread rows the server has beyond the page it sent (0 when unknown or an old backend). */
export const unreadBeyondPage = (
  payload: PagePayload,
  keptRows: number,
  unreadOnPage: number
): number =>
  typeof payload.unreadTotal === 'number' && keptRows === payload.notifications.length
    ? Math.max(0, payload.unreadTotal - unreadOnPage)
    : 0;
