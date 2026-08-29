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
  if (typeof fromBody === 'string' && fromBody.trim().length > 0) return fromBody;

  // An ordinary Error (a network failure, say) still has something worth showing — but not
  // an empty string, and not the string "undefined".
  if (error instanceof Error && error.message.trim().length > 0) return error.message;

  return fallback;
};

/** The HTTP status the interceptor recorded, when there was one. */
export const apiErrorStatus = (error: unknown): number | undefined =>
  (error as { status?: number } | null | undefined)?.status;
