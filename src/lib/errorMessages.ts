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
export type ApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  /**
   * The dotted paths a failed validation rejected. Typed `unknown` on purpose — it is
   * whatever arrived over the wire, and `failedFields` is the only thing that narrows it.
   */
  fields?: unknown;
};

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
 * The backend reports an issue with an EMPTY path as this literal — see `zodFieldPaths` in
 * its errorHandler. It is a marker meaning "the object as a whole", not a field name.
 */
const NOT_A_FIELD = '_';

/**
 * The dotted field paths a failed validation reports, when there are any usable ones.
 *
 * The server answers `{ error: 'Validation error', code: 'VALIDATION_FAILED', fields: [...] }`
 * and deliberately withholds zod's own message, because those messages describe the SCHEMA.
 * The paths are therefore the only thing in the envelope that says which input was wrong.
 *
 * ⛔ Filtered to non-empty strings and dropped when the list is empty. A server that ever
 * sends `fields: {}` or `[1, 2]` must not put "(check: )" or "(check: 1, 2)" in front of a
 * person — the suffix has to be worth more than the doubt it casts on the rest of the line.
 *
 * ⛔ `_` is dropped for the same reason, and it is NOT hypothetical. The backend's
 * `zodFieldPaths` maps an issue with an empty path to the literal `_` on purpose, so a client
 * never receives `VALIDATION_FAILED` with an empty list — and every `.strict()` schema raises
 * exactly that for an unknown key. Rendered verbatim it reads "check: _", which sends an
 * operator hunting for a field called underscore. Array indices are KEPT
 * (`messageSources.0.canView`): those name a real row on a repeated field.
 */
const failedFields = (err: unknown): string[] => {
  const raw = getErrorBody(err)?.fields;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (field): field is string =>
      typeof field === 'string' && field.trim().length > 0 && field.trim() !== NOT_A_FIELD
  );
};

/**
 * `message`, with the rejected fields named after it.
 *
 * Lives here rather than at a call site because the call sites are the problem: measured on
 * 2026-09-11, this app formats an API error for a human in ~104 places, and #376 reached two
 * of them. Anything that already goes through `getApiErrorMessage` (65 sites), `formatError`
 * → `toast.failure` (24) or the api-client interceptor's Error message (37 hand-rolled
 * `err.message` catch blocks) now names the field without being rewritten.
 */
export const withFailedFields = (message: string, err: unknown): string => {
  const fields = failedFields(err);
  return fields.length > 0 ? `${message} (check: ${fields.join(', ')})` : message;
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
  if (typeof message !== 'string' || message.trim().length === 0) return undefined;
  // The 5xx guard above already returned, so a suffix here can only ever describe a 4xx
  // envelope the backend wrote for a human — never a masked server message.
  return withFailedFields(message.trim(), err);
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
