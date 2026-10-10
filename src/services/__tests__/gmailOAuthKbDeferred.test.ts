import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args), get: vi.fn() },
}));

const { gmailOAuthService } = await import('@/services/gmail-oauth.service');

const request = { code: 'c', state: 's', redirectUri: 'https://x/cb' };

/** BE-X: the callback reply carries `kbMiningDeferred`; dropping it hides "nothing is mined". */
describe('Gmail callback passes kbMiningDeferred through', () => {
  beforeEach(() => post.mockReset());

  it('keeps plan_inactive', async () => {
    post.mockResolvedValue({
      data: { success: true, kbMiningDeferred: 'plan_inactive', data: { id: 1, email: 'a@b' } },
    });
    const res = await gmailOAuthService.handleCallback(request);
    expect(res.kbMiningDeferred).toBe('plan_inactive');
  });

  it('absent stays absent; any other value is dropped', async () => {
    post.mockResolvedValue({ data: { success: true, data: { id: 1, email: 'a@b' } } });
    expect((await gmailOAuthService.handleCallback(request)).kbMiningDeferred).toBeUndefined();
    post.mockResolvedValue({
      data: { success: true, kbMiningDeferred: 'whatever', data: { id: 1, email: 'a@b' } },
    });
    expect((await gmailOAuthService.handleCallback(request)).kbMiningDeferred).toBeUndefined();
  });
});
