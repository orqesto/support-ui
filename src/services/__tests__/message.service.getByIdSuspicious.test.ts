import { describe, expect, it, vi } from 'vitest';

/**
 * getById passes the backend's `isSuspicious` through only as a boolean. An older backend sends
 * none, or NULL for a thread no filter checked; both read as absent, so the header falls back to
 * the conversation's own category (isSuspiciousThread) instead of reading NULL as an answer.
 */
const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiClient: { get } }));

const { messageService } = await import('../message.service');

const answer = (isSuspicious: unknown) => ({
  data: { success: true, data: { id: 9, status: 'open', isSuspicious } },
});

describe('getById: isSuspicious across backend versions', () => {
  it('keeps a boolean', async () => {
    get.mockResolvedValueOnce(answer(true));
    expect((await messageService.getById(9)).data).toMatchObject({ isSuspicious: true });
    get.mockResolvedValueOnce(answer(false));
    expect((await messageService.getById(9)).data).toMatchObject({ isSuspicious: false });
  });

  it('reads NULL as absent', async () => {
    get.mockResolvedValueOnce(answer(null));
    const { data } = await messageService.getById(9);
    expect((data as { isSuspicious?: unknown }).isSuspicious).toBeUndefined();
  });
});
