import { toast as sonnerToast, type ExternalToast } from 'sonner';
import { formatError } from './errorMessages';

/**
 * `position` moves one toast off its usual corner — for a notice about something that sits in
 * that corner (the open-tabs row's ▾ menu is top right, under the default stack).
 */
type ToastOptions = Pick<ExternalToast, 'description' | 'duration' | 'position'>;

/**
 * Centralized toast wrapper. Pages/components import from `@/lib/toast`
 * instead of sonner directly so the underlying library can be swapped
 * without rippling through call sites.
 */
export const toast = {
  success: (message: string, opts?: ToastOptions): void => {
    sonnerToast.success(message, opts);
  },
  info: (message: string, opts?: ToastOptions): void => {
    sonnerToast.info(message, opts);
  },
  warning: (message: string, opts?: ToastOptions): void => {
    sonnerToast.warning(message, opts);
  },
  error: (message: string, opts?: ToastOptions): void => {
    sonnerToast.error(message, opts);
  },
  /**
   * Convenience for the common "couldn't {scope}" failure case. Pulls a
   * user-friendly message out of the error via formatError and emits as
   * an error toast.
   */
  failure: (scope: string, err: unknown, opts?: ToastOptions): void => {
    sonnerToast.error(formatError(scope, err), opts);
  },
};
