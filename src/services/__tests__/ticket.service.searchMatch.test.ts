import { describe, expect, it, vi, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]): Promise<unknown> => get(...args) },
}));

const { normalizeTicketSearchMatch, ticketService } = await import('../ticket.service');

beforeEach(() => get.mockReset());

describe('normalizeTicketSearchMatch', () => {
  it('keeps a match with its passage, or a field match without one', () => {
    expect(normalizeTicketSearchMatch({ field: 'thread', snippet: 'the bollard broke' })).toEqual({
      field: 'thread',
      snippet: 'the bollard broke',
    });
    expect(normalizeTicketSearchMatch({ field: 'title' })).toEqual({ field: 'title' });
    expect(normalizeTicketSearchMatch({ field: 'note', snippet: '  ' })).toEqual({ field: 'note' });
  });

  it('reads an older backend (absent), no search (null) and junk as null', () => {
    expect(normalizeTicketSearchMatch(undefined)).toBeNull();
    expect(normalizeTicketSearchMatch(null)).toBeNull();
    expect(normalizeTicketSearchMatch({ field: 'body' })).toBeNull();
  });
});

describe('ticketService.getAll — searched', () => {
  it('normalises each row match and the reading', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 1, searchMatch: { field: 'note', snippet: 'called back' } }, { id: 2 }],
        pagination: { page: 1, limit: 25, total: 2, totalPages: 1, hasMore: false },
        search: { terms: ['called'], asPhrase: false, cutShort: [] },
      },
    });
    const res = await ticketService.getAll({ search: 'called' });
    expect(res.data.map((row) => (row as { searchMatch?: unknown }).searchMatch)).toEqual([
      { field: 'note', snippet: 'called back' },
      null,
    ]);
    expect(res.search?.terms).toEqual(['called']);
  });

  it('an older backend (no search field) reads as no reading', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0, hasMore: false },
      },
    });
    expect((await ticketService.getAll()).search).toBeNull();
  });
});
