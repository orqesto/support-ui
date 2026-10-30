/**
 * The other searched lists (Contacts, tickets, ticket metadata, needs routing) send their filters
 * — the typed search among them — in a POST body, never the request line, and fall back to the
 * GET only when the backend predates the route (searchPost.ts).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const get = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const post = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const ok = { data: { success: true, data: [], pagination: { total: 0 } } };
// The backend without the route: Express's own HTML page, carried as a string body.
const notFound = Object.assign(new Error('Not Found'), {
  status: 404,
  data: '<pre>Cannot POST /api/tickets/search</pre>',
});
const notAllowed = Object.assign(new Error('Method Not Allowed'), { status: 405 });
// A route that exists answering "not found" — a JSON envelope, never "no such route".
const routeNotFound = Object.assign(new Error('Workspace not found'), {
  status: 404,
  data: { success: false, error: 'Workspace not found' },
});
const serverError = Object.assign(new Error('Boom'), { status: 500 });

import { kbService } from '@/services/kb.service';
import { messageService } from '@/services/message.service';
import { resetSearchPostSupport } from '@/services/searchPost';
import { ticketService } from '@/services/ticket.service';
import type { TicketSortBy } from '@/stores/ticketsStore';

describe('searched lists in a POST body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSearchPostSupport();
  });

  it.each([
    [
      'contacts',
      () => messageService.getContacts({ search: 'Jane Doe' }),
      '/api/messages/contacts/search',
    ],
    [
      'needs routing',
      () => messageService.getAll({ view: 'needs_routing', search: 'Jane Doe' }),
      '/api/messages/search',
    ],
    ['tickets', () => ticketService.getAll({ search: 'Jane Doe' }), '/api/tickets/search'],
    [
      'ticket metadata',
      () => ticketService.getMetadata({ search: 'Jane Doe' }),
      '/api/tickets/metadata/search',
    ],
    [
      'KB entries',
      () => kbService.getAll({ search: 'Jane Doe' }),
      '/api/knowledge-base/entries/search',
    ],
  ])('%s: the search goes in the body, the request line stays clean', async (_name, call, path) => {
    post.mockResolvedValue(ok);
    await call();
    expect(get).not.toHaveBeenCalled();
    const [url, body] = post.mock.calls[0] as [string, Record<string, string>];
    expect(url).toBe(path);
    expect(url).not.toContain('Jane');
    expect(body.search).toBe('Jane Doe');
  });

  it('falls back to the GET on a backend without the route, and remembers it', async () => {
    post.mockRejectedValue(notFound);
    get.mockResolvedValue(ok);
    await ticketService.getAll({ search: 'Jane Doe' });
    expect(get).toHaveBeenCalledTimes(1);
    expect(String(get.mock.calls[0][0])).toMatch(/^\/api\/tickets\?.*search=Jane\+Doe/);
    // Latched: the next read does not pay a failed POST first.
    await ticketService.getAll({ search: 'Jane Doe' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('KB entries fall back to the GET with every filter and the finding in the query', async () => {
    post.mockRejectedValue(notFound);
    get.mockResolvedValue({ data: { data: { entries: [], pagination: {} } } });
    await kbService.getAll({ search: 'Jane Doe', page: 2, finding: 'raw_email', departmentId: 3 });
    const query = new URLSearchParams(String(get.mock.calls[0][0]).split('?')[1]);
    expect(query.get('search')).toBe('Jane Doe');
    expect(query.get('page')).toBe('2');
    expect(query.get('finding')).toBe('raw_email');
    expect(query.get('departmentId')).toBe('3');
  });

  it('every filter the GET sent goes in the body — paging, sort and filters, not only the search', async () => {
    post.mockResolvedValue(ok);
    await ticketService.getAll({ search: 'Jane Doe', status: 'open' }, 3, 50, 'priority' as TicketSortBy, 'asc');
    const [, body] = post.mock.calls[0] as [string, Record<string, string>];
    expect(body).toMatchObject({ search: 'Jane Doe', status: 'open', page: '3', limit: '50' });
    expect(body.sortBy).toBe('priority');
    expect(body.sortOrder).toBe('asc');
  });

  it('a 405 falls back to the GET as a 404 does', async () => {
    post.mockRejectedValue(notAllowed);
    get.mockResolvedValue(ok);
    await ticketService.getAll({ search: 'Jane Doe' });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('a "not found" from a route that exists surfaces and does not switch the list to the GET', async () => {
    post.mockRejectedValueOnce(routeNotFound).mockResolvedValue(ok);
    await expect(ticketService.getAll({ search: 'Jane Doe' })).rejects.toThrow('Workspace not found');
    expect(get).not.toHaveBeenCalled();
    // Still on the POST: the typed search stays out of the request line.
    await ticketService.getAll({ search: 'Jane Doe' });
    expect(post).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled();
  });

  it('calls sent together on a backend without the route try the POST once, not once each', async () => {
    post.mockRejectedValue(notFound);
    get.mockResolvedValue(ok);
    await Promise.all([1, 2, 3].map(() => ticketService.getAll({ search: 'Jane Doe' })));
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('calls sent together on a backend WITH the route each POST, none by GET', async () => {
    post.mockResolvedValue(ok);
    await Promise.all([1, 2, 3].map(() => ticketService.getAll({ search: 'Jane Doe' })));
    expect(post).toHaveBeenCalledTimes(3);
    expect(get).not.toHaveBeenCalled();
  });

  it('the searched lists are marked read-only, so a 429 retries them', async () => {
    post.mockResolvedValue({ data: { success: true, data: { entries: [], pagination: {} } } });
    await kbService.getAll({ search: 'Jane Doe' });
    expect(post.mock.calls[0][2]).toMatchObject({ readOnly: true });
  });

  it('KB entries: the finding stays in the query string of the POST', async () => {
    post.mockResolvedValue({ data: { success: true, data: { entries: [], pagination: {} } } });
    await kbService.getAll({ search: 'Jane Doe', finding: 'raw_email', departmentId: 3 });
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/api/knowledge-base/entries/search?finding=raw_email&departmentId=3');
    expect(body).toEqual({ search: 'Jane Doe' });
  });

  it('CONTROL: any other failure surfaces — never quietly re-run as a GET', async () => {
    post.mockRejectedValue(serverError);
    await expect(ticketService.getAll({ search: 'Jane Doe' })).rejects.toThrow('Boom');
    expect(get).not.toHaveBeenCalled();
  });
});
