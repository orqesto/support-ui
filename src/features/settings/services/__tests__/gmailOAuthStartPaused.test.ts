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

  it('stores the config before leaving for Google — never the state, nor anything derived from it', async () => {
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
    expect(Object.keys(JSON.parse(stored) as object).sort()).toEqual(['config', 'redirectUri']);
    const { isPendingRedirect } = await import('@/features/settings/services/gmailOAuthHandoff');
    expect(isPendingRedirect()).toBe(true);
    expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining(state));
  });

  it('a pop-up opened after a redirect this page load started (Google then severs its opener): this tab keeps its config, the pop-up has none', async () => {
    get.mockResolvedValue({
      data: { success: true, data: { clientId: 'cid', redirectUri: 'https://x/cb' } },
    });
    post.mockResolvedValue({
      data: {
        success: true,
        data: { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' },
      },
    });
    const location = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...location,
        set href(url: string) {
          void url;
        },
      },
    });
    try {
      await gmailOAuthService.redirectToOAuth({});
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location });
    }
    // The pop-up's own copy (what its callback page will read once Google severed the opener).
    const popupCopy = new Map<string, string>([
      ['gmail_oauth_pending_config', sessionStorage.getItem('gmail_oauth_pending_config') ?? ''],
    ]);
    const popup = {
      close: vi.fn(),
      location: { href: '' },
      sessionStorage: { removeItem: (key: string) => popupCopy.delete(key) },
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    try {
      void gmailOAuthService.connectWithPopup({});
    } finally {
      open.mockRestore();
    }
    expect(popupCopy.has('gmail_oauth_pending_config')).toBe(false);
    expect(sessionStorage.getItem('gmail_oauth_pending_config')).not.toBeNull();
  });
});
