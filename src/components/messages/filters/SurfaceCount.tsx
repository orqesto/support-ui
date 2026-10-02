/**
 * How much of the open surface is on screen: a range on the list, the board's own total on
 * the kanban, the contact count on contacts.
 *
 * It sat at the right end of the saved-views row; Messages list v2 moves it into the page
 * header beside the view switch, where it reads as "what this view holds". One component so
 * the two places cannot word it differently.
 */
export const SurfaceCount = ({
  pagination,
  isKanban = false,
  noun,
  className,
}: {
  pagination: { page: number; limit: number; total: number };
  isKanban?: boolean;
  /** Contacts count people, not a range of rows ("12 contacts"). */
  noun?: string;
  className?: string;
}) => {
  const { total } = pagination;
  // The range, not a match count: it answers "where am I in this list", which a count
  // cannot, and deep paging is exactly when that matters.
  const rangeStart = (pagination.page - 1) * pagination.limit + 1;
  const rangeEnd = Math.min(pagination.page * pagination.limit, total);
  /**
   * ⛔ The board has no range to report. Its columns page INDEPENDENTLY (20 at a time
   * each), so "1–50" describes no state the agent can be in — and the count beside it was
   * the LIST's, from a query the board never ran. On a real workspace that rendered
   * "1–50 of 53" above a board whose own badge said 64: `view=work_queue` pins
   * `status IN ACTIVE_STATUSES`, which omits `needs_routing`, while the board's Open lane
   * includes those 11 threads and shows them badged "Needs routing". Two counts, one
   * screen, nothing saying they answered different questions.
   */
  const hasRange = !isKanban && !noun;

  return (
    <span className={className ?? 'text-[12.5px] text-muted-foreground tabular-nums'}>
      {total > 0 ? (
        noun ? (
          <>
            <b className="font-mono font-semibold text-foreground/70">{total}</b> {noun}
          </>
        ) : hasRange ? (
          <>
            <b className="font-mono font-semibold text-foreground/70">
              {rangeStart}–{rangeEnd}
            </b>{' '}
            of {total}
          </>
        ) : (
          <>
            <b className="font-mono font-semibold text-foreground/70">{total}</b> on this board
          </>
        )
      ) : (
        `No ${noun ?? 'messages'}`
      )}
    </span>
  );
};
