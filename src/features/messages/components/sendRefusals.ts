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
