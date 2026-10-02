/**
 * The thread fetch asks for a page and always answers with what was left out — from the
 * backend that pages, and from the one before it that sent the whole thread and said nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const { messageService } = await import('../message.service');
const { normaliseThreadPage, threadPageQuery } = await import('../threadPage');

const rows = [{ id: 40 }, { id: 41 }, { id: 42 }];

beforeEach(() => get.mockReset());

describe('messageService.getThreadMessages', () => {
  it('asks for the latest page, and hands back the bound the backend reported', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: rows,
        page: { total: 1887, shown: 3, hasEarlier: true, earliestId: 40, limit: 300 },
      },
    });
    const result = await messageService.getThreadMessages(7, { limit: 300 });
    expect(get).toHaveBeenCalledWith('/api/messages/7/thread?limit=300');
    expect(result.data).toEqual(rows);
    expect(result.page).toEqual({ total: 1887, hasEarlier: true, earliestId: 40 });
  });

  it('an older page is asked for with before=<earliestId>', async () => {
    get.mockResolvedValue({ data: { success: true, data: rows, page: { total: 1887 } } });
    await messageService.getThreadMessages(7, { limit: 300, before: 40 });
    expect(get).toHaveBeenCalledWith('/api/messages/7/thread?limit=300&before=40');
  });

  it('CONTROL: the backend before paging — what it sent is the whole thread', async () => {
    get.mockResolvedValue({ data: { success: true, data: rows } });
    const result = await messageService.getThreadMessages(7);
    expect(get).toHaveBeenCalledWith('/api/messages/7/thread');
    expect(result.page).toEqual({ total: 3, hasEarlier: false, earliestId: 40 });
  });
});

describe('normaliseThreadPage', () => {
  it('a page without a usable total is read as the old backend', () => {
    expect(normaliseThreadPage({ total: 'many', hasEarlier: true }, rows)).toEqual({
      total: 3,
      hasEarlier: false,
      earliestId: 40,
    });
  });

  it('hasEarlier is true only when the backend said so, and earliestId only as a positive id', () => {
    expect(normaliseThreadPage({ total: 9, hasEarlier: 'yes', earliestId: 0 }, rows)).toEqual({
      total: 9,
      hasEarlier: false,
      earliestId: null,
    });
  });

  it('an empty answer has no earliest id', () => {
    expect(normaliseThreadPage(undefined, [])).toEqual({
      total: 0,
      hasEarlier: false,
      earliestId: null,
    });
  });
});

describe('threadPageQuery', () => {
  it('builds only what was asked', () => {
    expect(threadPageQuery()).toBe('');
    expect(threadPageQuery({ limit: 0 })).toBe('');
    expect(threadPageQuery({ before: 12 })).toBe('?before=12');
  });
});
