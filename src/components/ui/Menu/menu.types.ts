import type { ReactNode } from 'react';

export type MenuProps = {
  /** Renders the control that opens the menu. Call `toggle` from its click handler. */
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  /** The items. A function receives `close`, for items that open something else first. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Accessible name of the menu panel. */
  ariaLabel: string;
  /** Which trigger edge the panel lines up with. */
  align?: 'start' | 'end';
  /** Panel width in px. */
  width?: number;
  className?: string;
};

export type MenuItemProps = {
  onSelect: () => void;
  children: ReactNode;
  /** Leading icon. */
  icon?: ReactNode;
  /** A muted note at the right edge (a department, a count). */
  hint?: ReactNode;
  /** Shows a tick and announces the item as a checked option. */
  checked?: boolean;
  /** Red text for a destructive action. */
  danger?: boolean;
  disabled?: boolean;
  /** Keep the menu open after selecting (a stepped picker). */
  keepOpen?: boolean;
};
