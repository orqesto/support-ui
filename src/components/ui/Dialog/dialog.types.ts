import type { VariantProps } from 'class-variance-authority';
import type { dialogContentVariants, dialogOverlayVariants } from './dialog.styles';
import type { ReactNode } from 'react';

export type DialogProps = VariantProps<typeof dialogContentVariants> &
  VariantProps<typeof dialogOverlayVariants> & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
    className?: string;
    /**
     * Whether clicking the backdrop dismisses the dialog. Default true.
     *
     * Set false for anything the user is part-way through and cannot cheaply
     * redo — a payment form, most obviously. Escape and the close button still
     * work, so the dialog is never a trap; this only removes the ACCIDENTAL
     * dismissal, which is the one that loses work.
     */
    dismissOnOverlayClick?: boolean;
    /**
     * Phones (<640px) only: open as a bottom sheet — full width, 18px top corners, at most 88% of
     * the screen tall, footer buttons stretched to 44px. Default false: every other caller, and
     * every wider screen, keeps the centred dialog.
     */
    sheetOnPhone?: boolean;
  };

export type DialogSubComponentProps = {
  className?: string;
  children: ReactNode;
};

export type DialogCloseProps = {
  onClose: () => void;
};
