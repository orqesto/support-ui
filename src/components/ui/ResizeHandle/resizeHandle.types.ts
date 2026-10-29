export type ResizeHandleProps = {
  /** The size it controls, in px. */
  value: number;
  min: number;
  max: number;
  /** Called while dragging and on each arrow-key step, already clamped to [min, max]. */
  onChange: (value: number) => void;
  /** Called once a drag or a key step is finished — the moment to remember the size. */
  onCommit?: (value: number) => void;
  /** Double-click (or Home): back to the default size. */
  onReset?: () => void;
  /**
   * Which way grows it. `up`: the handle sits on the TOP edge of what it sizes (a reply box under a
   * conversation), so dragging up makes it taller.
   */
  grows?: 'up' | 'down';
  /** px per arrow-key press. */
  step?: number;
  /** What it resizes, for screen readers ("Resize the reply box"). */
  ariaLabel: string;
  className?: string;
};
