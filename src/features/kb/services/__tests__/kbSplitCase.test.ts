/**
 * A merged case that is split up (hidden / rejected / deleted / unmerged): the originals it would
 * give back, the entries it gave back, and the KB list's `splitCase` — all read defensively, since
 * the frontend can reach a deployment before the backend that sends them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let getImpl: () => Promise<unknown> = () => Promise.resolve({ data: { data: {} } });
const getUrls: string[] = [];
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string) => {
      getUrls.push(url);
      return getImpl();
    },
  },
}));

const {
  kbConsolidationService,
  normaliseCaseOriginals,
  normaliseRestoredEntries,
} = await import('../kbConsolidation.service');
const { normaliseSplitCase } = await import('../kb.service');

/** As the API client's interceptor rejects: a plain Error carrying `status` / `data`. */
const failure = (status: number, data?: unknown) =>
  Object.assign(new Error('request failed'), { status, data });

beforeEach(() => {
  getUrls.length = 0;
});

describe('getCaseOriginals', () => {
  it('reads the originals of a case from its route', async () => {
    getImpl = () =>
      Promise.resolve({
        data: {
          success: true,
          data: {
            caseId: 9,
            casePublicId: 'KB-9',
            originals: [
              { id: 21, publicId: 'KB-21', title: 'Refund window', approved: true, hidden: false },
            ],
          },
        },
      });
    await expect(kbConsolidationService.getCaseOriginals(9)).resolves.toEqual({
      caseId: 9,
      casePublicId: 'KB-9',
      originals: [
        { id: 21, publicId: 'KB-21', title: 'Refund window', approved: true, hidden: false },
      ],
    });
    expect(getUrls).toEqual(['/api/knowledge-base/consolidation/cases/9/originals']);
  });

  it.each([
    ['a backend without the route', failure(404)],
    ['a case gone meanwhile', failure(404, { success: false, error: 'Case not found' })],
    ['a viewer who may not read it', failure(403, { success: false, error: 'Forbidden' })],
  ])('%s ⇒ null (the confirm keeps its generic text)', async (_name, error) => {
    getImpl = () => Promise.reject(error);
    await expect(kbConsolidationService.getCaseOriginals(9)).resolves.toBeNull();
  });

  it('any other failure throws', async () => {
    getImpl = () => Promise.reject(failure(500));
    await expect(kbConsolidationService.getCaseOriginals(9)).rejects.toThrow('request failed');
  });
});

describe('normaliseCaseOriginals', () => {
  it('a shape without an originals list ⇒ null', () => {
    expect(normaliseCaseOriginals(undefined)).toBeNull();
    expect(normaliseCaseOriginals({ caseId: 9 })).toBeNull();
  });

  it('missing fields read safely: no publicId ⇒ null, flags not true ⇒ false, no id ⇒ dropped', () => {
    expect(
      normaliseCaseOriginals({ originals: [{ id: 4, title: 'Shipping' }, { title: 'No id' }] })
    ).toEqual({
      caseId: 0,
      casePublicId: null,
      originals: [{ id: 4, publicId: null, title: 'Shipping', approved: false, hidden: false }],
    });
  });
});

describe('normaliseCaseOriginals — live', () => {
  it('keeps a boolean `live`; absent or not a boolean ⇒ no `live` key (approved stands in)', () => {
    const read = (live: unknown) =>
      normaliseCaseOriginals({ originals: [{ id: 4, title: 'A', approved: true, live }] })
        ?.originals[0];
    expect(read(false)).toMatchObject({ live: false });
    expect(read(true)).toMatchObject({ live: true });
    expect(read(undefined)).not.toHaveProperty('live');
    expect(read('yes')).not.toHaveProperty('live');
  });
});

describe('normaliseRestoredEntries', () => {
  it('absent (an older backend) ⇒ null: the outcome says the count only', () => {
    expect(normaliseRestoredEntries(undefined)).toBeNull();
    expect(normaliseRestoredEntries('3')).toBeNull();
  });

  it('keeps the entries it can name', () => {
    expect(
      normaliseRestoredEntries([{ id: 4, publicId: 'KB-4' }, { id: 'x' }, { id: 5, title: 'Hi' }])
    ).toEqual([
      { id: 4, publicId: 'KB-4', title: '' },
      { id: 5, publicId: null, title: 'Hi' },
    ]);
  });
});

describe('normaliseSplitCase', () => {
  it('absent or unreadable ⇒ null (no hint)', () => {
    expect(normaliseSplitCase(undefined)).toBeNull();
    expect(normaliseSplitCase(null)).toBeNull();
    expect(normaliseSplitCase({ caseId: 9 })).toBeNull();
    expect(normaliseSplitCase({ publicId: 'KB-9' })).toBeNull();
  });

  it('reads a well-formed one; missing optional fields become null / empty', () => {
    expect(normaliseSplitCase({ publicId: 'KB-9', caseId: 9 })).toEqual({
      publicId: 'KB-9',
      caseId: 9,
      splitAt: null,
      via: null,
      entries: [],
    });
    expect(
      normaliseSplitCase({
        publicId: 'KB-9',
        caseId: 9,
        splitAt: '2026-11-10T09:00:00.000Z',
        via: 'hide',
        entries: [
          { id: 21, publicId: 'KB-21', title: 'Refund window', status: 'approved' },
          { id: 22, title: 'Return label', status: 'pending' },
          { id: 23, title: 'Unknown status', status: 'archived' },
          { publicId: 'KB-24', status: 'approved' },
        ],
      })
    ).toEqual({
      publicId: 'KB-9',
      caseId: 9,
      splitAt: '2026-11-10T09:00:00.000Z',
      via: 'hide',
      entries: [
        { id: 21, publicId: 'KB-21', title: 'Refund window', status: 'approved' },
        { id: 22, publicId: null, title: 'Return label', status: 'pending' },
      ],
    });
  });

  it('a splitAt that is not a date ⇒ null (no "Invalid Date")', () => {
    expect(normaliseSplitCase({ publicId: 'KB-9', caseId: 9, splitAt: 'soon' })?.splitAt).toBeNull();
  });
});
