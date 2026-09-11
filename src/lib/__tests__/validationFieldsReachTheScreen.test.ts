/**
 * A rejected field must be NAMED wherever the rejection is shown — not only in the one
 * helper that happened to be patched.
 *
 * 2026-09-11 (#376) taught `apiErrorMessage` to append `(check: bedrockRoleArn)`. Measured
 * afterwards against the live console: `apiErrorMessage` has TWO non-test call sites in the
 * whole app. The other user-facing paths were untouched — `getApiErrorMessage` (65 sites),
 * `toast.failure` → `formatError` (24), and 37 hand-rolled
 * `err instanceof Error ? err.message : fallback` catch blocks. So the screen that prompted
 * the fix — Console → Platform Defaults → Managed AI — still said nothing at all.
 *
 * These tests pin the two levers that together cover all of them:
 *   1. `getApiErrorMessage` reads the envelope, so `formatError`/`toast.failure` inherit it;
 *   2. the api-client interceptor puts the suffix on the Error's own MESSAGE, so every
 *      `err.message` catch block inherits it without being rewritten.
 */
import { describe, it, expect } from 'vitest';
import { handleResponseError } from '../api-client';
import { formatError, getApiErrorMessage } from '../errorMessages';

const validation = (fields: unknown, status = 400) => ({
  status,
  data: { error: 'Validation error', code: 'VALIDATION_FAILED', fields },
});

/** The shape the interceptor receives, before it builds the enhanced Error. */
const axiosLike = (status: number, data: Record<string, unknown>) => ({
  response: { status, data },
  config: { url: '/api/admin/platform/settings/ai' },
});

describe('getApiErrorMessage names the rejected field', () => {
  it('appends the failed path', () => {
    expect(getApiErrorMessage(validation(['bedrockRoleArn']))).toBe(
      'Validation error (check: bedrockRoleArn)'
    );
  });

  it('lists every failed path, not just the first', () => {
    expect(getApiErrorMessage(validation(['bedrockRegion', 'bedrockRoleArn']))).toBe(
      'Validation error (check: bedrockRegion, bedrockRoleArn)'
    );
  });

  /**
   * THE CONTROL. Without it, "append the fields" can be implemented as "always append
   * something" and every test above still passes.
   */
  it('leaves an ordinary error message untouched', () => {
    expect(getApiErrorMessage({ status: 400, data: { error: 'Bedrock requires a region.' } })).toBe(
      'Bedrock requires a region.'
    );
  });

  it('ignores a fields value that is not a list of strings', () => {
    expect(getApiErrorMessage(validation({}))).toBe('Validation error');
    expect(getApiErrorMessage(validation([]))).toBe('Validation error');
    expect(getApiErrorMessage(validation([1, 2]))).toBe('Validation error');
    expect(getApiErrorMessage(validation(['  ']))).toBe('Validation error');
  });

  /**
   * ⛔ `_` IS NOT A FIELD. The backend's `zodFieldPaths` maps an issue with an empty path —
   * an object-level refinement, or the `unrecognized_keys` issue every `.strict()` schema
   * raises for an unknown key — to the literal `_`, deliberately, "so a client never sees
   * VALIDATION_FAILED with an empty list". Rendered verbatim that becomes
   * "Validation error (check: _)", which sends an operator looking for a field called
   * underscore. Naming nothing is better than naming that.
   */
  it('does not offer `_` as a field to check', () => {
    expect(getApiErrorMessage(validation(['_']))).toBe('Validation error');
  });

  it('still names the real paths when `_` arrives beside them', () => {
    expect(getApiErrorMessage(validation(['_', 'bedrockRoleArn']))).toBe(
      'Validation error (check: bedrockRoleArn)'
    );
  });

  /**
   * A 5xx body is never shown (it can carry a stack frame or a SQL fragment), so the suffix
   * must not resurrect one by the back door.
   */
  it('stays silent on a 5xx even when the body carries fields', () => {
    expect(getApiErrorMessage(validation(['secretPath'], 500))).toBeUndefined();
  });
});

describe('formatError — and therefore toast.failure — inherits it', () => {
  it('names the field inside the "Couldn\'t …" copy', () => {
    expect(formatError('save AI defaults', validation(['bedrockRoleArn']))).toBe(
      "Couldn't save AI defaults: Validation error (check: bedrockRoleArn)"
    );
  });

  it('leaves an ordinary failure untouched — the control', () => {
    expect(formatError('save AI defaults', { status: 409, data: { error: 'Already exists' } })).toBe(
      "Couldn't save AI defaults: Already exists"
    );
  });
});

describe('the interceptor puts the field on the Error message itself', () => {
  /**
   * This is what reaches the 37 `err instanceof Error ? err.message : fallback` catch
   * blocks — SecretField's inline rejection, the three alliance hooks' private
   * `errorMessage`, ConsoleMembers' role toast — none of which will be rewritten.
   */
  it('so a bare err.message names the field', async () => {
    await expect(
      handleResponseError(
        axiosLike(400, { error: 'Validation error', code: 'VALIDATION_FAILED', fields: ['bedrockRoleArn'] })
      )
    ).rejects.toMatchObject({
      message: 'Validation error (check: bedrockRoleArn)',
      status: 400,
    });
  });

  it('leaves the untouched body on `data`, for callers that read the envelope', async () => {
    await expect(
      handleResponseError(
        axiosLike(400, { error: 'Validation error', code: 'VALIDATION_FAILED', fields: ['bedrockRoleArn'] })
      )
    ).rejects.toMatchObject({ data: { error: 'Validation error', fields: ['bedrockRoleArn'] } });
  });

  it('leaves an ordinary 4xx message alone — the control', async () => {
    await expect(
      handleResponseError(axiosLike(409, { error: 'Already exists' }))
    ).rejects.toMatchObject({ message: 'Already exists' });
  });

  it('never appends to the masked 5xx message', async () => {
    await expect(
      handleResponseError(axiosLike(500, { error: 'boom', fields: ['secretPath'] }))
    ).rejects.toMatchObject({ message: 'A server error occurred. Please try again later.' });
  });
});
