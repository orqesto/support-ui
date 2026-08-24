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
