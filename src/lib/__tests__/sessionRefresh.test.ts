/**
 * What a 401 means, now that an access token lasts fifteen minutes instead of seven days.
 *
 * Before refresh tokens, "401 → sign out and go to /login" was defensible: a 401 essentially
 * only happened when a week-old session ended. With a 15-minute token the same rule bounces an
 * active user to the login screen four times an hour, mid-task, while a valid refresh token sits
 * in their cookie jar.
 *
 * Two properties are load-bearing and neither is visible by reading the happy path:
 *
 *  1. **Single-flight.** The app fires many requests at once, so one expired token produces a
 *     BURST of 401s. Refreshing per-401 would rotate the same refresh token several times in the
 *     same instant, which the backend correctly reads as token reuse — and answers by revoking
 *     the entire family. Racing to renew the session is the thing that destroys it.
 *  2. **409 is success.** It is the backend saying another tab won the rotation and the fresh
 *     cookies are already on this browser. Treating it as a failure signs out anyone with two
 *     tabs open — the exact bug the backend's 409 exists to prevent.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import axios, { type AxiosResponse } from 'axios';
import {
  apiClient,
  ensureFreshSession,
  handleResponseError,
  noteSessionFromResponse,
  refreshRetryInMs,
  resetRefreshRefusal,
} from '@/lib/api-client';
import { afterRefusedRenewal } from '@/lib/socketManager';
import { useAuthStore } from '@/stores/authStore';
import {
  clearSessionClock,
  FALLBACK_ACCESS_TTL_MS,
  getAccessTtlMs,
  onSessionRenewed,
} from '@/lib/sessionClock';

/** The success shape the interceptor receives; only `data` matters to what is under test. */
const asResponse = (body: unknown): AxiosResponse =>
  ({ data: body, status: 200, statusText: 'OK', headers: {}, config: {} }) as AxiosResponse;

/** A realistic axios failure, shaped the way the interceptor actually receives one. */
const failure = (status: number, url: string, data: unknown = { error: 'nope' }) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
    config: { url, method: 'get', headers: {} },
  });

const rejection = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });

let assignedHref: string | null = null;

