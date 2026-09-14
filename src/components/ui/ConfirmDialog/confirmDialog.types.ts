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
  /**
   * Drop the confirm button entirely, leaving only dismiss.
   *
   * For a dialog that exists to EXPLAIN why an action cannot be taken. Offering a button
   * that the API will refuse is worse than offering none: it turns a clear explanation into
   * a raw error toast, which is what the console did for an IdP-owned account once the
   * server stopped honouring the acknowledgement override.
   */
  hideConfirm?: boolean;
};
