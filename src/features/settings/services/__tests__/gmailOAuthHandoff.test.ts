import { describe, expect, it, vi } from 'vitest';
import {
  GMAIL_OAUTH_CHANNEL,
  announceGmailOAuthCode,
  announceGmailOAuthError,
  isPendingRedirect,
  listenForGmailOAuthCode,
} from '../gmailOAuthHandoff';

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * The pop-up's opener link is severed by Google's pages (COOP), and sessionStorage is per tab: the
 * code reaches the app window over a BroadcastChannel, stored nowhere. Only ITS flow's state counts,
 * and the app window acknowledges it so the pop-up knows before it closes.
 */
describe('Gmail OAuth hand-off over a BroadcastChannel', () => {
  it("delivers this flow's code to the listener, which acknowledges it", async () => {
    const onCode = vi.fn();
    const onAck = vi.fn();
    const stop = listenForGmailOAuthCode('s1', onCode);
    const stopAnnouncing = announceGmailOAuthCode('c1', 's1', onAck);
    expect(stopAnnouncing).not.toBeNull();
    await flush();
    expect(onCode).toHaveBeenCalledWith({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c1', state: 's1' });
    expect(onAck).toHaveBeenCalledTimes(1);
    stop();
    stopAnnouncing?.();
  });

  it("ignores another flow's (or a stale) state, and does not acknowledge it; stops when told", async () => {
    const onCode = vi.fn();
    const onAck = vi.fn();
    const stop = listenForGmailOAuthCode('s1', onCode);
    const stopOther = announceGmailOAuthCode('c2', 'other', onAck);
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(onAck).not.toHaveBeenCalled();
    stop();
    const stopLate = announceGmailOAuthCode('c1', 's1', onAck);
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(onAck).not.toHaveBeenCalled();
    stopOther?.();
    stopLate?.();
  });

  it('no expected state: a message without a state is not taken (the guard, not the compare)', async () => {
    const onCode = vi.fn();
    const stop = listenForGmailOAuthCode(null, onCode);
    // Without the guard, `data.state === expectedState` would be null === null and take it.
    const raw = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
    raw.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c', state: null });
    await flush();
    raw.close();
    stop();
    expect(onCode).not.toHaveBeenCalled();
  });

  it('the redirect flow is known by its pending config being there (never by the state)', () => {
    sessionStorage.clear();
    expect(isPendingRedirect()).toBe(false);
    sessionStorage.setItem('gmail_oauth_pending_config', JSON.stringify({ config: {} }));
    expect(isPendingRedirect()).toBe(true);
    sessionStorage.clear();
  });

  it("Google's error reaches only its own flow's listener, at once", async () => {
    const onCodeA = vi.fn();
    const onErrorA = vi.fn();
    const onErrorB = vi.fn();
    const stopA = listenForGmailOAuthCode('sA', onCodeA, onErrorA);
    const stopB = listenForGmailOAuthCode('sB', vi.fn(), onErrorB);
    announceGmailOAuthError('sA', 'access_denied');
    await flush();
    expect(onErrorA).toHaveBeenCalledWith('access_denied');
    expect(onErrorB).not.toHaveBeenCalled();
    expect(onCodeA).not.toHaveBeenCalled();
    stopA();
    stopB();
  });
});
