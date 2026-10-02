/**
 * The wait a 429 names, in milliseconds — or null when the answer carries none, or one too long
 * to hold a request open for (the limiter's own window is a minute; past this the user is better
 * served by the error than by a page that silently hangs).
 */
export const RATE_LIMIT_RETRY_MAX_SECONDS = 30;

export const rateLimitRetryAfterMs = (body: unknown): number | null => {
  const retryAfter = (body as { retryAfter?: unknown } | null | undefined)?.retryAfter;
  const seconds =
    typeof retryAfter === 'number'
      ? retryAfter
      : typeof retryAfter === 'string'
        ? Number(retryAfter.trim() === '' ? NaN : retryAfter)
        : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > RATE_LIMIT_RETRY_MAX_SECONDS)
    return null;
  return Math.ceil(seconds * 1000);
};
