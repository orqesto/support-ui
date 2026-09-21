import { cva, type VariantProps } from 'class-variance-authority';

export const confirmDialogIconVariants = cva('w-6 h-6', {
  variants: {
    variant: {
      danger: 'text-destructive',
      warning: 'text-warning',
      info: 'text-muted-foreground',
      success: 'text-success',
    },
  },
  defaultVariants: {
    variant: 'danger',
  },
});

export const confirmDialogButtonVariants = cva('', {
  variants: {
    variant: {
      danger: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground',
      warning: 'bg-warning hover:bg-warning/90 text-warning-foreground',
      info: 'bg-primary hover:bg-primary/90 text-primary-foreground',
      success: 'bg-success hover:bg-success/90 text-success-foreground',
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
