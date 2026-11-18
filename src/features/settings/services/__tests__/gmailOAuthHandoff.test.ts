import { describe, expect, it, vi } from 'vitest';
import { announceGmailOAuthCode, listenForGmailOAuthCode } from '../gmailOAuthHandoff';

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

/**
 * The pop-up's opener link is severed by Google's pages (COOP), and sessionStorage is per tab: the
 * code reaches the app window over a BroadcastChannel, stored nowhere. Only ITS flow's state counts.
 */
describe('Gmail OAuth hand-off over a BroadcastChannel', () => {
  it("delivers this flow's code to the listener", async () => {
    const onCode = vi.fn();
    const stop = listenForGmailOAuthCode('s1', onCode);
    expect(announceGmailOAuthCode('c1', 's1')).toBe(true);
    await flush();
    expect(onCode).toHaveBeenCalledWith({ type: 'GMAIL_OAUTH_SUCCESS', code: 'c1', state: 's1' });
    stop();
  });

  it("ignores another flow's (or a stale) state; stops when told", async () => {
    const onCode = vi.fn();
    const stop = listenForGmailOAuthCode('s1', onCode);
    announceGmailOAuthCode('c2', 'other');
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    stop();
    announceGmailOAuthCode('c1', 's1');
    await flush();
    expect(onCode).not.toHaveBeenCalled();
  });

  it('no expected state: nothing is listened for', async () => {
    const onCode = vi.fn();
    listenForGmailOAuthCode(null, onCode)();
    announceGmailOAuthCode('c', 's');
    await flush();
    expect(onCode).not.toHaveBeenCalled();
  });
});
