import { describe, expect, it, vi } from 'vitest';
import {
  GMAIL_OAUTH_CHANNEL,
  acknowledgeGmailOAuthCode,
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
  it("hands every code on to the listener (the flow checks the state); the ack is the flow's", async () => {
    const onCode = vi.fn();
    const onAck = vi.fn();
    const stop = listenForGmailOAuthCode(onCode, vi.fn());
    const stopAnnouncing = announceGmailOAuthCode('c1', 's1', onAck);
    expect(stopAnnouncing).not.toBeNull();
    await flush();
    expect(onCode).toHaveBeenCalledWith({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c1', state: 's1' });
    // The listener never acknowledges on its own.
    expect(onAck).not.toHaveBeenCalled();
    acknowledgeGmailOAuthCode('s1');
    await flush();
    expect(onAck).toHaveBeenCalledTimes(1);
    stop();
    stopAnnouncing?.();
  });

  it("an acknowledgement for another state is not this pop-up's", async () => {
    const onAck = vi.fn();
    const stopAnnouncing = announceGmailOAuthCode('c1', 's1', onAck);
    acknowledgeGmailOAuthCode('other');
    await flush();
    expect(onAck).not.toHaveBeenCalled();
    stopAnnouncing?.();
  });

  it('stops when told; malformed messages (no state, no code) are not handed on', async () => {
    const onCode = vi.fn();
    const onError = vi.fn();
    const stop = listenForGmailOAuthCode(onCode, onError);
    const raw = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
    raw.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c', state: null });
    raw.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', state: 's' });
    raw.postMessage({ type: 'GMAIL_OAUTH_ERROR', state: 's' });
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    stop();
    raw.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c', state: 's' });
    await flush();
    raw.close();
    expect(onCode).not.toHaveBeenCalled();
  });

  it('the redirect flow is known by its pending config being there (never by the state)', () => {
    sessionStorage.clear();
    expect(isPendingRedirect()).toBe(false);
    sessionStorage.setItem('gmail_oauth_pending_config', JSON.stringify({ config: {} }));
    expect(isPendingRedirect()).toBe(true);
    sessionStorage.clear();
  });

  it("Google's error is handed on with its state", async () => {
    const onCode = vi.fn();
    const onError = vi.fn();
    const stop = listenForGmailOAuthCode(onCode, onError);
    announceGmailOAuthError('sA', 'access_denied');
    await flush();
    expect(onError).toHaveBeenCalledWith({
      type: 'GMAIL_OAUTH_ERROR',
      state: 'sA',
      error: 'access_denied',
    });
    expect(onCode).not.toHaveBeenCalled();
    stop();
  });
});
