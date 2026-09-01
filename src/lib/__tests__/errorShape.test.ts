/**
 * Every catch block in the app reads a status or a message off an error that the
 * api-client interceptor produced — and that error is NOT the one axios threw.
 * When the BE sends a body the interceptor builds a fresh `Error`, copies `status`
 * and `data` onto it, and drops `.response` entirely. Nine call sites had been
 * written against the axios shape: they type-checked, read correctly, and never
 * matched, so a 429 rate limit, a 403 "no AI provider", a closed tracking request
 * and an AWS credential error all surfaced as generic "something went wrong" copy.
 *
 * These tests drive the REAL interceptor rather than a hand-mirrored fixture, so
 * they fail if that transformation ever changes shape again.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { handleResponseError } from '@/lib/api-client';
import {
  formatError,
  getApiErrorMessage,
  getErrorBody,
  getErrorStatus,
  isAiNotConfiguredError,
} from '@/lib/errorMessages';

/** Runs a realistic axios failure through the real interceptor and returns what a caller catches. */
const asCaught = async (status: number, data: unknown): Promise<unknown> => {
  const axiosError = Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
  return handleResponseError(axiosError).catch((err: unknown) => err);
};

describe('the shape a caller actually catches', () => {
  it('has status and data, and NO .response — the premise everything else rests on', async () => {
    const caught = (await asCaught(403, { error: 'Nope' })) as Record<string, unknown>;
    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(403);
    expect(caught.data).toEqual({ error: 'Nope' });
    expect(caught.response).toBeUndefined();
  });

  it('keeps the axios error intact when there is no body (network drop, empty response)', async () => {
    const bodiless = Object.assign(new Error('Network Error'), {
      isAxiosError: true,
      response: undefined,
    });
    const caught = (await handleResponseError(bodiless).catch((err: unknown) => err)) as Record<
      string,
      unknown
    >;
    expect(caught).toBe(bodiless);
  });
});

describe('getErrorStatus / getErrorBody / getApiErrorMessage', () => {
  it('reads the interceptor shape', async () => {
    const caught = await asCaught(429, { error: 'Rate limit exceeded' });
    expect(getErrorStatus(caught)).toBe(429);
    expect(getErrorBody(caught)).toEqual({ error: 'Rate limit exceeded' });
    expect(getApiErrorMessage(caught)).toBe('Rate limit exceeded');
  });

  it('still reads a raw axios error, for any call that bypasses the interceptor', () => {
    const axiosLike = { response: { status: 409, data: { message: 'Already closed' } } };
    expect(getErrorStatus(axiosLike)).toBe(409);
    expect(getApiErrorMessage(axiosLike)).toBe('Already closed');
  });

  it('prefers `error` over `message` and trims', () => {
    expect(getApiErrorMessage({ data: { error: '  Boom  ', message: 'other' } })).toBe('Boom');
  });

  it('returns undefined rather than throwing on anything unexpected', () => {
    for (const value of [null, undefined, 'string', 42, new Error('plain'), { data: 'text' }]) {
      expect(getErrorStatus(value)).toBeUndefined();
      expect(getApiErrorMessage(value)).toBeUndefined();
    }
    expect(getErrorBody({ data: { error: '' } })).toEqual({ error: '' });
    expect(getApiErrorMessage({ data: { error: '   ' } })).toBeUndefined();
  });

  it('withholds a 5xx body — every display site depends on this, not on its own guard', async () => {
    const leaky = await asCaught(500, { error: 'ECONNREFUSED 10.0.0.4:5432 at /srv/app/dist/db.js' });
    expect(getApiErrorMessage(leaky)).toBeUndefined();
    expect(await asCaught(503, { error: 'upstream pod odly-backend-7f4 not ready' }).then(getApiErrorMessage)).toBeUndefined();
    // ...but the raw body stays available for machine checks like `code`.
    expect(getErrorBody(leaky)?.error).toContain('ECONNREFUSED');
    // 4xx copy is written for a human and must still come through.
    expect(await asCaught(422, { error: 'Subject is required' }).then(getApiErrorMessage)).toBe(
      'Subject is required'
    );
  });

  it('detects the AI_NOT_CONFIGURED contract in both shapes', async () => {
    expect(isAiNotConfiguredError(await asCaught(503, { code: 'AI_NOT_CONFIGURED' }))).toBe(true);
    expect(isAiNotConfiguredError({ response: { data: { code: 'AI_NOT_CONFIGURED' } } })).toBe(true);
    expect(isAiNotConfiguredError(await asCaught(503, { code: 'SOMETHING_ELSE' }))).toBe(false);
    expect(isAiNotConfiguredError(new Error('boom'))).toBe(false);
  });
});

