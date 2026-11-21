import type { components } from '@/types/generated/api';

type ReplyNotDelivered = components['schemas']['ReplyNotDelivered'];

/**
 * Decide what to tell an agent when a reply fails to send.
 *
 * Extracted from MessageDetail so the rule is testable on its own — it encodes a real
 * distinction, not just string formatting:
 *
 *  - 4xx carries user-facing copy from the BE and must survive to the screen. For a
 *    WhatsApp conversation outside its 24-hour window, "please try again" is actively
 *    wrong: retrying can never succeed, and the agent needs to know a Meta-approved
 *    template is the only way to continue.
 *  - 5xx is already scrubbed to a generic string by the api client; keep it generic here
 *    too so internals cannot leak, and because a server error genuinely IS retryable.
 *  - No status at all means a network failure, where retrying is exactly right.
 */
export const GENERIC_SEND_FAILURE = 'Failed to send. Please try again.';

export const resolveSendFailureMessage = (err: unknown): string => {
  const status = (err as { status?: number } | undefined)?.status;
  const isClientError = typeof status === 'number' && status >= 400 && status < 500;

  if (isClientError && err instanceof Error && err.message.trim()) {
    return err.message;
  }

  return GENERIC_SEND_FAILURE;
};

/**
 * The reply endpoint's 502 for a reply that was SAVED and not delivered (the contract's
 * ReplyNotDelivered): the saved reply's event and whether it may have gone out anyway. This is
 * what the `send-failed` socket event says too — read from the answer so a dropped socket cannot
 * hide it. Null for every other failure (a proxy's 502 names no event). Anything but an explicit
 * `uncertain: false` counts as uncertain: the agent is then warned before sending again.
 */
export const replyNotDelivered = (
  err: unknown
): {
  eventId: number;
  uncertain: boolean;
  /**
   * The backend's own sentence for a reply that certainly did not go out ("this customer has
   * blocked this workspace's Telegram bot…"): product copy written for the agent, and the only
   * place the cause is said. Null when uncertain (our wording warns then) or when none came. A
   * 5xx body WITHOUT an event id is never shown (a proxy's, or an internal error).
   */
  sentence: string | null;
  /** `retryable: false` in the body (a field the backend is adding): sending again cannot help. */
  retryable: boolean;
} | null => {
  const { status, data } = (err ?? {}) as {
    status?: unknown;
    // `retryable` is not in the generated contract yet: read from the raw body.
    data?: Partial<Record<keyof ReplyNotDelivered | 'retryable', unknown>> | null;
  };
  const eventId = data?.eventId;
  if (status !== 502 || typeof eventId !== 'number' || !Number.isInteger(eventId) || eventId <= 0)
    return null;
  const uncertain = data?.uncertain !== false;
  const sentence = typeof data?.error === 'string' ? data.error.trim() : '';
  return {
    eventId,
    uncertain,
    sentence: !uncertain && sentence !== '' ? sentence : null,
    retryable: data?.retryable !== false,
  };
};

/**
 * Can pressing Retry on the SAME draft possibly succeed? The mirror of the rule above: a 4xx is
 * the server refusing this send for a reason a resend does not change (a closed WhatsApp window,
 * a rejected recipient), so no Retry is offered; a 5xx or a network failure (no status) is
 * exactly what a retry is for.
 */
export const isRetryableSendFailure = (err: unknown): boolean => {
  const status = (err as { status?: number } | undefined)?.status;
  return !(typeof status === 'number' && status >= 400 && status < 500);
};
