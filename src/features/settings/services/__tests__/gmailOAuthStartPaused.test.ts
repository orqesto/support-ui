import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: (...args: unknown[]) => post(...args),
    get: (...args: unknown[]) => get(...args),
  },
}));

const { gmailOAuthService } = await import('@/features/settings/services/gmail-oauth.service');

/**
 * The REDIRECT flow (popup blocked) crosses a full page load: the connect settings are stashed
 * in sessionStorage and replayed to the callback on the way back. A field that is not replayed
 * is silently dropped — and a dropped `startPaused` means the new Gmail source syncs at once,
 * before its count was seen (petro, 2026-09-16).
 */
describe('Gmail redirect flow replays startPaused', () => {
  beforeEach(() => {
    sessionStorage.clear();
    post.mockReset();
    post.mockResolvedValue({ data: { success: true, data: { id: 68, email: 'orders@x' } } });
  });

  it('sends startPaused to the callback after the round trip', async () => {
    sessionStorage.setItem('gmail_oauth_payload', JSON.stringify({ code: 'c', state: 's' }));
    sessionStorage.setItem(
      'gmail_oauth_pending_config',
      JSON.stringify({
        config: { bulkImportDays: 7, startPaused: true },
        redirectUri: 'https://x/cb',
      })
    );
    await gmailOAuthService.consumePendingRedirectResult();
    expect(post).toHaveBeenCalledWith(
      '/api/oauth/gmail/callback',
      expect.objectContaining({ startPaused: true, bulkImportDays: 7 })
    );
  });

  it('stores only a fingerprint of the OAuth state before leaving for Google — never the state', async () => {
    const state = 'csrf-state-1234567890';
    get.mockResolvedValue({
      data: { success: true, data: { clientId: 'cid', redirectUri: 'https://x/cb' } },
    });
    post.mockResolvedValue({
      data: {
        success: true,
        data: { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}` },
      },
    });
    const hrefSetter = vi.fn();
    const location = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...location,
        set href(url: string) {
          hrefSetter(url);
        },
      },
    });
    try {
      const result = await gmailOAuthService.redirectToOAuth({ startPaused: true });
      expect(result.success).toBe(true);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location });
    }
    const stored = sessionStorage.getItem('gmail_oauth_pending_config') ?? '';
    expect(stored).not.toContain(state);
    const { isPendingRedirectFor } = await import('@/features/settings/services/gmailOAuthHandoff');
    expect(await isPendingRedirectFor(state, false)).toBe(true);
    expect(await isPendingRedirectFor('another-state', false)).toBe(false);
    expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining(state));
  });

  it("refuses a code whose state is not the stored flow's — the backend never sees it", async () => {
    const { oauthStateFingerprint } = await import(
      '@/features/settings/services/gmailOAuthHandoff'
    );
    sessionStorage.setItem('gmail_oauth_payload', JSON.stringify({ code: 'c', state: 'other' }));
    sessionStorage.setItem(
      'gmail_oauth_pending_config',
      JSON.stringify({
        config: {},
        redirectUri: 'https://x/cb',
        stateHash: await oauthStateFingerprint('mine'),
      })
    );
    const result = await gmailOAuthService.consumePendingRedirectResult();
    expect(result).toMatchObject({ success: false });
    expect(post).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('gmail_oauth_pending_config')).toBeNull();
  });

  it("CONTROL: the stored flow's own state goes to the backend", async () => {
    const { oauthStateFingerprint } = await import(
      '@/features/settings/services/gmailOAuthHandoff'
    );
    sessionStorage.setItem('gmail_oauth_payload', JSON.stringify({ code: 'c', state: 'mine' }));
    sessionStorage.setItem(
      'gmail_oauth_pending_config',
      JSON.stringify({
        config: {},
        redirectUri: 'https://x/cb',
        stateHash: await oauthStateFingerprint('mine'),
      })
    );
    await gmailOAuthService.consumePendingRedirectResult();
    expect(post).toHaveBeenCalledWith(
      '/api/oauth/gmail/callback',
      expect.objectContaining({ code: 'c', state: 'mine' })
    );
  });
});
