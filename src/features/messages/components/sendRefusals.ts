/**
 * Two refusals of a reply that only the thread's composer reads (kept out of `@/lib/apiError`,
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
 * A RESEND whose stored files could not be read (the backend's 409 with a sentence and no code —
 * every other resend refusal names its code): nothing was sent, the reply is still undelivered and
 * can be resent once its files are attached again.
 */
export const isStoredFilesUnreadable = (err: unknown): boolean => {
  const failed = err as { status?: number; data?: { code?: unknown } | null } | null | undefined;
  return failed?.status === 409 && (failed.data?.code ?? null) === null;
};
