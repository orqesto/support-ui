/**
 * Where the notification panel opens, as pure geometry so it can be tested (jsdom computes no
 * layout, so this can only be checked as numbers).
 *
 * ⛔ Never over the sidebar. The bell sits in the sidebar's footer, so anchoring the panel at the
 * bell's LEFT edge laid the panel on top of the nav — seen on prod 2026-09-22. It opens to the
 * right of the sidebar when there is room.
 *
 * The height is capped to the space actually available. The old code assumed a 400px panel while
 * the real one is taller, and nothing stopped it running off a short window; the list inside
 * scrolls, so a cap hides nothing.
 */
export const PANEL_WIDTH = 360;
export const PANEL_GAP = 8;
/** Below this a panel is more annoying than useful — better to overflow than to show a sliver. */
export const PANEL_MIN_HEIGHT = 160;

export type PanelAnchor = {
  /** The bell's box. */
  trigger: { left: number; right: number; top: number; bottom: number };
  /** The sidebar's right edge, when the bell is inside one. */
  sidebarRight?: number;
  viewport: { width: number; height: number };
};

export type PanelPosition = { left: number; maxHeight: number; top?: number; bottom?: number };

export const notificationPanelPosition = ({
  trigger,
  sidebarRight,
  viewport,
}: PanelAnchor): PanelPosition => {
  const besideSidebar = (sidebarRight ?? trigger.right) + PANEL_GAP;
  const left =
    besideSidebar + PANEL_WIDTH + PANEL_GAP <= viewport.width
      ? besideSidebar
      : Math.max(PANEL_GAP, Math.min(trigger.left, viewport.width - PANEL_WIDTH - PANEL_GAP));

  const spaceBelow = viewport.height - trigger.bottom - PANEL_GAP;
  const spaceAbove = trigger.top - PANEL_GAP;
  const openDown = spaceBelow >= spaceAbove;
  const maxHeight = Math.max(PANEL_MIN_HEIGHT, Math.floor(openDown ? spaceBelow : spaceAbove));

  return openDown
    ? { left, maxHeight, top: trigger.bottom + PANEL_GAP }
    : { left, maxHeight, bottom: viewport.height - trigger.top + PANEL_GAP };
};
