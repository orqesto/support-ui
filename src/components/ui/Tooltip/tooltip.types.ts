import type { VariantProps } from 'class-variance-authority';
import type { tooltipVariants } from './tooltip.styles';
import type { ReactNode } from 'react';

export type TooltipProps = VariantProps<typeof tooltipVariants> & {
  content: ReactNode;
  children: ReactNode;
  delayDuration?: number;
  /** Classes for the trigger wrapper (default `inline-flex`). */
  className?: string;
  /**
   * Opt-in: a focus given by `focusWithoutTooltip` (focus handed back after a mouse press) does
   * not open the tooltip. Off by default — every other focus, and every other tooltip, unchanged.
   */
  quietFocus?: boolean;
};
