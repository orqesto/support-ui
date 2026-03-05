import type { VariantProps } from 'class-variance-authority';
import type { tooltipVariants } from './tooltip.styles';
import type { ReactNode } from 'react';

export type TooltipProps = VariantProps<typeof tooltipVariants> & {
  content: ReactNode;
  children: ReactNode;
  delayDuration?: number;
};
