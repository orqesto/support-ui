/**
 * Mutation batch (message detail v4), chunk 6: useThreadTicketsState's guards that survived —
 * an older read must not write over a newer one; "ticket:updated" re-reads only for this
 * thread's tickets and is unsubscribed on unmount; a thread-tickets-changed event names the
 * thread it is about.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

type TicketsAnswer = { unavailable: boolean; rows: unknown[]; hiddenCount: number };
const ticketsOfThread = vi.fn<(id: number) => Promise<TicketsAnswer>>();
const handlers = new Map<string, Set<(data: unknown) => void>>();
const subscribeToEvent = vi.fn((name: string, handler: (data: unknown) => void) => {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name)!.add(handler);
});
const unsubscribeFromEvent = vi.fn((name: string, handler: (data: unknown) => void) => {
  handlers.get(name)?.delete(handler);
});
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: (name: string, handler: (data: unknown) => void) => subscribeToEvent(name, handler),
  unsubscribeFromEvent: (name: string, handler: (data: unknown) => void) =>
    unsubscribeFromEvent(name, handler),
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { ticketsOfThread: (id: number) => ticketsOfThread(id) },
}));
vi.mock('@/services/message.service', () => ({
  messageService: { getLinkedTicket: () => Promise.resolve({ data: null }) },
}));
vi.mock('@/services/conversationMerge.service', () => ({
  conversationMergeService: { listMerges: () => Promise.resolve([]) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { useThreadTicketsState } = await import('../useThreadTicketsState');
const { THREAD_TICKETS_CHANGED } = await import('@/services/ticketThreadsEvents');

const row = (ticketId: number) => ({
  ticketId,
  publicId: null,
  title: `T${ticketId}`,
  status: 'open',
  priority: 'high',
  issueType: 'bug',
  externalId: null,
  isPrimary: false,
  resolvedAt: null,
  owesReply: false,
});
const ready = (...ids: number[]) => ({ unavailable: false, rows: ids.map(row), hiddenCount: 0 });
const onThreadChange = () => undefined;
const mount = (messageId = 101) =>
  renderHook(() => useThreadTicketsState({ messageId, onThreadChange }));

beforeEach(() => {
  ticketsOfThread.mockReset();
  subscribeToEvent.mockClear();
  unsubscribeFromEvent.mockClear();
  handlers.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('useThreadTicketsState', () => {
  it('an older read landing after a newer one does not write over it', async () => {
    const first = deferred<TicketsAnswer>();
    ticketsOfThread.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ready(2));
    const { result } = mount();
    act(() => result.current.loadTickets());
    await waitFor(() => expect(result.current.ticketIds).toEqual([2]));
    await act(async () => {
      first.resolve(ready(1));
      await first.promise;
    });
    expect(result.current.ticketIds).toEqual([2]);
  });

  it('ticket:updated re-reads for one of this thread’s tickets only, and is unsubscribed on unmount', async () => {
    ticketsOfThread.mockResolvedValue(ready(7));
    const { result, unmount } = mount();
    await waitFor(() => expect(result.current.ticketIds).toEqual([7]));
    expect(subscribeToEvent).toHaveBeenCalledWith('ticket:updated', expect.any(Function));
    const reads = ticketsOfThread.mock.calls.length;
    act(() => handlers.get('ticket:updated')?.forEach((handler) => handler({ ticketId: 99 })));
    expect(ticketsOfThread).toHaveBeenCalledTimes(reads);
    act(() => handlers.get('ticket:updated')?.forEach((handler) => handler({ ticketId: 7 })));
    expect(ticketsOfThread).toHaveBeenCalledTimes(reads + 1);
    const handler = subscribeToEvent.mock.calls.find(([name]) => name === 'ticket:updated')?.[1];
    unmount();
    expect(unsubscribeFromEvent).toHaveBeenCalledWith('ticket:updated', handler);
  });

  it('CONTROL: a thread on no ticket subscribes to no ticket:updated', async () => {
    ticketsOfThread.mockResolvedValue(ready());
    const { result } = mount();
    await waitFor(() => expect(result.current.tickets.state).toBe('ready'));
    expect(subscribeToEvent.mock.calls.map(([name]) => name)).not.toContain('ticket:updated');
  });

  it('a thread-tickets-changed event re-reads when it names this thread, not otherwise', async () => {
    ticketsOfThread.mockResolvedValue(ready(7));
    const { result } = mount(101);
    await waitFor(() => expect(result.current.ticketIds).toEqual([7]));
    const reads = ticketsOfThread.mock.calls.length;
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [55] } })
      );
      window.dispatchEvent(new CustomEvent(THREAD_TICKETS_CHANGED));
    });
    expect(ticketsOfThread).toHaveBeenCalledTimes(reads);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [55, 101] } })
      );
    });
    expect(ticketsOfThread).toHaveBeenCalledTimes(reads + 1);
  });
});
