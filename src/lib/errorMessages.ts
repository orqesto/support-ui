/**
 * Centralized user-facing error copy. Replaces ~28 hand-rolled
 * "Failed to X. Please try again." strings with category-specific messages
 * derived from the BE response when available.
 */

/** Common BE status → user copy mapping. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid. Check the form for errors and try again.',
  401: 'Your session has expired. Sign in again to continue.',
  403: 'You don’t have permission to do that. Ask an admin if you think this is a mistake.',
  404: 'We couldn’t find what you were looking for.',
  409: 'That action conflicts with another change. Refresh and try again.',
  413: 'The file or content is too large.',
  422: 'Some fields didn’t pass validation. Review and try again.',
  429: 'You’re going too fast. Wait a moment and try again.',
  500: 'Something went wrong on our side. The error has been logged.',
  502: 'The service is temporarily unavailable. Try again in a moment.',
  503: 'The service is temporarily unavailable. Try again in a moment.',
  504: 'The request timed out. Check your connection and try again.',
};

/** The envelope the BE returns on a failure, in either transport shape. */
export type ApiErrorBody = { error?: string; message?: string; code?: string };

/**
 * Status of a caught API error, read from whichever shape it arrived in.
 *
 * 🪤 The api-client response interceptor does NOT rethrow the axios error. Whenever
 * the BE sends a body it builds a fresh `Error` and copies `status`/`data` onto it,
 * so `.response` is undefined for essentially every error a call site sees. It only
 * survives for bodiless failures (network drop, empty response). Reading just
 * `.response.status` compiles, type-checks and silently never matches — that is how
 * a 402 came to be retried four times and reported as a connection problem.
 */
export const getErrorStatus = (err: unknown): number | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const shape = err as { status?: number; response?: { status?: number } };
  return typeof shape.status === 'number' ? shape.status : shape.response?.status;
};

/** Parsed BE error envelope, from either the interceptor shape or a raw axios error. */
export const getErrorBody = (err: unknown): ApiErrorBody | undefined => {
  if (typeof err !== 'object' || err === null) return undefined;
  const shape = err as { data?: unknown; response?: { data?: unknown } };
  const body = shape.data ?? shape.response?.data;
  return typeof body === 'object' && body !== null ? (body as ApiErrorBody) : undefined;
};

/**
 * The BE's own message (`error`, then `message`) when it is SAFE TO DISPLAY.
 *
 * Deliberately returns nothing for a 5xx: the api-client interceptor masks those
 * messages precisely because a server error body can carry a stack frame, a SQL
 * fragment or a file path, and `data` still holds the unmasked original. Only 4xx
 * envelopes are copy the backend wrote for a human to read. Use `getErrorBody` if
 * you need the raw payload for a machine check (a `code`, say) rather than display.
 */
export const getApiErrorMessage = (err: unknown): string | undefined => {
  const status = getErrorStatus(err);
  if (status !== undefined && status >= 500) return undefined;
  const body = getErrorBody(err);
  const message = body?.error ?? body?.message;
  return typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined;
};

/**
 * Shared user-facing copy for the "no AI/LLM provider configured" state.
 * Kept here so every AI trigger surfaces identical wording.
 */
export const AI_NOT_CONFIGURED_MESSAGE =
  'AI not configured — connect a provider in Settings.';

/**
 * True when an error matches the BE's no-provider contract: an AI feature that
 * can't degrade returns HTTP 503 with body `{ code: 'AI_NOT_CONFIGURED', ... }`.
 * Reuse this in catch blocks so each AI trigger can show the same message.
 */
export const isAiNotConfiguredError = (err: unknown): boolean =>
  getErrorBody(err)?.code === 'AI_NOT_CONFIGURED';

/**
 * Best-effort extraction of a useful message from an unknown error.
 * Order: BE-supplied error string → status mapping → error.message → fallback.
 *
 * `scope` is the user-facing action name (e.g. "save note", "send reply") used
 * as the leading "Couldn't {scope}" — keep it lowercase verb + noun.
 */
export const formatError = (scope: string, err: unknown): string => {
  const status = getErrorStatus(err);
  const beMessage = getApiErrorMessage(err);
  if (beMessage) {
    return `Couldn't ${scope}: ${beMessage}`;
  }
  if (status && STATUS_MESSAGES[status]) {
    return `Couldn't ${scope}. ${STATUS_MESSAGES[status]}`;
  }
  if (err instanceof Error && err.message) {
    return `Couldn't ${scope}: ${err.message}`;
  }
  const looseMessage = (err as { message?: string } | null)?.message;
  if (typeof looseMessage === 'string' && looseMessage.trim().length > 0) {
    return `Couldn't ${scope}: ${looseMessage.trim()}`;
  }
  return `Couldn't ${scope}. The error has been logged.`;
};
