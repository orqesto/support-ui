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
/**
 * The dotted field paths a failed validation reports, when there are any usable ones.
 *
 * The server answers `{ error: 'Validation error', code: 'VALIDATION_FAILED', fields: [...] }`
 * and deliberately withholds zod's own message, because those messages describe the schema.
 * So the paths are the ONLY thing that says which input was wrong — and nothing read them: a
 * console full of fields said "Validation error" and left the operator to guess.
 *
 * Observed on taco prod, 2026-09-11: `PATCH /api/admin/platform/settings/ai` rejected
 * `bedrockRoleArn` and the screen could not name it.
 *
 * ⛔ Filtered to strings and dropped when empty. A server that ever sends `fields: {}` or
 * `[1, 2]` must not put "(check: )" in front of a person.
 */
const failedFields = (data: { fields?: unknown } | undefined): string[] => {
  const raw = data?.fields;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (field): field is string => typeof field === 'string' && field.trim().length > 0
  );
};

export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const enhanced = error as
    | { data?: { error?: unknown; message?: unknown; fields?: unknown } }
    | null
    | undefined;
  const fromBody = enhanced?.data?.error ?? enhanced?.data?.message;
  if (typeof fromBody === 'string' && fromBody.trim().length > 0) {
    const fields = failedFields(enhanced?.data);
    return fields.length > 0 ? `${fromBody} (check: ${fields.join(', ')})` : fromBody;
  }

  // An ordinary Error (a network failure, say) still has something worth showing — but not
  // an empty string, and not the string "undefined".
  if (error instanceof Error && error.message.trim().length > 0) return error.message;

  return fallback;
};

/** The HTTP status the interceptor recorded, when there was one. */
export const apiErrorStatus = (error: unknown): number | undefined =>
  (error as { status?: number } | null | undefined)?.status;
