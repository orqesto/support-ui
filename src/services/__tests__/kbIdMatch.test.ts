import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { kbService } from '@/services/kb.service';

/** `idMatch` on the KB list: a backend that predates it sends no key; the page must get null. */
describe('kbService.getAll idMatch', () => {
  afterEach(() => vi.restoreAllMocks());
  const answer = (extra: Record<string, unknown>) =>
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          entries: [],
          pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
          filters: { status: 'approved', decisionStatuses: true },
          ...extra,
        },
      },
    });

  it('an older backend (no idMatch key) ⇒ null', async () => {
    answer({});
    expect((await kbService.getAll({ search: 'KB-134' })).data.idMatch).toBeNull();
  });

  it('a well-formed idMatch is passed through', async () => {
    const idMatch = {
      id: 5,
      publicId: 'KB-134',
      type: 'qa_pair',
      status: 'pending',
      messageSourceId: null,
      inResults: false,
    };
    answer({ idMatch });
    expect((await kbService.getAll({ search: 'KB-134' })).data.idMatch).toEqual(idMatch);
  });

  it('a shape this app cannot read ⇒ null, never a guess', async () => {
    answer({ idMatch: { id: 5, type: 'qa_pair', status: 'set_aside', inResults: false } });
    expect((await kbService.getAll({ search: 'KB-134' })).data.idMatch).toBeNull();
  });
});
