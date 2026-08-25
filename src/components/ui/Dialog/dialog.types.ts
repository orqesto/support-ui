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
  };

export type DialogSubComponentProps = {
  className?: string;
  children: ReactNode;
};

export type DialogCloseProps = {
  onClose: () => void;
};
