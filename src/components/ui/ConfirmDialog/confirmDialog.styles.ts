import { cva, type VariantProps } from 'class-variance-authority';

export const confirmDialogIconVariants = cva('w-6 h-6', {
  variants: {
    variant: {
      danger: 'text-red-600 dark:text-red-400',
      warning: 'text-yellow-600 dark:text-yellow-400',
      info: 'text-blue-600 dark:text-blue-400',
      success: 'text-green-600 dark:text-green-400',
    },
  },
  defaultVariants: {
    variant: 'danger',
  },
});

export const confirmDialogButtonVariants = cva('', {
  variants: {
    variant: {
      danger: 'bg-red-600 hover:bg-red-700 text-white',
      warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
      info: 'bg-blue-600 hover:bg-blue-700 text-white',
      success: 'bg-green-600 hover:bg-green-700 text-white',
    },
  },
  defaultVariants: {
    variant: 'danger',
  },
});

export type ConfirmDialogVariantsType = VariantProps<typeof confirmDialogIconVariants>;

export const getConfirmDialogIconClasses = (variant?: ConfirmDialogVariantsType['variant']) =>
  confirmDialogIconVariants({ variant });

export const getConfirmDialogButtonClasses = (variant?: ConfirmDialogVariantsType['variant']) =>
  confirmDialogButtonVariants({ variant });
