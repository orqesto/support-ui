import type { ReactNode } from 'react';

export type ChoiceCardProps = {
  /** This card is the current choice: a primary ring, and `aria-pressed`. */
  selected: boolean;
  onSelect: () => void;
  /**
   * Not selectable now (no plan, saving, …). Never native `disabled`: the card stays a focusable
   * Tab stop, aria-disabled and dimmed, and refuses its press — see `inactiveButtonProps`.
   */
  disabled?: boolean;
  /** Padding and rhythm of the card's content. Default `space-y-2 p-5`. */
  contentClassName?: string;
  className?: string;
  'data-testid'?: string;
  children: ReactNode;
};