beforeEach(() => {
  assignedHref = null;
  vi.restoreAllMocks();
  // jsdom refuses a real navigation; capture the assignment instead.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      pathname: '/threads',
      set href(value: string) {
        assignedHref = value;
      },
      get href() {
        return assignedHref ?? '';
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a 401 is a question, not a verdict', () => {
  it('refreshes and REPLAYS the original request instead of signing the user out', async () => {
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { success: true } });
    const replay = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue({ data: { conversations: [] } });
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');

    const result = await handleResponseError(failure(401, '/api/messages/threads'));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: { conversations: [] } });
    expect(logout).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
  });

  it('THE BURST: ten simultaneous 401s produce exactly ONE refresh', async () => {
    // Not an optimisation. Ten rotations of one refresh token in the same instant is textbook
    // reuse, and the backend answers reuse by revoking the whole family — so without
    // single-flight, an expired token would log the user out rather than renew them.
    const refresh = vi.spyOn(axios, 'post').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 5))
    );
    vi.spyOn(apiClient, 'request').mockResolvedValue({ data: 'ok' });

    await Promise.all(
      Array.from({ length: 10 }, (_, index) => handleResponseError(failure(401, `/api/thing/${index}`)))
    );

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('starts a NEW refresh once the previous one has settled', async () => {
    // The single-flight promise must be released, or the next expiry an hour later would reuse a
    // long-resolved refresh and never renew anything.
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });

    await ensureFreshSession();
    await ensureFreshSession();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('treats 409 as "another tab already refreshed", not as a failure', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(rejection(409));
    vi.spyOn(apiClient, 'request').mockResolvedValue({ data: 'ok' });
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');

    const result = await handleResponseError(failure(401, '/api/messages/threads'));

    expect(result).toEqual({ data: 'ok' });
    expect(logout).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
  });

  it('signs out when the refresh itself is rejected — the session really is over', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(rejection(401));
    const replay = vi.spyOn(apiClient, 'request');
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');

    await expect(handleResponseError(failure(401, '/api/messages/threads'))).rejects.toThrow();

    expect(replay).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(assignedHref).toBe('/login');
  });

  it('learns the lifetime at SIGN-IN too, so the first cycle is exact and not a fallback', () => {
    // The BE reports it from `establishSession` on every sign-in path. Reading it in the
    // response interceptor rather than in six auth services is deliberate: one place on each
    // side of the wire, so a new sign-in path cannot forget.
    clearSessionClock();

    noteSessionFromResponse(
      asResponse({ success: true, data: { auth: { expiresIn: '30m' }, user: { id: 1 } } })
    );

    expect(getAccessTtlMs()).toBe(30 * 60 * 1000);
  });

  it('is actually INSTALLED as the success interceptor, not merely exported', () => {
    // Without this the test above would keep passing while the wiring was gone — it drives the
    // function directly, so "does it work" and "does it run" are two different questions.
    const { handlers } = apiClient.interceptors.response as unknown as {
      handlers: { fulfilled?: unknown }[];
    };
    expect(handlers.some((handler) => handler.fulfilled === noteSessionFromResponse)).toBe(true);
  });

  it('ignores a response that carries no session, and never throws on an odd body (control)', () => {
    clearSessionClock();

    for (const body of [undefined, null, 'text', { data: null }, { data: { auth: {} } }]) {
      expect(() => noteSessionFromResponse(asResponse(body))).not.toThrow();
    }
    expect(getAccessTtlMs()).toBe(FALLBACK_ACCESS_TTL_MS);
  });

  it('LEARNS the lifetime the server reports, so renewal can run ahead of the next expiry', async () => {
    // The wiring most likely to rot silently: if this stops being read, renewal falls back to a
    // guess and the 401 bursts come back — with every test above still green.
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { expiresIn: '8h' } } });
    clearSessionClock();

    await ensureFreshSession();

    expect(getAccessTtlMs()).toBe(8 * 60 * 60 * 1000);
  });

  it('still moves the renewal clock on a 409, where there is no lifetime to learn', async () => {
    // The other tab holds that response; our cookies are just as fresh, so the schedule has to
    // advance or this tab keeps its old, already-passed due time.
    vi.spyOn(axios, 'post').mockRejectedValue(rejection(409));
    const renewed = vi.fn();
    const stop = onSessionRenewed(renewed);

    await ensureFreshSession();
    stop();

    expect(renewed).toHaveBeenCalledTimes(1);
  });

  it('never retries the same request twice, however the replay fails', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    // The replay 401s too — a revoked session, say. It must terminate, not refresh again.
    const replayed = failure(401, '/api/messages/threads');
    (replayed.config as { _sessionRetry?: boolean })._sessionRetry = true;
    const refresh = vi.spyOn(axios, 'post');

    await expect(handleResponseError(replayed)).rejects.toThrow();

    expect(refresh).not.toHaveBeenCalled();
    expect(assignedHref).toBe('/login');
  });
});