describe('formatError', () => {
  it('surfaces the BE copy for a client error', async () => {
    const caught = await asCaught(400, { error: 'Space key is required' });
    expect(formatError('save the integration', caught)).toBe(
      "Couldn't save the integration: Space key is required"
    );
  });

  it('uses the status table when the body carries no message', async () => {
    const caught = await asCaught(429, { success: false });
    expect(formatError('send the reply', caught)).toBe(
      "Couldn't send the reply. You’re going too fast. Wait a moment and try again."
    );
  });

  it('NEVER leaks a 5xx body — the interceptor masks those on purpose', async () => {
    const caught = await asCaught(500, {
      error: 'column "requester_email" does not exist at /srv/app/dist/db.js:88',
    });
    const message = formatError('load the inbox', caught);
    expect(message).not.toContain('requester_email');
    expect(message).toBe("Couldn't load the inbox. Something went wrong on our side. The error has been logged.");
  });

  it('falls back to the error message, then to the generic line', () => {
    expect(formatError('do the thing', new Error('socket hang up'))).toBe(
      "Couldn't do the thing: socket hang up"
    );
    expect(formatError('do the thing', null)).toBe("Couldn't do the thing. The error has been logged.");
  });
});

/**
 * The source guard. Two of the first seven `.response` readers were live user-facing
 * failures and nothing in type-check, lint or review caught any of them — the shape
 * is structurally plausible, just never produced. Only the two files that must know
 * about both transports may name the axios shape; a tenth copy fails here instead of
 * silently doing nothing in production.
 */
