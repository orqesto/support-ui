/**
 * The session is renewed BEFORE the access token expires.
 *
 * What these tests are really pinning is a property the app had backwards: renewal used to
 * happen only because a request failed. With four background pollers on intervals and a
 * fifteen-minute token, that produced a burst of 401s every fifteen minutes in every open
 * tab — self-healing, but visible, and each burst spent real requests to learn the time.
 *
 * The lifetime is LEARNED from the refresh response rather than assumed, so the assertions
 * below drive it the way the api-client does: `noteSessionRenewed('15m')`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ensureFreshSession = vi.fn<() => Promise<void>>();
vi.mock('@/lib/api-client', () => ({ ensureFreshSession: () => ensureFreshSession() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import {
  clearSessionClock,
  FALLBACK_ACCESS_TTL_MS,
  noteSessionRenewed,
  parseDuration,
} from '@/lib/sessionClock';
import {
  nextRenewalAt,
  startSessionRenewal,
  stopSessionRenewal,
} from '@/lib/sessionRenewal';
import { useAuthStore } from '@/stores/authStore';

const MINUTE = 60 * 1000;

const signIn = () => useAuthStore.setState({ isAuthenticated: true });
const signOut = () => useAuthStore.setState({ isAuthenticated: false });

/** Jitter is ±10% of the 60s skew, so a due time is only ever pinned to a window. */
const dueIn = (): number => (nextRenewalAt() ?? NaN) - Date.now();

describe('parseDuration', () => {
  it('reads every unit the backend env accepts', () => {
    expect(parseDuration('90s')).toBe(90_000);
    expect(parseDuration('15m')).toBe(15 * MINUTE);
    expect(parseDuration('8h')).toBe(8 * 60 * MINUTE);
    expect(parseDuration('1d')).toBe(24 * 60 * MINUTE);
  });

  it('refuses anything it cannot trust rather than guessing', () => {
    // A corrupt or absurd value must not disable renewal (null → the caller's fallback)
    // and must never schedule a hot loop.
    for (const bad of ['', 'soon', '15', 'm15', '15 m', '10s', '30d', null, undefined, 900_000]) {
      expect(parseDuration(bad)).toBeNull();
    }
  });
});

