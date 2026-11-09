/**
 * Whether clicking a quick-filter chip would actually change the list.
 *
 * The All chip used to re-patch `columnId`, `lifecycle` and `queue` to `'all'` on EVERY click,
 * including when all three were already `'all'`. Those values are not neutral on the backend:
 * `messageFilters` skips the default terminal/passive exclusion while a SPECIFIC lifecycle or
 * queue is set, and re-applies it for `'all'` or undefined. So clicking the already-lit chip
 * re-imposed an exclusion that a lens had lifted, and rows vanished — 16 of 72 on one workspace,
 * with the chip looking selected before and after.
 *
 * ⛔ The test is the RESULTING STATE, not which chip is lit. `All` also renders lit whenever no
 * column is selected — including while a dropdown is still narrowing the list — so skipping on
 * "already lit" would remove the only control that clears those dropdowns. The chip lying about
 * being active is a separate defect; this predicate is written so that fixing it later cannot
 * silently turn clearing into a no-op.
 *
 * Every other chip keeps its on/off toggle: turning one off passes `'all'` while `columnId` is
 * still that column, so the states differ and the patch goes through.
 */

/** The subset of the filter state a chip click can rewrite. */
export type QuickFilterState = {
  columnId?: string;
  lifecycle?: string;
  queue?: string;
};

/** Absent and `'all'` mean the same thing to these three fields. */
const asAll = (value: string | undefined): string => value ?? 'all';

/**
 * @param current  the filter state now
 * @param columnId the column the chip asks for (`'all'` for the All chip, or a toggle-off)
 * @returns whether a patch should be issued
 */
export const quickFilterWouldChange = (
  current: QuickFilterState,
  columnId: string
): boolean =>
  columnId !== asAll(current.columnId) ||
  asAll(current.lifecycle) !== 'all' ||
  asAll(current.queue) !== 'all';
