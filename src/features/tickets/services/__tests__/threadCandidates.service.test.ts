/**
 * The one thread search behind both ticket pickers ("Add threads" on a ticket, "Threads it
 * explains" on Create ticket). It was written twice; the sender-on-the-thread-row fix had to be
 * made in each copy.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const getThreads = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/services/message.service', () => ({
  messageService: { getThreads: (...args: unknown[]) => getThreads(...args) },
}));

const { searchThreadCandidates, THREAD_PICKER_LIMIT } = await import('../threadCandidates.service');

const row = (id: number, threadSender: string | null, messageSender: string) => ({
  sender: threadSender,
  latestMessage: { id, publicId: `SUP-${id}`, subject: `Subject ${id}`, sender: messageSender },
});

describe('searchThreadCandidates', () => {
  beforeEach(() => getThreads.mockReset());

  it('searches every lifecycle, trimmed, one page of the picker limit', async () => {
    getThreads.mockResolvedValue({ data: [] });
    await searchThreadCandidates('  pallet ');
    expect(getThreads).toHaveBeenCalledWith(
      { search: 'pallet', lifecycle: 'all' },
      1,
      THREAD_PICKER_LIMIT
    );
    await searchThreadCandidates('   ');
    expect(getThreads).toHaveBeenLastCalledWith({ lifecycle: 'all' }, 1, THREAD_PICKER_LIMIT);
  });

  it('takes the customer from the THREAD row, the message only when the row has none', async () => {
    getThreads.mockResolvedValue({
      data: [
        row(1, 'ada@example.com', 'agent@example.com'),
        row(2, null, 'bob@example.com'),
        { sender: 'nobody@example.com', latestMessage: null }, // no message: not pickable
        row(-7, 'spam@example.com', 'spam@example.com'), // spam-log row: no conversation behind it
      ],
    });
    const { candidates, capped } = await searchThreadCandidates('');
    expect(candidates).toEqual([
      { id: 1, publicId: 'SUP-1', subject: 'Subject 1', sender: 'ada@example.com', status: null },
      { id: 2, publicId: 'SUP-2', subject: 'Subject 2', sender: 'bob@example.com', status: null },
    ]);
    expect(capped).toBe(false);
  });

  it('a full page is capped (there may be more); CONTROL: one short of it is not', async () => {
    const page = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        row(index + 1, 'ada@example.com', 'x@example.com')
      );
    getThreads.mockResolvedValue({ data: page(THREAD_PICKER_LIMIT) });
    expect((await searchThreadCandidates('')).capped).toBe(true);
    getThreads.mockResolvedValue({ data: page(THREAD_PICKER_LIMIT - 1) });
    expect((await searchThreadCandidates('')).capped).toBe(false);
  });
});
