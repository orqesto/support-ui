import { cva, type VariantProps } from 'class-variance-authority';

export const dialogOverlayVariants = cva('fixed inset-0', {
  variants: {
    blur: {
      none: 'bg-black/50',
      sm: 'bg-black/50 backdrop-blur-sm',
      md: 'bg-black/60 backdrop-blur-md',
      lg: 'bg-black/70 backdrop-blur-lg',
    },
  },
  defaultVariants: {
    blur: 'none',
  },
});

export const dialogContentVariants = cva(
  'overflow-y-auto relative mx-4 w-full rounded-lg shadow-lg bg-card',
  {
    variants: {
      size: {
        sm: 'max-w-sm max-h-[80vh]',
        md: 'max-w-lg max-h-[90vh]',
        lg: 'max-w-2xl max-h-[90vh]',
        xl: 'max-w-4xl max-h-[90vh]',
        full: 'max-w-7xl max-h-[95vh]',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export type DialogVariantsType = VariantProps<typeof dialogContentVariants>;

export const getDialogOverlayClasses = (
  blur?: VariantProps<typeof dialogOverlayVariants>['blur']
) => dialogOverlayVariants({ blur });

export const getDialogContentClasses = (size?: DialogVariantsType['size']) =>
  dialogContentVariants({ size });
