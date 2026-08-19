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
