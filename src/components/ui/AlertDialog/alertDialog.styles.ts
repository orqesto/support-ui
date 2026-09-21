import { cva, type VariantProps } from 'class-variance-authority';

export const alertDialogIconVariants = cva('w-6 h-6', {
  variants: {
    variant: {
      success: 'text-success',
      error: 'text-destructive',
      warning: 'text-warning',
      info: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

export type AlertDialogVariantsType = VariantProps<typeof alertDialogIconVariants>;

export const getAlertDialogIconClasses = (variant?: AlertDialogVariantsType['variant']) =>
  alertDialogIconVariants({ variant });
