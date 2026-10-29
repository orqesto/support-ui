/**
 * `getThreadBoard` reads the whole kanban board in one `POST /threads/board`, each entry
 * normalised as `getThreads` normalises one list. A backend that predates the route answers
 * `null` (and is not asked again this page load); an entry that did not finish is `null`.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: (...args: unknown[]) => post(...args) },
}));

import { messageService } from '@/services/message.service';
import { resetThreadBoardSupport, type ThreadBoardRequest } from '@/services/threadsQuery';

const notFound = Object.assign(new Error('Not Found'), { status: 404 });
const serverError = Object.assign(new Error('Boom'), { status: 500 });

const list = (extra: Record<string, unknown> = {}) => ({
  success: true,
  data: [{ threadId: 'conv_1', searchMatch: null }],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  scope: null,
  ...extra,
});

const request: ThreadBoardRequest = {
  filters: { priority: 'high' },
  columns: [
    { id: 'open', filters: { lifecycle: 'open' }, limit: 20, pages: 1 },
    { id: 'resolved', filters: { lifecycle: 'resolved' }, limit: 20, pages: 1 },
  ],
  counts: [
    { id: 'spam', filters: { showSpam: 'true', read: 'unread' } },
    { id: 'archived', filters: { view: 'archived', read: 'unread' } },
  ],
};

describe('getThreadBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetThreadBoardSupport();
  });

  it('sends one request and returns each column and count', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        columns: { open: [list()], resolved: [list()] },
        counts: {
          spam: { pagination: { page: 1, limit: 1, total: 4, totalPages: 4 }, scope: null },
          archived: { pagination: { page: 1, limit: 1, total: 2, totalPages: 2 }, scope: null },
        },
      },
    });
    const answer = await messageService.getThreadBoard(request);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('/api/messages/threads/board');
    expect(answer?.columns.open?.[0].data).toHaveLength(1);
    expect(answer?.counts.spam?.pagination.total).toBe(4);
  });

  it('answers null for a column or count that did not finish, keeping the others', async () => {
    post.mockResolvedValue({
      data: {
        success: true,
        columns: { open: [list({ timedOut: true })], resolved: [list()] },
        counts: {
          spam: {
            pagination: { page: 1, limit: 1, total: 400, totalPages: 400, countTimedOut: true },
            scope: null,
          },
          archived: { pagination: { page: 1, limit: 1, total: 2, totalPages: 2 }, scope: null },
        },
      },
    });
    const answer = await messageService.getThreadBoard(request);
    expect(answer?.columns.open).toBeNull();
    expect(answer?.counts.spam).toBeNull();
    // CONTROL: the finished entries are kept.
    expect(answer?.columns.resolved).toHaveLength(1);
    expect(answer?.counts.archived?.pagination.total).toBe(2);
  });

  it('answers null for an entry the backend left out', async () => {
    post.mockResolvedValue({ data: { success: true, columns: { open: null }, counts: {} } });
    const answer = await messageService.getThreadBoard(request);
    expect(answer?.columns.open).toBeNull();
    expect(answer?.columns.resolved).toBeNull();
    expect(answer?.counts.spam).toBeNull();
  });

  it('a backend without the route answers null, and is not asked again', async () => {
    post.mockRejectedValue(notFound);
    expect(await messageService.getThreadBoard(request)).toBeNull();
    expect(await messageService.getThreadBoard(request)).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: any other failure is thrown, never read as "no route"', async () => {
    post.mockRejectedValue(serverError);
    await expect(messageService.getThreadBoard(request)).rejects.toThrow('Boom');
    post.mockRejectedValue(serverError);
    await expect(messageService.getThreadBoard(request)).rejects.toThrow('Boom');
    expect(post).toHaveBeenCalledTimes(2);
  });
});
