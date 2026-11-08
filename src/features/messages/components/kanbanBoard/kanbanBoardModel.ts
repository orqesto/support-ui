import type { ListScope, MessageThread, PaginationMeta } from '@/services/message.service';
import { COLUMNS } from '../kanbanColumns';

export const PAGE_SIZE = 20;

/**
 * A column whose read did not finish — timed out, or the request failed (500, 429, network): the
 * same words for all, since the column cannot tell which (review of #798).
 */
export const UNFINISHED_HINT = 'Not loaded';

/**
 * A column whose number is not exact: not finished, or counted to the search cap ("10,000+").
 * A sum over it is "at least" — the header read "10,0xx on this board" beside a "10,000+"
 * column (release review, 2026-11-02).
 */
export const notExact = (
  state: { unfinished?: boolean; totalCapped?: boolean } | undefined
): boolean => state?.unfinished === true || state?.totalCapped === true;

export type ColumnState = {
  threads: MessageThread[];
  total: number;
  /** `total` is a lower bound (a typed search counts to 10,000): shown as `10,000+`. */
  totalCapped?: boolean;
  loading: boolean;
  hasMore: boolean;
  page: number;
  /**
   * The last read of this column did not finish (timed out, or failed): the rows and `total` on
   * screen are not its answer. Drawn as "not loaded", never as "0" / "No … threads" — a searched
   * board read a timed-out Resolved column as "nothing resolved" (customer's workspace, 2026-11-02).
   */
  unfinished?: boolean;
};

export type MessagesKanbanHandle = {
  /**
   * Optimistically move a single card to its new lifecycle column WITHOUT
   * refetching the whole board — the instant-feedback path for the acting agent's
   * own reply / resolve / close. `targetColId` null just removes the card (it left
   * the lifecycle board, e.g. classified to a triage queue). A no-op if the card
   * isn't currently on the board. The card's column-derived badge + spine follow
   * the destination column, so no server round-trip is needed to render correctly.
   */
  optimisticMove: (threadId: string, targetColId: string | null) => void;
  /**
   * The same for a bulk run: every loaded card whose conversation is in `conversationIds` moves
   * at once, before the server answers. A bulk resolve of 60 threads used to leave all 60 cards in
   * place until its response came back — minutes on a busy database, or never if it timed out.
   */
  optimisticMoveMany: (conversationIds: number[], targetColId: string | null) => void;
};

// Column-implied conversation state, so a moved card's spine/direction (which read
// the thread's own lastReplyFromClient) match the destination column immediately.
export const COL_STATE_PATCH: Record<string, Partial<MessageThread>> = {
  open: { lastReplyFromClient: null },
  in_progress: { lastReplyFromClient: true },
  awaiting: { lastReplyFromClient: false },
  resolved: { isResolved: true },
};

/** First occurrence wins, so a row keeps the position the agent already saw it in. */
export const uniqueThreads = (threads: MessageThread[]): MessageThread[] => {
  const seen = new Set<string>();
  return threads.filter((thread) => {
    if (seen.has(thread.threadId)) return false;
    seen.add(thread.threadId);
    return true;
  });
};

export const initialColStates = (): Record<string, ColumnState> =>
  Object.fromEntries(
    COLUMNS.map((col) => [
      col.id,
      { threads: [], total: 0, loading: true, hasMore: false, page: 1 },
    ])
  );

// P2: map a Kanban column to its auto-arrival notification kind (badge source).
// ⛔ Keyed by `col.id` (see the header badge below), so there is no `suspicious` entry:
// #756 removed that column. The suspicious ARRIVAL count did not disappear with it — it is
// shown by `NotificationCenter`, which jumps to `?queue=suspicious`, the lens that replaced
// the column.
export const ARRIVAL_KIND_BY_COL: Record<string, 'spam_arrival'> = {
  spam: 'spam_arrival',
};

// Lifecycle columns the agent can hide to focus on live work. Open/In Progress/
// Pending are always shown; On-hold (paused) and Resolved (done) are reference
// columns, so they're toggleable + hidden by default. Preference persists per browser.
export const HIDEABLE_COLS = new Set(['on_hold', 'resolved']);

/**
 * Which triage columns COUNT toward the tab's badges — and why `no_lane` does not.
 *
 * ⛔ ONE definition, used by both the total badge and the unread badge. They were written
 * separately and the first draft of the Other column excluded it from one and not the
 * other, which is the same fix-the-file-not-the-class miss this repo keeps paying for.
 *
 * The badges mean "pending triage work" — a number an agent is meant to act on. The Other
 * lane is a coverage guarantee, not a queue: it holds whatever the other nine refuse, which
 * on one production workspace is 1,267 outbound echoes of our own sent mail. Summing those
 * would read as 1,267 items needing triage and bury the 30 that do.
 *
 * ⚠️ This withholds a CLAIM, never the rows: the column renders them, open by default.
 */
export const countsTowardTriageBadge = (col: { id: string; axis: string }): boolean =>
  col.axis === 'triage' && col.id !== 'no_lane';

// See loadBoardScope: an answer without `orphanOutgoing` comes from a backend that predates
// `view=board` and describes some other lens, so it is no answer at all.
export const boardScopeFrom = (answer: { scope?: ListScope | null; pagination: PaginationMeta }) =>
  answer.scope?.hiddenBecause.orphanOutgoing !== undefined
    ? {
        scope: answer.scope,
        shown: answer.pagination.total,
        shownCapped: answer.pagination.totalCapped === true,
      }
    : null;

// Pages per column the board read takes (support-service threadBoardController).
export const BOARD_MAX_PAGES = 10;

// The board read's count id for the scope; column ids never start with `__`.
export const BOARD_SCOPE_COUNT = '__board';
export const HIDDEN_COLS_KEY = 'kanban_hidden_cols';

export const loadHiddenCols = (): Set<string> => {
  try {
    const raw = localStorage.getItem(HIDDEN_COLS_KEY);
    // Default (no saved preference): On-hold + Resolved hidden, so the board opens
    // focused on live work (Open / In Progress / Pending). Once the agent toggles,
    // their choice is saved and wins.
    return raw
      ? new Set((JSON.parse(raw) as string[]).filter((id) => HIDEABLE_COLS.has(id)))
      : new Set(HIDEABLE_COLS);
  } catch {
    return new Set(HIDEABLE_COLS);
  }
};
