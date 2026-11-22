/**
 * Refusals of a reply that only the thread's composer reads (kept out of `@/lib/apiError`,
 * which is in the main bundle).
 */

/**
 * The server refused the reply's idempotency key because it belongs to a send on ANOTHER thread.
 * Nothing was sent or stored for this reply, so a new key makes the same reply sendable.
 */
export const isSendKeyReused = (err: unknown): boolean => {
  const failed = err as { status?: number; data?: { code?: unknown } } | null | undefined;
  return failed?.status === 409 && failed.data?.code === 'REPLY_IDEMPOTENCY_KEY_REUSED';
};

/**
 * The reply (or the reply a resend names) is still being sent by an earlier request: nothing new
 * was stored. The send's key and its resend target stay, so the same Send cannot become a second
 * reply while the first is on its way.
 */
export const isSendInFlight = (err: unknown): boolean => {
  const failed = err as { status?: number; data?: { code?: unknown } } | null | undefined;
  return failed?.status === 409 && failed.data?.code === 'REPLY_SEND_IN_FLIGHT';
};

/**
 * A resend refused because the reply it names WAS delivered (`REPLY_RESEND_NOT_UNDELIVERED`):
 * nothing was sent again. Sending the same text now would reach the customer twice.
 */
export const isResendDelivered = (err: unknown): boolean => {
  const failed = err as { status?: number; data?: { code?: unknown } } | null | undefined;
  return failed?.status === 409 && failed.data?.code === 'REPLY_RESEND_NOT_UNDELIVERED';
};

/**
 * The backend's fixed sentence for a RESEND whose stored files could not be read (its 409 carries
 * no code — replyStoredFiles.ts `STORED_REPLY_FILES_UNREADABLE`). Keyed on that sentence: any
 * other codeless 409 is some other refusal, which ends the resend.
 */
export const STORED_FILES_UNREADABLE =
  'The files of the reply you are sending again could not be read — attach them again and send.';

/**
 * Nothing was sent, the reply is still undelivered and can be resent once its files are attached
 * again: the resend target stays and the server's sentence is shown.
 */
export const isStoredFilesUnreadable = (err: unknown): boolean => {
  const failed = err as
    | { status?: number; data?: { code?: unknown; error?: unknown } | null }
    | null
    | undefined;
  return (
    failed?.status === 409 &&
    (failed.data?.code ?? null) === null &&
    typeof failed.data?.error === 'string' &&
    failed.data.error.trim() === STORED_FILES_UNREADABLE
  );
};
