/**
 * Version skew: the frontend can reach a backend without these routes. A 404 there must read as
 * "unavailable" — never as an empty list, which would say the thread is on no ticket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, post, delete: del } }));

const { ticketThreadsService } = await import('@/services/ticketThreads.service');
const { THREAD_TICKETS_CHANGED } = await import('@/services/ticketThreadsEvents');

beforeEach(() => vi.clearAllMocks());

describe('ticketThreadsService', () => {
  it('reads a thread’s tickets and the hidden count', async () => {
    get.mockResolvedValue({ data: { data: { tickets: [{ ticketId: 4 }], hiddenCount: 2 } } });
    expect(await ticketThreadsService.ticketsOfThread(11)).toEqual({
      unavailable: false,
      rows: [{ ticketId: 4 }],
      hiddenCount: 2,
    });
    expect(get).toHaveBeenCalledWith('/api/messages/11/tickets');
  });

  it('⛔ a 404 (older backend) is "unavailable", not an empty list', async () => {
    get.mockRejectedValue({ response: { status: 404 } });
    expect(await ticketThreadsService.ticketsOfThread(11)).toEqual({ unavailable: true });
    expect(await ticketThreadsService.threadsOfTicket(4)).toEqual({ unavailable: true });
  });

  it('any other failure is thrown, so the caller can say the list is incomplete', async () => {
    get.mockRejectedValue({ response: { status: 500 } });
    await expect(ticketThreadsService.threadsOfTicket(4)).rejects.toEqual({ response: { status: 500 } });
  });

  it('a missing field reads as nothing hidden, not as a crash', async () => {
    get.mockResolvedValue({ data: { data: { threads: [] } } });
    expect(await ticketThreadsService.threadsOfTicket(4)).toEqual({
      unavailable: false,
      rows: [],
      hiddenCount: 0,
    });
  });

  it('announces a change after add and remove, so the thread header can reload', async () => {
    const seen: number[][] = [];
    const listener = (event: Event) =>
      seen.push((event as CustomEvent<{ conversationIds: number[] }>).detail.conversationIds);
    window.addEventListener(THREAD_TICKETS_CHANGED, listener);
    post.mockResolvedValue({ data: { data: { added: [11], alreadyAttached: [] } } });
    del.mockResolvedValue({ data: { data: { removed: true } } });
    await ticketThreadsService.addThreads(4, [11, 12]);
    await ticketThreadsService.removeThread(4, 12);
    window.removeEventListener(THREAD_TICKETS_CHANGED, listener);
    expect(seen).toEqual([[11, 12], [12]]);
  });

  it('a FAILED add announces nothing', async () => {
    const listener = vi.fn();
    window.addEventListener(THREAD_TICKETS_CHANGED, listener);
    post.mockRejectedValue({ response: { status: 500 } });
    await expect(ticketThreadsService.addThreads(4, [11])).rejects.toBeTruthy();
    window.removeEventListener(THREAD_TICKETS_CHANGED, listener);
    expect(listener).not.toHaveBeenCalled();
  });
});
