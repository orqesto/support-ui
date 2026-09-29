/**
 * The promote route's `outcome` says what the saved entries ARE now (BE feat/kb-consolidation
 * @ e62f8a57, kbPromoteController): `approved` = actually served, `hidden` = in the KB but
 * hidden, `retired` = its source was removed (kept, never used), `partOfCase` = case ids whose ORIGINAL the pair is. The backend deployed today sends
 * only {approved, pendingReview, rejected}; an older one no outcome at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn<(url: string, body: unknown) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (url: string, body: unknown) => post(url, body) },
}));

const { kbPromoteService } = await import('../kbPromote.service');

const respond = (data: unknown) => post.mockResolvedValue({ data: { success: true, data } });

beforeEach(() => post.mockReset());

describe('kbPromoteService.promote — outcome', () => {
  it('passes the current backend outcome through, hidden and partOfCase included', async () => {
    respond({
      knowledgeBaseIds: [5, 6],
      unknown: [],
      pendingReview: false,
      outcome: {
        approved: 0,
        hidden: 1,
        retired: 2,
        pendingReview: 0,
        rejected: 0,
        partOfCaseEntries: 1,
        partOfCase: [900],
      },
    });
    expect(await kbPromoteService.promote(7, [])).toEqual({
      ids: [5, 6],
      outcome: {
        approved: 0,
        hidden: 1,
        retired: 2,
        pendingReview: 0,
        rejected: 0,
        partOfCaseEntries: 1,
        partOfCase: [900],
      },
    });
  });

  it('reads the deployed shape (no hidden, retired or partOfCase) as none of them', async () => {
    respond({
      knowledgeBaseIds: [5],
      pendingReview: false,
      outcome: { approved: 1, pendingReview: 0, rejected: 0 },
    });
    expect((await kbPromoteService.promote(7, [])).outcome).toEqual({
      approved: 1,
      hidden: 0,
      retired: 0,
      pendingReview: 0,
      rejected: 0,
      partOfCaseEntries: 0,
      partOfCase: [],
    });
  });

  it('with no outcome at all, derives it from pendingReview as before', async () => {
    respond({ knowledgeBaseIds: [5], pendingReview: true });
    expect((await kbPromoteService.promote(7, [])).outcome).toMatchObject({
      approved: 0,
      pendingReview: 1,
    });
    respond({ knowledgeBaseIds: [5, 6] });
    expect((await kbPromoteService.promote(7, [])).outcome).toMatchObject({
      approved: 2,
      pendingReview: 0,
    });
  });
});