describe('no call site reads the axios error shape directly', () => {
  const ALLOWED = new Set(['src/lib/api-client.ts', 'src/lib/errorMessages.ts']);

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });

  it('finds no `response?: {` cast or `\'response\' in` check outside api-client/errorMessages', () => {
    const offenders = walk('src')
      .filter((file) => !ALLOWED.has(file.replace(/\\/g, '/')))
      .filter((file) => /response\?: \{|['"]response['"] in /.test(readFileSync(file, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('the guard actually detects the pattern (control)', () => {
    expect(/response\?: \{|['"]response['"] in /.test('(err as { response?: { status?: number } })')).toBe(true);
    expect(/response\?: \{|['"]response['"] in /.test("if ('response' in error) {")).toBe(true);
    expect(/response\?: \{|['"]response['"] in /.test('const status = getErrorStatus(err);')).toBe(false);
  });
});

/**
 * The second source guard, and the one this file was extended for.
 *
 * Reading the error shape correctly is worthless if the handler then throws the
 * error away. The AI composer panel did exactly that: it branched on 429/403 and
 * answered everything else with "The assistant is unavailable right now", so a 409
 * "This conversation has no customer message to answer" — a sentence the backend
 * wrote for the agent to read — became an outage message on a thread where the call
 * could never succeed. An audit found 45 more sinks of the same shape across 25
 * files: load failures, save failures, undo, workspace switch, KB queueing.
 *
 * The rule: a handler that shows copy for a FAILED API CALL must be able to show
 * what the backend said. `getApiErrorMessage` is the safe reader (it withholds 5xx
 * bodies, proven above), `formatError` wraps it, and reading `.message` off the
 * error works because the interceptor puts the 4xx body there. Branching on
 * `getErrorStatus` alone does NOT count — that is precisely the pattern that
 * produced the bug.
 */
describe('no handler hides what the backend said', () => {
  /** Deliberate exceptions. Each one is a decision, not an oversight. */
  const ALLOWED = new Map<string, string>([
    [
      'src/pages/LoginPage.tsx',
      'Credential enumeration: a failed password must not say WHY. The one case worth ' +
        'distinguishing (unverified email, 403 after the password was checked) is branched ' +
        'before the generic line.',
    ],
    [
      'src/components/onboarding/steps/ElementsCheckout.tsx',
      'The throw comes from the Stripe SDK, not our API — there is no envelope to read. ' +
        'Stripe’s own error.message is already surfaced on the two paths above it.',
    ],
  ]);

  const SINK =
    /\b(?:toast\.error|toast\.warning|setError|setErrorMessage|setFormError|setStatusMessage|showError|setSubmitError|setApiError)\s*\(/;
  /** Ways a handler can put the backend's own words on screen. */
  const READS_THE_ERROR =
    /getApiErrorMessage\(|formatError\(|messageOf\(|describeError\(|instanceof Error|\.message\b/;

  /** Index of the character closing the group that opens at `start`. */
  const closes = (src: string, start: number, open: string, close: string): number => {
    let depth = 0;
    for (let at = start; at < src.length; at++) {
      if (src[at] === open) depth++;
      else if (src[at] === close && --depth === 0) return at;
    }
    return src.length - 1;
  };

  /** Every failure-handling block in a file: catch (e) {…}, .catch(…), onError: …. */
  const handlerBlocks = (src: string): string[] => {
    const blocks: string[] = [];
    for (const match of src.matchAll(/\bcatch\s*\([^)]*\)\s*\{/g)) {
      const brace = match.index + match[0].length - 1;
      blocks.push(src.slice(brace, closes(src, brace, '{', '}') + 1));
    }
    for (const match of src.matchAll(/\.catch\s*\(/g)) {
      const paren = match.index + match[0].length - 1;
      blocks.push(src.slice(paren, closes(src, paren, '(', ')') + 1));
    }
    for (const match of src.matchAll(/\bonError\s*:\s*/g)) {
      const brace = src.indexOf('{', match.index + match[0].length);
      if (brace !== -1 && brace - match.index < 120)
        blocks.push(src.slice(brace, closes(src, brace, '{', '}') + 1));
    }
    return blocks;
  };

  const walkSrc = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walkSrc(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });

  const offenders = (): string[] =>
    walkSrc('src')
      .filter((file) => !ALLOWED.has(file.replace(/\\/g, '/')))
      .filter((file) =>
        handlerBlocks(readFileSync(file, 'utf-8')).some(
          (block) => SINK.test(block) && !READS_THE_ERROR.test(block)
        )
      );

  it('every failure handler that shows copy can show the backend’s reason', () => {
    expect(offenders()).toEqual([]);
  });

  it('the guard detects the pattern it exists to stop (control)', () => {
    const swallowed = `try { await save(); } catch (err) {
      logger.error('nope', err);
      setError('Failed to save. Please try again.');
    }`;
    const statusOnly = `try { await save(); } catch (err) {
      setError(getErrorStatus(err) === 403 ? 'Not allowed.' : 'Failed to save.');
    }`;
    const repaired = `try { await save(); } catch (err) {
      setError(getApiErrorMessage(err) ?? 'Failed to save. Please try again.');
    }`;
    const blocksOf = (source: string) => handlerBlocks(source);
    const flags = (source: string) =>
      blocksOf(source).some((block) => SINK.test(block) && !READS_THE_ERROR.test(block));

    expect(blocksOf(swallowed)).toHaveLength(1);
    expect(flags(swallowed)).toBe(true);
    // Branching on the status is NOT reading the message — the original defect.
    expect(flags(statusOnly)).toBe(true);
    expect(flags(repaired)).toBe(false);
  });
});
