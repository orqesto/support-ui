/**
 * Reading the server's message off an api-client error.
 *
 * 🪤 The interceptor does NOT rethrow the axios error — it builds a fresh `Error` and copies
 * `status` and `data` onto it. So `err.response` is always `undefined` by the time a caller
 * sees it. Code written against the axios shape compiles, passes review, and silently never
 * matches; a whole class of catch blocks was dead this way, each one quietly replacing a
 * specific server message with a generic one.
 *
 * The first test is the one that would have caught that class.
 */
import { describe, it, expect } from 'vitest';
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError';

describe('apiErrorMessage', () => {
  it('reads the message the interceptor actually sets', () => {
    const err = Object.assign(new Error('Request failed'), {
      status: 400,
      data: { error: 'Remove the "mailto:" prefix' },
    });

    expect(apiErrorMessage(err, 'fallback')).toBe('Remove the "mailto:" prefix');
  });

  /**
   * THE REGRESSION GUARD. An error shaped like axios — the shape people keep reaching for —
   * carries nothing this helper should read, so it must fall through to the fallback rather
   * than appear to work.
   */
  it('does not read the axios shape, because the interceptor never produces it', () => {
    const axiosLike = Object.assign(new Error('Request failed'), {
      response: { status: 400, data: { error: 'never reachable' } },
    });

    expect(apiErrorMessage(axiosLike, 'fallback')).toBe('Request failed');
  });

  it('falls back to data.message when there is no data.error', () => {
    const err = Object.assign(new Error('boom'), { data: { message: 'Server said this' } });

    expect(apiErrorMessage(err, 'fallback')).toBe('Server said this');
  });

  it('uses the Error message when the body carries nothing usable', () => {
    expect(apiErrorMessage(new Error('Network Error'), 'fallback')).toBe('Network Error');
  });

  it.each([
    ['a blank server string', Object.assign(new Error(''), { data: { error: '   ' } })],
    ['a non-string server value', Object.assign(new Error(''), { data: { error: { a: 1 } } })],
    ['a bare object', {}],
    ['null', null],
    ['undefined', undefined],
  ])('falls back on %s', (_label, value) => {
    expect(apiErrorMessage(value, 'fallback')).toBe('fallback');
  });
});

describe('apiErrorStatus', () => {
  it('reads the status the interceptor set', () => {
    expect(apiErrorStatus(Object.assign(new Error('x'), { status: 403 }))).toBe(403);
  });

  it('is undefined when there is none', () => {
    expect(apiErrorStatus(new Error('x'))).toBeUndefined();
    expect(apiErrorStatus(null)).toBeUndefined();
  });
});

describe('validation errors name the field', () => {
  /**
   * The server answers a failed validation with `error: 'Validation error'` plus `fields` — the
   * dotted paths that failed — and deliberately withholds the zod message, because those
   * messages describe the schema. Nothing read `fields`, so a console full of inputs said only
   * "Validation error" and the operator had to guess which one.
   *
   * Observed on taco prod, 2026-09-11: `PATCH /api/admin/platform/settings/ai` rejected
   * `bedrockRoleArn`, and the screen could not say so.
   */
  it('appends the failed field paths', () => {
    const err = {
      status: 400,
      data: { error: 'Validation error', code: 'VALIDATION_FAILED', fields: ['bedrockRoleArn'] },
    };
    expect(apiErrorMessage(err, 'fallback')).toBe('Validation error (check: bedrockRoleArn)');
  });

  it('lists every failed field, not just the first', () => {
    const err = {
      status: 400,
      data: { error: 'Validation error', fields: ['bedrockRegion', 'bedrockRoleArn'] },
    };
    expect(apiErrorMessage(err, 'fallback')).toBe(
      'Validation error (check: bedrockRegion, bedrockRoleArn)',
    );
  });

  it('leaves an ordinary error untouched — the control', () => {
    // Without this, "append the fields" could be implemented as "always append something".
    expect(apiErrorMessage({ status: 400, data: { error: 'Bedrock requires a region.' } }, 'f')).toBe(
      'Bedrock requires a region.',
    );
  });

  it('ignores a fields value that is not a list of strings', () => {
    // A server that ever sends `fields: {}` or `[1,2]` must not produce "(check: )" or
    // "(check: 1, 2)" on screen.
    expect(apiErrorMessage({ data: { error: 'Validation error', fields: {} }, status: 400 }, 'f')).toBe(
      'Validation error',
    );
    expect(
      apiErrorMessage({ data: { error: 'Validation error', fields: [] }, status: 400 }, 'f'),
    ).toBe('Validation error');
  });
});