describe('renewing before expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    ensureFreshSession.mockResolvedValue(undefined);
    clearSessionClock();
    signOut();
  });

  afterEach(() => {
    stopSessionRenewal();
    vi.useRealTimers();
  });

  it('renews a minute before the token dies — no request has to fail first', () => {
    noteSessionRenewed('15m');
    signIn();
    startSessionRenewal();

    expect(dueIn()).toBeGreaterThan(13.5 * MINUTE);
    expect(dueIn()).toBeLessThan(14.5 * MINUTE);

    // Nothing yet at thirteen minutes: renewing every wake-up would rotate the family for
    // no reason.
    vi.advanceTimersByTime(13 * MINUTE);
    expect(ensureFreshSession).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2 * MINUTE);
    expect(ensureFreshSession).toHaveBeenCalledTimes(1);
  });

  it('goes through the single-flight helper, never its own refresh call', () => {
    // Two rotations of one refresh token read as REUSE at the backend and revoke the whole
    // family, so the scheduler must join the same queue a 401 would.
    noteSessionRenewed('15m');
    signIn();
    startSessionRenewal();
    vi.advanceTimersByTime(15 * MINUTE);
    expect(ensureFreshSession).toHaveBeenCalledTimes(1);
  });

  it('reschedules from the lifetime the SERVER reported, including after a reactive 401', () => {
    noteSessionRenewed('15m');
    signIn();
    startSessionRenewal();

    // A 401 elsewhere renewed the session and the server said this one lasts an hour.
    noteSessionRenewed('1h');

    expect(dueIn()).toBeGreaterThan(58 * MINUTE);
    vi.advanceTimersByTime(15 * MINUTE);
    expect(ensureFreshSession).not.toHaveBeenCalled();
  });

  it('uses the conservative fallback only until the server has spoken', () => {
    signIn();
    startSessionRenewal();
    expect(dueIn()).toBeLessThanOrEqual(FALLBACK_ACCESS_TTL_MS);
    expect(dueIn()).toBeGreaterThan(FALLBACK_ACCESS_TTL_MS - 2 * MINUTE);
  });

  it('does not schedule anything for a signed-out visitor (control)', () => {
    startSessionRenewal();
    expect(nextRenewalAt()).toBeNull();
    vi.advanceTimersByTime(60 * MINUTE);
    expect(ensureFreshSession).not.toHaveBeenCalled();
  });

  it('stops renewing and forgets the lifetime on sign-out', () => {
    noteSessionRenewed('15m');
    signIn();
    startSessionRenewal();
    signOut();

    expect(nextRenewalAt()).toBeNull();
    vi.advanceTimersByTime(60 * MINUTE);
    expect(ensureFreshSession).not.toHaveBeenCalled();

    // The next session may come from a deployment with a different ACCESS_TOKEN_TTL, so the
    // learned value must not survive the sign-out.
    signIn();
    expect(dueIn()).toBeLessThanOrEqual(FALLBACK_ACCESS_TTL_MS);
  });

  it('a RELOAD schedules from the token\'s age, not from page-load', () => {
    // The case a naive scheduler gets wrong every time: the tab returns authenticated with a
    // cookie that is already fourteen minutes into a fifteen-minute life. Starting the clock at
    // page-load would let it die first, and the 401 burst would survive every reload.
    noteSessionRenewed('15m');
    signIn(); // before the scheduler is wired, so this is a restored session, not a sign-in
    vi.setSystemTime(Date.now() + 14 * MINUTE);

    startSessionRenewal();

    expect(dueIn()).toBeLessThan(1.5 * MINUTE);
    vi.advanceTimersByTime(1.5 * MINUTE);
    expect(ensureFreshSession).toHaveBeenCalledTimes(1);
  });

  it('renews at once when the tab was closed for longer than the token lived', () => {
    noteSessionRenewed('15m');
    signIn();
    vi.setSystemTime(Date.now() + 45 * MINUTE);

    startSessionRenewal();
    vi.advanceTimersByTime(1);

    expect(ensureFreshSession).toHaveBeenCalledTimes(1);
  });

  it('a SIGN-IN mints a new token, so a stale issue time must not fire it immediately', () => {
    // Control for the case above: without stamping at sign-in, the previous session's age
    // would be read as this one's and every login would open with a pointless rotation.
    noteSessionRenewed('15m');
    vi.setSystemTime(Date.now() + 45 * MINUTE);

    startSessionRenewal();
    signIn();

    expect(dueIn()).toBeGreaterThan(13.5 * MINUTE);
  });

  it('catches up when the tab comes back from being throttled or asleep', () => {
    // A background tab gets roughly one timer wake a minute, and a sleeping machine gets
    // none — so the moment we picked can pass without the timer firing.
    noteSessionRenewed('15m');
    signIn();
    startSessionRenewal();

    vi.setSystemTime(Date.now() + 20 * MINUTE);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(ensureFreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not renew on return to the foreground while the token is still good (control)', () => {
    noteSessionRenewed('15m');
    signIn();
    startSessionRenewal();

    vi.setSystemTime(Date.now() + 2 * MINUTE);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(ensureFreshSession).not.toHaveBeenCalled();
  });

  it('a refused renewal does NOT sign anyone out — the 401 path owns that call', async () => {
    // A background timer bouncing someone to /login mid-sentence is the exact outcome
    // refresh tokens exist to prevent. Failure here just stops the schedule.
    ensureFreshSession.mockRejectedValue(new Error('refresh refused'));
    noteSessionRenewed('15m');
    signIn();
    startSessionRenewal();

    vi.advanceTimersByTime(15 * MINUTE);
    await vi.runAllTimersAsync();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(nextRenewalAt()).toBeNull();
  });
});
