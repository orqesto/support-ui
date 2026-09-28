/**
 * Inbox select mode (owner, 2026-09-28): a row's box is HIDDEN until the row is hovered or
 * holds keyboard focus; once anything is selected, every row shows its box until the
 * selection is empty again.
 *
 * Hidden means `opacity-0`, never `display:none` / `hidden` / `sr-only`: the box stays in the
 * tab order and in the accessibility tree, so a keyboard or screen-reader user reaches and hears
 * it exactly as before. It also keeps its space — the row's reserved right padding does not
 * depend on the box being visible, so nothing moves when select mode starts.
 *
 * `pointer-events-none` while hidden: on a touch screen there is no hover, and a tap on an
 * invisible box would silently select a row the agent meant to OPEN. A mouse reaches the box
 * only through the row, which is already hovered by then, so it is clickable when it matters.
 */

/** Put on the row/card root. Named, so it cannot be confused with other `group`s around it. */
export const SELECT_GROUP_CLASS = 'group/select';

/**
 * On a touch screen a long-press selects the row (useLongPress, 450 ms) — and iOS starts its own
 * text selection + copy callout at about the same moment, so one press would do both. Touch
 * screens only (`pointer: coarse`): a mouse user can still select and copy a row's text.
 * Applied only to rows that CAN be selected — the others have no long-press to protect.
 */
export const TOUCH_PRESS_GUARD_CLASS =
  '[@media(pointer:coarse)]:select-none [@media(pointer:coarse)]:[-webkit-touch-callout:none]';

export const selectBoxRevealClass = (alwaysShown: boolean): string =>
  alwaysShown
    ? 'opacity-100'
    : 'opacity-0 pointer-events-none transition-opacity group-hover/select:opacity-100 group-hover/select:pointer-events-auto group-focus-within/select:opacity-100 group-focus-within/select:pointer-events-auto';

/** How a row asks for a toggle: `range` is a shift-click (see `useBulkSelection.toggleRange`). */
export type ToggleSelected = (conversationId: number, options?: { range: true }) => void;

/**
 * Whether the click that changed a checkbox was a shift-click. React fires a checkbox's
 * `onChange` from the native CLICK, so the click's modifier keys are on `nativeEvent`; a
 * keyboard Space toggle arrives as a click without them.
 */
export const isRangeClick = (nativeEvent: Event): boolean =>
  'shiftKey' in nativeEvent && (nativeEvent as MouseEvent).shiftKey === true;

/**
 * The row attribute the `x` shortcut looks for: the conversation id of the row that holds
 * keyboard focus. Present only on rows that can be selected (never a `spamlog_` row).
 */
export const SELECT_ID_ATTRIBUTE = 'data-select-id';
