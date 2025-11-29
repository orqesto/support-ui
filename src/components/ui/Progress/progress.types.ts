import type { VariantProps } from 'class-variance-authority';
import type { progressBarVariants, progressContainerVariants } from './progress.styles';

export type ProgressProps = {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  variant?: VariantProps<typeof progressBarVariants>['variant'];
  size?: VariantProps<typeof progressContainerVariants>['size'];
  rounded?: VariantProps<typeof progressBarVariants>['rounded'];
};
