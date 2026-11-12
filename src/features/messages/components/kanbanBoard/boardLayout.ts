/*
  How the board lays its lanes out, chosen by the width the BOARD has, not the window: beside an
  open thread (split view) it gets about half the screen, where five lanes in a row were cut to
  "O…", "In …", "Pe…" on a 1440px window.

  - columns: lanes side by side, each scrolling down on its own (Trello) — when every lane gets
    at least LANE_MIN_WIDTH;
  - rows: lanes stacked, each a row of cards that scrolls sideways (drag it, or its ‹ › arrows),
    and the page scrolls down.

  Unmeasured (no ResizeObserver: tests) the window decides, as before: rows below xl, columns
  from xl.
*/
export type BoardLayout = 'columns' | 'rows';

/** A lane's narrowest width in columns (its header: name, count, sort chip). */
export const LANE_MIN_WIDTH = 260;
/** The gap between lanes in columns (`gap-3`). */
const LANE_GAP = 12;

export const boardLayoutFor = (width: number, lanes: number): BoardLayout =>
  width >= lanes * LANE_MIN_WIDTH + Math.max(0, lanes - 1) * LANE_GAP ? 'columns' : 'rows';

/**
 * The classes for one layout. Each argument is spelled out in full (Tailwind finds classes by
 * reading the source): `xl` holds the window-breakpoint classes used when the board is not
 * measured, `columns` the same classes unprefixed.
 */
export const byLayout = (
  layout: BoardLayout | undefined,
  classes: { xl: string; columns: string }
): string => (layout === undefined ? classes.xl : layout === 'columns' ? classes.columns : '');
