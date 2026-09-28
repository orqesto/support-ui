/**
 * A request sent after the access token died is held until the session is renewed.
 *
 * The browser deletes the `jwt` cookie at expiry, so such a request carries no credential and
 * comes back 401 `AUTH_REQUIRED`. The 401 path recovers (refresh + replay), but after a tab slept
 * every background poller did that at once — a burst of red 401s on every return to the tab.
 * These tests pin the gate that renews FIRST when the clock already knows the token is gone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { apiClient, handleResponseError, renewIfExpired } from '@/lib/api-client';
import { clearSessionClock, noteSessionRenewed } from '@/lib/sessionClock';
import { useAuthStore } from '@/stores/authStore';

const MINUTE = 60 * 1000;
const ISSUED_KEY = 'session.accessIssuedAt';

const request = (url: string): InternalAxiosRequestConfig =>
  ({ url, method: 'get', headers: new AxiosHeaders() }) as InternalAxiosRequestConfig;

/** A token minted now that lives 15 minutes, as the refresh endpoint reports it. */
const mintToken = () => noteSessionRenewed('15m');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T21:00:00Z'));
  vi.restoreAllMocks();
  clearSessionClock();
  useAuthStore.setState({ isAuthenticated: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearSessionClock();
  useAuthStore.setState({ isAuthenticated: false });
});

describe('renew before sending, when the clock says the token is already dead', () => {
  it('renews ONCE for a burst of pollers waking after the token expired', async () => {
    mintToken();
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { expiresIn: '15m' } } });

    const urls = ['/api/notifications', '/api/learning/suggestions', '/api/notifications/counts',
      '/api/tickets/metadata', '/api/license'];
    const sent = await Promise.all(urls.map((url) => renewIfExpired(request(url))));

    // Single-flight is the correctness property: five rotations of one refresh token in the same
    // instant read as reuse at the backend and revoke the whole session family.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sent.map((config) => config.url)).toEqual(urls);
  });

  it('does not renew again once the renewal has moved the clock', async () => {
    mintToken();
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { data: { expiresIn: '15m' } } });

    await renewIfExpired(request('/api/notifications'));
    await renewIfExpired(request('/api/notifications'));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('leaves the request alone while the token is still live (control)', async () => {
    mintToken();
    vi.setSystemTime(Date.now() + 10 * MINUTE);
    const refresh = vi.spyOn(axios, 'post');

    await renewIfExpired(request('/api/notifications'));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('trusts ANOTHER TAB’s renewal: cookies are shared, so the token is fresh here too', async () => {
    mintToken();
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    // The other tab rotated a minute ago; only localStorage carries that news to this tab.
    window.localStorage.setItem(ISSUED_KEY, String(Date.now() - MINUTE));
    const refresh = vi.spyOn(axios, 'post');

    await renewIfExpired(request('/api/notifications'));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('with no known issue time, keeps the old behaviour: send and let a 401 renew', async () => {
    const refresh = vi.spyOn(axios, 'post');

    await renewIfExpired(request('/api/notifications'));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('never renews for a signed-out user or a sign-in call', async () => {
    mintToken();
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    const refresh = vi.spyOn(axios, 'post');

    // A 401 from login means a wrong password; the refresh call itself must not recurse.
    await renewIfExpired(request('/api/auth/login'));
    await renewIfExpired(request('/api/auth/refresh'));
    useAuthStore.setState({ isAuthenticated: false });
    await renewIfExpired(request('/api/notifications'));

    expect(refresh).not.toHaveBeenCalled();
  });

  it('a renewal that fails OFFLINE still lets the request’s 401 renew and replay it — no sign-out', async () => {
    // The wake-from-sleep case: the tab fires before Wi-Fi is back, so the early renewal fails
    // with no response. Once the network returns, the request 401s and must get its own refresh.
    mintToken();
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    const refresh = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: { data: { expiresIn: '15m' } } });
    const replay = vi.spyOn(apiClient, 'request').mockResolvedValue({ data: 'ok' });
    const logout = vi.spyOn(useAuthStore.getState(), 'logout');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/dashboard', href: '' },
    });

    const sent = await renewIfExpired(request('/api/notifications'));
    const unauthorized = Object.assign(new Error('Request failed with status code 401'), {
      isAxiosError: true,
      response: { status: 401, data: { code: 'AUTH_REQUIRED' } },
      config: sent,
    });
    const result = await handleResponseError(unauthorized);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(replay).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: 'ok' });
    expect(logout).not.toHaveBeenCalled();
  });

  it('after a REFUSED renewal, stands aside until a renewal succeeds — no refresh per poll', async () => {
    mintToken();
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    const refresh = vi
      .spyOn(axios, 'post')
      .mockRejectedValue(Object.assign(new Error('401'), { response: { status: 401 } }));

    for (let poll = 0; poll < 5; poll += 1) await renewIfExpired(request('/api/public/track'));
    expect(refresh).toHaveBeenCalledTimes(1);

    // A later successful renewal (the 401 path, another tab's 409, a sign-in) re-arms it.
    mintToken();
    vi.setSystemTime(Date.now() + 16 * MINUTE);
    refresh.mockResolvedValue({ data: { data: { expiresIn: '15m' } } });
    await renewIfExpired(request('/api/notifications'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('is actually INSTALLED as a request interceptor, not merely exported', () => {
    const { handlers } = apiClient.interceptors.request as unknown as {
      handlers: ({ fulfilled?: unknown } | null)[];
    };
    expect(handlers.some((handler) => handler?.fulfilled === renewIfExpired)).toBe(true);
  });
});
