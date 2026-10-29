import { describe, expect, it, vi } from 'vitest';

/**
 * getThreads normalises each row's `searchMatch` (version skew: an older backend sends none, a
 * malformed value must not reach a row). The rows are mapped in the service — a test of
 * normalizeSearchMatch alone would stay green with the mapping deleted.
 */
vi.mock('../threadsQuery', () => ({
  fetchThreads: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: [
        { threadId: 'conv_1', searchMatch: { field: 'body', snippet: 'the parcel arrived' } },
        { threadId: 'conv_2', searchMatch: { field: 'elsewhere' } },
        { threadId: 'conv_3' },
      ],
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasMore: false },
      search: { terms: ['parcel'], asPhrase: false },
    })
  ),
}));

const { messageService } = await import('../message.service');

describe('getThreads', () => {
  it('normalises every row’s searchMatch: kept, junk → null, absent → null', async () => {
    const response = await messageService.getThreads({ search: 'parcel' });
    const rows = response.data as unknown as Array<{ threadId: string; searchMatch: unknown }>;
    expect(rows.map((row) => row.searchMatch)).toEqual([
      { field: 'body', snippet: 'the parcel arrived' },
      null,
      null,
    ]);
    expect(response.search).toEqual({
      terms: ['parcel'],
      asPhrase: false,
      cutShort: [],
      timedOut: false,
      rankedWithin: null,
    });
  });
});
