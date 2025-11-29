import { cva, type VariantProps } from 'class-variance-authority';

export const progressContainerVariants = cva(
  'w-full bg-gray-200 dark:bg-gray-700 overflow-hidden',
  {
    variants: {
      size: {
        sm: 'h-1',
        md: 'h-2',
        lg: 'h-3',
      },
      rounded: {
        none: 'rounded-none',
        sm: 'rounded-sm',
        md: 'rounded-md',
        full: 'rounded-full',
      },
    },
    defaultVariants: {
      size: 'md',
      rounded: 'full',
    },
  }
);

export const progressBarVariants = cva('h-full transition-all duration-300', {
  variants: {
    variant: {
      default: 'bg-primary',
      success: 'bg-green-500',
      warning: 'bg-yellow-500',
      danger: 'bg-red-500',
      secondary: 'bg-secondary',
    },
    rounded: {
      none: 'rounded-none',
      sm: 'rounded-sm',
      md: 'rounded-md',
      full: 'rounded-full',
    },
  },
  defaultVariants: {
    variant: 'default',
    rounded: 'full',
  },
});

export type ProgressVariantsType = VariantProps<typeof progressBarVariants>;

export const getProgressContainerClasses = (
  size?: VariantProps<typeof progressContainerVariants>['size'],
  rounded?: VariantProps<typeof progressContainerVariants>['rounded']
) => progressContainerVariants({ size, rounded });

export const getProgressBarClasses = (
  variant?: ProgressVariantsType['variant'],
  rounded?: ProgressVariantsType['rounded']
) => progressBarVariants({ variant, rounded });
