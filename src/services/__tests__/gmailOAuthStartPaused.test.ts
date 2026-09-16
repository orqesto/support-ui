import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args), get: vi.fn() },
}));

const { gmailOAuthService } = await import('@/services/gmail-oauth.service');

/**
 * The REDIRECT flow (popup blocked) crosses a full page load: the connect settings are stashed
 * in sessionStorage and replayed to the callback on the way back. A field that is not replayed
 * is silently dropped — and a dropped `startPaused` means the new Gmail source syncs at once,
 * before its count was seen (taco, 2026-09-16).
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
      JSON.stringify({ config: { bulkImportDays: 7, startPaused: true }, redirectUri: 'https://x/cb' })
    );
    await gmailOAuthService.consumePendingRedirectResult();
    expect(post).toHaveBeenCalledWith(
      '/api/oauth/gmail/callback',
      expect.objectContaining({ startPaused: true, bulkImportDays: 7 })
    );
  });
});
