import type { VariantProps } from 'class-variance-authority';
import type { confirmDialogIconVariants } from './confirmDialog.styles';

export type ConfirmDialogProps = VariantProps<typeof confirmDialogIconVariants> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
};
