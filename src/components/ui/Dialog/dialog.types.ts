import type { VariantProps } from 'class-variance-authority';
import type { dialogContentVariants, dialogOverlayVariants } from './dialog.styles';
import type { ReactNode } from 'react';

export type DialogProps = VariantProps<typeof dialogContentVariants> &
  VariantProps<typeof dialogOverlayVariants> & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
    className?: string;
  };

export type DialogSubComponentProps = {
  className?: string;
  children: ReactNode;
};

export type DialogCloseProps = {
  onClose: () => void;
};
