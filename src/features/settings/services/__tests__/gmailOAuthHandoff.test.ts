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
  it('hands every code on to the listener (the flow checks the state); the ack goes on the same channel', async () => {
    const onCode = vi.fn();
    const onAck = vi.fn();
    const listener = listenForGmailOAuthCode(onCode, vi.fn());
    const stopAnnouncing = announceGmailOAuthCode('c1', 's1', onAck);
    expect(stopAnnouncing).not.toBeNull();
    await flush();
    expect(onCode).toHaveBeenCalledWith({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c1', state: 's1' });
    // The listener never acknowledges on its own.
    expect(onAck).not.toHaveBeenCalled();
    listener.acknowledge('s1');
    await flush();
    expect(onAck).toHaveBeenCalledTimes(1);
    listener.stop();
    stopAnnouncing?.();
  });

  it("an acknowledgement for another state is not this pop-up's", async () => {
    const onAck = vi.fn();
    const listener = listenForGmailOAuthCode(vi.fn(), vi.fn());
    const stopAnnouncing = announceGmailOAuthCode('c1', 's1', onAck);
    listener.acknowledge('other');
    await flush();
    expect(onAck).not.toHaveBeenCalled();
    listener.stop();
    stopAnnouncing?.();
  });

  it('stops when told; malformed messages (no state, no code) are not handed on', async () => {
    const onCode = vi.fn();
    const onError = vi.fn();
    const listener = listenForGmailOAuthCode(onCode, onError);
    const raw = new BroadcastChannel(GMAIL_OAUTH_CHANNEL);
    raw.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c', state: null });
    raw.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', state: 's' });
    raw.postMessage({ type: 'GMAIL_OAUTH_ERROR', state: 's' });
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    listener.stop();
    raw.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c', state: 's' });
    await flush();
    raw.close();
    expect(onCode).not.toHaveBeenCalled();
  });

  it('the redirect flow: a pending config, in a tab that is not a marked pop-up and has no live opener', () => {
    sessionStorage.clear();
    expect(isPendingRedirect(false)).toBe(false);
    sessionStorage.setItem('gmail_oauth_pending_config', JSON.stringify({ config: {} }));
    expect(isPendingRedirect(false)).toBe(true);
    // A live opener: a pop-up (opened by a tab on the bundle before the mark), never a redirect tab.
    expect(isPendingRedirect(true)).toBe(false);
    // A pop-up this bundle opened, whose inherited config could not be cleared: still a pop-up.
    sessionStorage.setItem('gmail_oauth_popup', '1');
    expect(isPendingRedirect(false)).toBe(false);
    sessionStorage.clear();
  });

  it("Google's error is handed on with its state", async () => {
    const onCode = vi.fn();
    const onError = vi.fn();
    const listener = listenForGmailOAuthCode(onCode, onError);
    announceGmailOAuthError('sA', 'access_denied');
    await flush();
    expect(onError).toHaveBeenCalledWith({
      type: 'GMAIL_OAUTH_ERROR',
      state: 'sA',
      error: 'access_denied',
    });
    expect(onCode).not.toHaveBeenCalled();
    listener.stop();
  });
});
