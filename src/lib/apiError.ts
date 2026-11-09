import { withFailedFields } from '@/lib/errorMessages';

/**
 * Read the server's message off an error thrown by `apiClient`.
 *
 * 🪤 THE TRAP THIS EXISTS TO CLOSE. The api-client interceptor does NOT rethrow the axios
 * error — it builds a fresh `Error` and copies the status and body onto it. So `err.response`
 * is always `undefined` by the time a caller sees it, and `err.response.data.error` is
 * `undefined` too, silently. Code written against the axios shape compiles, passes review,
 * and never matches; a whole class of catch blocks was dead this way before anyone noticed,
 * and each one had quietly replaced a specific server message with a generic one.
 *
 * Read `status` and `data` off the error itself. That is what the interceptor sets.
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const enhanced = error as { data?: { error?: unknown; message?: unknown } } | null | undefined;
  const fromBody = enhanced?.data?.error ?? enhanced?.data?.message;
  if (typeof fromBody === 'string' && fromBody.trim().length > 0) {
    // The envelope is untouched, so the suffix is added here, once. `withFailedFields` is
    // shared with `getApiErrorMessage` and the interceptor so all three name a field the
    // same way — the second copy of this logic is what let #376 fix two call sites and miss
    // a hundred.
    return withFailedFields(fromBody, error);
  }

  // An ordinary Error (a network failure, say) still has something worth showing — but not
  // an empty string, and not the string "undefined". An api-client error arrives here only
  // when the body carried no message; the interceptor has already named any fields on it, so
  // this branch must NOT append again.
  if (error instanceof Error && error.message.trim().length > 0) return error.message;

  return fallback;
};

/** The HTTP status the interceptor recorded, when there was one. */
export const apiErrorStatus = (error: unknown): number | undefined =>
  (error as { status?: number } | null | undefined)?.status;

/**
 * A 404 that came from a backend with NO such route (an older deployment), not from a route that
 * answered "not found". Every route of ours answers a JSON envelope (`{ success, error }`); a
 * missing route answers Express's default HTML page ("Cannot PATCH …"), which the interceptor
 * carries as a string body. Keyed on the body's SHAPE, so "entry not found" from a route that
 * exists is never read as "this server cannot do that yet".
 */
export const isRouteAbsent = (error: unknown): boolean => {
  if (apiErrorStatus(error) !== 404) return false;
  const body = (error as { data?: unknown } | null | undefined)?.data;
  if (typeof body !== 'object' || body === null) return true;
  return !('success' in body) && !('error' in body) && !('message' in body);
};

/**
 * Thread presence send guard (spec §5.4): the server refused the reply because someone got there
 * first — another reply landed since the agent loaded the thread, or another agent is writing
 * one. Returns the server's ready-to-show question ("Anna replied 20 s ago — send anyway?"), or
 * null for any other failure (an in-flight 409 included), which keeps its usual handling.
 */
const COLLISION_CODES = new Set(['REPLY_NEWER_EXISTS', 'REPLY_OTHER_WRITING']);

export const replyCollisionQuestion = (err: unknown): string | null => {
  const failed = err as
    | { status?: number; data?: { code?: unknown; error?: unknown; message?: unknown } }
    | null
    | undefined;
  if (failed?.status !== 409) return null;
  const code = failed.data?.code;
  if (typeof code !== 'string' || !COLLISION_CODES.has(code)) return null;
  // The server's words as sent (the body), else what the api client put on the error.
  const text = [failed.data?.error, failed.data?.message, (err as Error | null)?.message].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  return text ?? null;
};
