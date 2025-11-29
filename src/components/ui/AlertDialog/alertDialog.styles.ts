import { cva, type VariantProps } from 'class-variance-authority';

export const alertDialogIconVariants = cva('w-6 h-6', {
  variants: {
    variant: {
      success: 'text-green-600 dark:text-green-400',
      error: 'text-red-600 dark:text-red-400',
      warning: 'text-yellow-600 dark:text-yellow-400',
      info: 'text-blue-600 dark:text-blue-400',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

export type AlertDialogVariantsType = VariantProps<typeof alertDialogIconVariants>;

export const getAlertDialogIconClasses = (variant?: AlertDialogVariantsType['variant']) =>
  alertDialogIconVariants({ variant });
