import { beforeEach, describe, expect, it } from 'vitest';
import { GMAIL_OAUTH_HANDOFF_KEY, takeGmailOAuthHandoff } from '../gmailOAuthHandoff';

/**
 * The pop-up's opener link is severed by Google's pages (COOP), and sessionStorage is per tab: the
 * code reaches the app window only through localStorage. The app takes only ITS flow's state.
 */
describe('takeGmailOAuthHandoff', () => {
  beforeEach(() => localStorage.clear());

  it("takes this flow's hand-off and removes it at once (single use)", () => {
    localStorage.setItem(GMAIL_OAUTH_HANDOFF_KEY, JSON.stringify({ code: 'c1', state: 's1' }));
    expect(takeGmailOAuthHandoff('s1')).toEqual({ code: 'c1', state: 's1' });
    expect(localStorage.getItem(GMAIL_OAUTH_HANDOFF_KEY)).toBeNull();
    expect(takeGmailOAuthHandoff('s1')).toBeNull();
  });

  it("never takes another flow's (or a stale) hand-off — it stays for its own window", () => {
    localStorage.setItem(GMAIL_OAUTH_HANDOFF_KEY, JSON.stringify({ code: 'c2', state: 'other' }));
    expect(takeGmailOAuthHandoff('s1')).toBeNull();
    expect(localStorage.getItem(GMAIL_OAUTH_HANDOFF_KEY)).not.toBeNull();
  });

  it('a malformed value is dropped; no expected state reads nothing', () => {
    localStorage.setItem(GMAIL_OAUTH_HANDOFF_KEY, '{not json');
    expect(takeGmailOAuthHandoff('s1')).toBeNull();
    expect(localStorage.getItem(GMAIL_OAUTH_HANDOFF_KEY)).toBeNull();
    localStorage.setItem(GMAIL_OAUTH_HANDOFF_KEY, JSON.stringify({ code: 'c', state: 's' }));
    expect(takeGmailOAuthHandoff(null)).toBeNull();
  });
});
