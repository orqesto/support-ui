/**
 * KB quality review — the detail is normalised so a missing or odd field reads as "not known",
 * never a crash (the FE can reach production before the backend that serves this route).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn<(url: string, config?: unknown) => Promise<unknown>>();
const post = vi.fn<(url: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string, config?: unknown) => get(url, config), post: (url: string, body?: unknown) => post(url, body) },
}));

const { kbQualityService, normaliseAcceptResult, normaliseQualityDetail, BULK_REJECT_BATCH } = await import('../kbQuality.service');

beforeEach(() => vi.clearAllMocks());

/**
 * The route contract (FE audit T1): every component test mocks this service, so a wrong path or
 * body here would pass every other test.
 */
describe('kbQualityService — the routes and bodies the backend serves', () => {
  it('reads the detail from the quality route', async () => {
    get.mockResolvedValue({ data: { data: { verdict: 'improve' } } });
    await kbQualityService.getDetail(41);
    expect(get).toHaveBeenCalledWith('/api/knowledge-base/consolidation/quality/41', undefined);
  });

  it('accepts through the learning inbox, with the decision in the body', async () => {
    post.mockResolvedValue({ data: { data: { id: 41, status: 'applied', entryId: 12 } } });
    expect(await kbQualityService.accept(41, { action: 'apply', question: 'Q?', answer: 'A.' })).toEqual({ status: 'applied', entryId: 12 });
    expect(post).toHaveBeenCalledWith('/api/learning/suggestions/41/accept', { action: 'apply', question: 'Q?', answer: 'A.' });
    await kbQualityService.accept(41, { action: 'reject' });
    expect(post).toHaveBeenLastCalledWith('/api/learning/suggestions/41/accept', { action: 'reject' });
  });

  it('"keep" is the decline route', async () => {
    post.mockResolvedValue({ data: {} });
    await kbQualityService.keep(41);
    expect(post).toHaveBeenCalledWith('/api/learning/suggestions/41/decline', {});
  });

  it('bulk remove sends suggestionIds in batches of the server limit and adds the totals up (FE audit M3)', async () => {
    post.mockResolvedValue({ data: { data: { results: [], rejected: 1, expired: 0, failed: 0, forbidden: 0 } } });
    const ids = Array.from({ length: BULK_REJECT_BATCH * 2 + 5 }, (_, idx) => idx + 1);
    const total = await kbQualityService.bulkReject(ids);
    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls[0]).toEqual(['/api/knowledge-base/consolidation/quality/bulk-reject', { suggestionIds: ids.slice(0, 100) }]);
    expect((post.mock.calls[2][1] as { suggestionIds: number[] }).suggestionIds).toHaveLength(5);
    expect(total).toEqual(expect.objectContaining({ rejected: 3, forbidden: 0 }));
  });

  it('status: 404 is an older backend (no line); any other failure is an error the page SAYS', async () => {
    get.mockRejectedValueOnce({ status: 404 });
    expect(await kbQualityService.getStatus()).toBe('unsupported');
    get.mockRejectedValueOnce({ status: 500 });
    expect(await kbQualityService.getStatus()).toBe('error');
    get.mockResolvedValueOnce({ data: { data: { state: 'on', coverage: { entries: 3, checked: 1 } } } });
    expect(await kbQualityService.getStatus()).toEqual(expect.objectContaining({ state: 'on' }));
    expect(get).toHaveBeenLastCalledWith('/api/knowledge-base/consolidation/quality-status', undefined);
  });
});

describe('normaliseAcceptResult', () => {
  it('an unknown status or a missing body is "unknown" — never "applied"', () => {
    expect(normaliseAcceptResult({ status: 'accepted' }).status).toBe('unknown');
    expect(normaliseAcceptResult(undefined).status).toBe('unknown');
    expect(normaliseAcceptResult({ status: 'rejected', entryId: 4, redactions: 0 })).toEqual({ status: 'rejected', entryId: 4 });
  });
});

describe('normaliseQualityDetail', () => {
  it('passes a well-formed detail through', () => {
    const detail = normaliseQualityDetail(
      {
        suggestionId: 5,
        status: 'pending',
        verdict: 'improve',
        reasons: ['raw_email'],
        note: 'an email',
        proposed: { question: 'Q?', answer: 'A.' },
        rewriteProblem: null,
        inputTruncated: true,
        entry: { id: 9, publicId: 'KB-9', question: 'q', answer: 'a', approved: true, timesReferenced: 2, date: '2026-10-01', conversationId: 3, conversationPublicId: 'SUP-3' },
        editedSinceProposed: false,
        stillEligible: true,
        canDecide: true,
      },
      5
    );
    expect(detail).toEqual(
      expect.objectContaining({ verdict: 'improve', reasons: ['raw_email'], proposed: { question: 'Q?', answer: 'A.' }, canDecide: true })
    );
    expect(detail.entry).toEqual(expect.objectContaining({ id: 9, publicId: 'KB-9', timesReferenced: 2, conversationId: 3 }));
  });

  it('reads an empty or foreign body as "not known" — never permissive', () => {
    const detail = normaliseQualityDetail(undefined, 5);
    expect(detail).toEqual({
      suggestionId: 5,
      status: 'pending',
      verdict: 'remove',
      reasons: [],
      note: '',
      proposed: null,
      rewriteProblem: null,
      inputTruncated: false,
      entry: null,
      editedSinceProposed: false,
      stillEligible: false,
      canDecide: false,
    });
  });

  it('drops a half proposal, a non-string reason and an unknown rewrite problem', () => {
    const detail = normaliseQualityDetail(
      { verdict: 'improve', proposed: { question: 'Q?' }, reasons: ['raw_email', 7], rewriteProblem: 'exploded', entry: { publicId: 'KB-1' } },
      8
    );
    expect(detail.proposed).toBeNull();
    expect(detail.reasons).toEqual(['raw_email']);
    expect(detail.rewriteProblem).toBeNull();
    // An entry with no id cannot be named or linked.
    expect(detail.entry).toBeNull();
  });
});
