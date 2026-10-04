/**
 * KB quality review — mutation-survivor kills for the service and the summary line (Stryker,
 * 2026-10-04). Each case pins a branch a mutant could flip with every other suite still green.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn<(url: string, config?: unknown) => Promise<unknown>>();
const post = vi.fn<(url: string, body?: unknown) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string, config?: unknown) => get(url, config), post: (url: string, body?: unknown) => post(url, body) },
}));

const { kbQualityService, normaliseAcceptResult, normaliseQualityDetail, normaliseQualityStatus } = await import(
  '../kbQuality.service'
);
const { summarizeKbQuality } = await import('@/lib/kbQuality');

beforeEach(() => vi.clearAllMocks());

describe('normaliseAcceptResult — each field only when it is what it claims', () => {
  it.each(['applied', 'rejected', 'expired'] as const)('keeps the known status %s', (status) => {
    expect(normaliseAcceptResult({ status }).status).toBe(status);
  });

  it('keeps a string or null publicId and drops anything else', () => {
    expect(normaliseAcceptResult({ status: 'applied', publicId: 'KB-1' })).toEqual({ status: 'applied', publicId: 'KB-1' });
    expect(normaliseAcceptResult({ status: 'applied', publicId: null })).toEqual({ status: 'applied', publicId: null });
    expect(normaliseAcceptResult({ status: 'applied', publicId: 7 })).toEqual({ status: 'applied' });
  });

  it('keeps a string reason only, and a positive redaction count only', () => {
    expect(normaliseAcceptResult({ status: 'expired', reason: 'edited' })).toEqual({ status: 'expired', reason: 'edited' });
    expect(normaliseAcceptResult({ status: 'expired', reason: 3 })).toEqual({ status: 'expired' });
    expect(normaliseAcceptResult({ status: 'applied', redactions: 2 })).toEqual({ status: 'applied', redactions: 2 });
    expect(normaliseAcceptResult({ status: 'applied', redactions: '2' })).toEqual({ status: 'applied' });
    expect(normaliseAcceptResult({ status: 'applied', entryId: '4' })).toEqual({ status: 'applied' });
  });

  it('accept with no data in the response is "unknown", never a throw', async () => {
    post.mockResolvedValue({});
    expect(await kbQualityService.accept(1, { action: 'reject' })).toEqual({ status: 'unknown' });
  });
});

describe('normaliseQualityDetail — booleans are true only when sent true', () => {
  const base = { verdict: 'improve', entry: { id: 1, approved: true } };

  it('passes each flag through when true', () => {
    const detail = normaliseQualityDetail({ ...base, inputTruncated: true, editedSinceProposed: true, stillEligible: true, canDecide: true }, 1);
    expect(detail).toEqual(expect.objectContaining({ inputTruncated: true, editedSinceProposed: true, stillEligible: true, canDecide: true }));
    expect(detail.entry?.approved).toBe(true);
  });

  it('a truthy non-true value is false', () => {
    const detail = normaliseQualityDetail({ ...base, inputTruncated: 'yes', editedSinceProposed: 1, stillEligible: 'true', entry: { id: 1, approved: 'yes' } }, 1);
    expect(detail).toEqual(expect.objectContaining({ inputTruncated: false, editedSinceProposed: false, stillEligible: false }));
    expect(detail.entry?.approved).toBe(false);
  });

  it.each(['failed', 'nothing_reusable', 'unsafe_output'] as const)('keeps the rewrite problem %s', (problem) => {
    expect(normaliseQualityDetail({ rewriteProblem: problem }, 1).rewriteProblem).toBe(problem);
  });

  it('a proposal needs both halves as strings', () => {
    expect(normaliseQualityDetail({ proposed: { question: 'Q?', answer: 5 } }, 1).proposed).toBeNull();
    expect(normaliseQualityDetail({ proposed: { question: 'Q?', answer: 'A.' } }, 1).proposed).toEqual({ question: 'Q?', answer: 'A.' });
  });

  it('a non-object entry is no entry', () => {
    expect(normaliseQualityDetail({ entry: 'KB-1' }, 1).entry).toBeNull();
    expect(normaliseQualityDetail({ entry: { id: 2 } }, 1).entry).toEqual(
      expect.objectContaining({ id: 2, approved: false, timesReferenced: 0, conversationId: null })
    );
  });
});

describe('normaliseQualityStatus', () => {
  it.each(['on', 'off', 'dry_run', 'no_provider'] as const)('accepts the state %s', (state) => {
    expect(normaliseQualityStatus({ state, coverage: {} })?.state).toBe(state);
  });

  it('is null for a non-object body', () => {
    expect(normaliseQualityStatus('on')).toBeNull();
    expect(normaliseQualityStatus(null)).toBeNull();
  });

  it('a count must be a finite, non-negative number — 0 is a real count', () => {
    const coverage = normaliseQualityStatus({
      state: 'on',
      coverage: { entries: 0, checked: Number.POSITIVE_INFINITY, notYet: Number.NaN, unassessed: '3', rewritesWaiting: 4 },
    })?.coverage;
    expect(coverage).toEqual(expect.objectContaining({ entries: 0, checked: 0, notYet: 0, unassessed: 0, rewritesWaiting: 4 }));
  });
});

describe('bulkReject — every total is summed, every result kept', () => {
  it('adds expired, failed and forbidden across batches and concatenates the results', async () => {
    post
      .mockResolvedValueOnce({ data: { data: { results: [{ suggestionId: 1, status: 'rejected' }], rejected: 1, expired: 2, failed: 1, forbidden: 3 } } })
      .mockResolvedValueOnce({ data: { data: { results: [{ suggestionId: 101, status: 'expired' }], rejected: 0, expired: 1, failed: 2, forbidden: 1 } } });
    const total = await kbQualityService.bulkReject(Array.from({ length: 101 }, (_, idx) => idx + 1));
    expect(total).toEqual({
      results: [
        { suggestionId: 1, status: 'rejected' },
        { suggestionId: 101, status: 'expired' },
      ],
      rejected: 1,
      expired: 3,
      failed: 3,
      forbidden: 4,
    });
  });

  it('exactly one full batch is one request; no ids is none', async () => {
    post.mockResolvedValue({ data: { data: {} } });
    await kbQualityService.bulkReject(Array.from({ length: 100 }, (_, idx) => idx + 1));
    expect(post).toHaveBeenCalledTimes(1);
    post.mockClear();
    expect(await kbQualityService.bulkReject([])).toEqual({ results: [], rejected: 0, expired: 0, failed: 0, forbidden: 0 });
    expect(post).not.toHaveBeenCalled();
  });

  it('a batch with no data adds nothing (and no phantom result)', async () => {
    post.mockResolvedValue({});
    expect(await kbQualityService.bulkReject([1])).toEqual({ results: [], rejected: 0, expired: 0, failed: 0, forbidden: 0 });
  });
});

describe('summarizeKbQuality', () => {
  it('leaves out what is not there', () => {
    expect(summarizeKbQuality({ verdict: 'remove' })).toBe('Remove');
    expect(summarizeKbQuality({ verdict: 'remove', reasons: 'no_answer', questionPreview: '' })).toBe('Remove');
    expect(summarizeKbQuality({ verdict: 'remove', reasons: [7, 'no_answer'] })).toBe('Remove — no real answer');
  });

  it('names the entry by public id, else by id', () => {
    expect(summarizeKbQuality({ verdict: 'improve', publicId: 'KB-4', entryId: 4 })).toBe('Rewrite #KB-4');
    expect(summarizeKbQuality({ verdict: 'improve', publicId: '', entryId: 4 })).toBe('Rewrite #4');
    expect(summarizeKbQuality({ verdict: 'improve', entryId: '4' })).toBe('Rewrite');
  });
});