describe('the endpoints that must never be refreshed', () => {
  it('does not refresh a failed login — a wrong password is not an expired session', async () => {
    const refresh = vi.spyOn(axios, 'post');
    const replay = vi.spyOn(apiClient, 'request');

    await expect(
      handleResponseError(failure(401, '/api/auth/login', { error: 'Invalid credentials' }))
    ).rejects.toThrow('Invalid credentials');

    expect(refresh).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();
  });

  it('does not refresh the refresh endpoint itself', async () => {
    const refresh = vi.spyOn(axios, 'post');
    await expect(handleResponseError(failure(401, '/api/auth/refresh'))).rejects.toThrow();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('DOES refresh in-session auth calls — the exclusion list is not "everything under /api/auth"', async () => {
    // `2fa/disable` and `switch-organization` are made from inside a live session. Excluding the
    // whole /api/auth prefix would make those the only requests in the app that cannot survive a
    // token expiry, which is the kind of asymmetry nobody notices until a user is bounced out of
    // the settings screen.
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    vi.spyOn(apiClient, 'request').mockResolvedValue({ data: 'ok' });

    await handleResponseError(failure(401, '/api/auth/2fa/disable'));
    await handleResponseError(failure(401, '/api/auth/switch-organization'));

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('the auth pages keep their old behaviour', () => {
  it('neither refreshes nor redirects when the user is already on /login', async () => {
    (window.location as unknown as { pathname: string }).pathname = '/login';
    const refresh = vi.spyOn(axios, 'post');

    await expect(handleResponseError(failure(401, '/api/auth/login'))).rejects.toThrow();

    expect(refresh).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
  });
});

describe('a renewal refused for rate (429) is not the end of the session', () => {
  const refused = (retryAfter: number) =>
    Object.assign(new Error('Request failed with status code 429'), {
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Too many session requests',
          retryAfter,
        },
      },
      config: { url: '/api/auth/refresh', method: 'post', headers: {} },
    });

  afterEach(() => {
    vi.useRealTimers();
    resetRefreshRefusal();
  });

  it('keeps the user signed in, fails only this request, and does not ask again until the wait is over', async () => {
    vi.useFakeTimers();
    const refresh = vi.spyOn(axios, 'post').mockRejectedValue(refused(120));
    const replay = vi.spyOn(apiClient, 'request').mockResolvedValue({ data: 'replayed' });
    // Earlier tests' sign-outs replace the store state, so this can be a spy that already counted.
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');
    logout.mockClear();

    const first = await handleResponseError(failure(401, '/api/messages/threads')).catch(
      (err: unknown) => err
    );
    expect(first).toMatchObject({ message: /Too many session requests/, status: 429 });
    expect(logout).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
    expect(replay).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);

    // Inside the wait: the refusal is answered locally, nothing is sent.
    await vi.advanceTimersByTimeAsync(30_000);
    await handleResponseError(failure(401, '/api/messages/threads')).catch(() => undefined);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(logout).not.toHaveBeenCalled();

    // After it: renewal is tried again, and its success replays the request.
    await vi.advanceTimersByTimeAsync(30_000);
    refresh.mockResolvedValue({ data: { success: true } });
    await expect(handleResponseError(failure(401, '/api/messages/threads'))).resolves.toEqual({
      data: 'replayed',
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(logout).not.toHaveBeenCalled();
  });

  it('control: a renewal refused because the session is over still signs out', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(rejection(401));
    // Earlier tests' sign-outs replace the store state, so this can be a spy that already counted.
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');
    logout.mockClear();
    await handleResponseError(failure(401, '/api/messages/threads')).catch(() => undefined);
    expect(logout).toHaveBeenCalled();
    expect(assignedHref).toBe('/login');
  });

  it('waits at most a minute, even when the server names its whole window', async () => {
    vi.useFakeTimers();
    vi.spyOn(axios, 'post').mockRejectedValue(refused(900));
    await ensureFreshSession().catch(() => undefined);
    expect(refreshRetryInMs()).toBe(60_000);
  });

  it('waits a minute when the server names no wait', async () => {
    vi.useFakeTimers();
    const noWait = refused(0);
    vi.spyOn(axios, 'post').mockRejectedValue(noWait);
    await ensureFreshSession().catch(() => undefined);
    expect(refreshRetryInMs()).toBe(60_000);
  });

  it('the WebSocket reconnects after the wait instead of signing out', async () => {
    vi.useFakeTimers();
    vi.spyOn(axios, 'post').mockRejectedValue(refused(30));
    const error = await ensureFreshSession().catch((err: unknown) => err);
    const retry = vi.fn();
    const endSession = vi.fn();

    expect(afterRefusedRenewal(error, { retry, endSession })).toBe('retry');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(retry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(endSession).not.toHaveBeenCalled();
  });

  it('control: the WebSocket still ends a session whose renewal was refused outright', () => {
    const retry = vi.fn();
    const endSession = vi.fn();
    expect(afterRefusedRenewal(rejection(401), { retry, endSession })).toBe('ended');
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });
});
