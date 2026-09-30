/**
 * Version skew: the frontend can reach a backend without these routes. A 404 there must read as
 * "unavailable" — never as an empty list, which would say the thread is on no ticket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { get, post: vi.fn(), delete: vi.fn() } }));

const { ticketThreadsService } = await import('@/services/ticketThreads.service');

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
});
