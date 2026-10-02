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

/**
 * `sheetOnPhone` (message detail v4 mobile): pure CSS behind `max-sm:`, so nothing changes from
 * 640px up. The footer stretch reaches any footer marked `data-dialog-footer` (DialogFooter is).
 * Inputs go to 16px so iOS does not zoom the page on focus.
 */
export const DIALOG_SHEET_WRAPPER = 'max-sm:items-end';
export const DIALOG_SHEET_CONTENT =
  'max-sm:mx-0 max-sm:max-w-none max-sm:max-h-[88%] max-sm:rounded-t-[18px] max-sm:rounded-b-none max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:[&_[data-dialog-footer]>*]:flex-1 max-sm:[&_[data-dialog-footer]>*]:h-11 max-sm:[&_[data-dialog-footer]>*]:justify-center max-sm:[&_input]:text-base';
