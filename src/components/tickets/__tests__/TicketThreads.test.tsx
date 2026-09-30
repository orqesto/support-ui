/**
 * A ticket's threads — every customer who reported the incident (2026-09-30).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const threadsOfTicket = vi.fn();
const addThreads = vi.fn();
const removeThread = vi.fn();
const getThreads = vi.fn();

vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { threadsOfTicket, addThreads, removeThread },
}));
vi.mock('@/services/message.service', () => ({ messageService: { getThreads } }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACME' }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const socketHandlers = new Map<string, (data: unknown) => void>();
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: (name: string, handler: (data: unknown) => void) => socketHandlers.set(name, handler),
  unsubscribeFromEvent: (name: string) => socketHandlers.delete(name),
}));

const { TicketThreads } = await import('@/components/tickets/TicketThreads');

const thread = (over: Record<string, unknown>) => ({
  conversationId: 11,
  publicId: 'SUP-11',
  subject: 'Cannot pay',
  requesterEmail: 'ada@example.com',
  status: 'open',
  channel: 'email',
  createdAt: '2026-09-28T10:00:00Z',
  isPrimary: false,
  addedAt: '2026-09-29T10:00:00Z',
  owesReply: false,
  ...over,
});
const renderList = (onCountChange = vi.fn()) =>
  render(
    <MemoryRouter>
      <TicketThreads ticketId={4} onCountChange={onCountChange} fallback={<p>legacy list</p>} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  threadsOfTicket.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 0 });
  getThreads.mockResolvedValue({
    // The real shape: the sender is on the THREAD row; latestMessage carries requesterEmail only.
    data: [
      {
        sender: 'bob@other.example',
        latestMessage: { id: 21, subject: 'Checkout fails', requesterEmail: 'bob@other.example' },
      },
    ],
  });
  addThreads.mockResolvedValue({ added: [21], alreadyAttached: [] });
});

describe('TicketThreads', () => {
  it('keeps what the old list said — channel, sender, subject, a link — and reports the count', async () => {
    const onCountChange = vi.fn();
    threadsOfTicket.mockResolvedValue({
      unavailable: false,
      rows: [thread({ isPrimary: true }), thread({ conversationId: 12, requesterEmail: 'bob@other.example', status: 'resolved' })],
      hiddenCount: 0,
    });
    renderList(onCountChange);
    expect(await screen.findByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@other.example')).toBeInTheDocument();
    expect(screen.getAllByText('email')).toHaveLength(2);
    // A RESOLVED thread is listed — the inbox-based list hid exactly these.
    expect(screen.getByText('resolved')).toBeInTheDocument();
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/messages?id=ACME-SUP-11');
    expect(onCountChange).toHaveBeenCalledWith(2);
  });

  it('D2: counts the customers still owed a reply, and marks each', async () => {
    threadsOfTicket.mockResolvedValue({
      unavailable: false,
      rows: [
        thread({ owesReply: true }),
        thread({ conversationId: 12, owesReply: true }),
        thread({ conversationId: 13, owesReply: null }),
      ],
      hiddenCount: 0,
    });
    renderList();
    expect(await screen.findByText('2 threads still need a reply about this fix')).toBeInTheDocument();
    expect(screen.getAllByText(/Fixed — reply to tell this customer/)).toHaveLength(2);
  });

  it('the origin thread has no Remove', async () => {
    threadsOfTicket.mockResolvedValue({
      unavailable: false,
      rows: [thread({ isPrimary: true }), thread({ conversationId: 12 })],
      hiddenCount: 0,
    });
    renderList();
    expect(await screen.findByText('ticket created from this')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove ada@example.com’s thread from this ticket' }));
    await waitFor(() => expect(removeThread).toHaveBeenCalledWith(4, 12));
  });

  it('an older backend shows the previous list instead', async () => {
    threadsOfTicket.mockResolvedValue({ unavailable: true });
    renderList();
    expect(await screen.findByText('legacy list')).toBeInTheDocument();
  });

  it('⛔ the picker searches ANY customer’s threads, in every lifecycle — not only this ticket’s customer', async () => {
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: /Add threads/ }));
    await waitFor(() => expect(getThreads).toHaveBeenCalled());
    const filters: unknown = getThreads.mock.calls[0]?.[0];
    expect(filters).toEqual({ lifecycle: 'all' });
    // Who reported it — from the thread row (staging showed every row as "· subject").
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('bob@other.example'));
    await userEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(addThreads).toHaveBeenCalledWith(4, [21]));
  });

  it('⛔ a failed read is not "no linked messages"', async () => {
    threadsOfTicket.mockRejectedValue(new Error('boom'));
    renderList();
    expect(await screen.findByText(/could not read this ticket’s threads/)).toBeInTheDocument();
    expect(screen.queryByText('No linked messages.')).not.toBeInTheDocument();
  });

  it('⛔ a response for the PREVIOUS ticket, arriving after the switch, is ignored', async () => {
    let releaseOld: (value: unknown) => void = () => undefined;
    threadsOfTicket.mockImplementation((ticketId: number) =>
      ticketId === 4
        ? new Promise((resolve) => {
            releaseOld = resolve;
          })
        : Promise.resolve({ unavailable: false, rows: [thread({ conversationId: 50, requesterEmail: 'new@x.example' })], hiddenCount: 0 })
    );
    const { rerender } = render(
      <MemoryRouter>
        <TicketThreads ticketId={4} fallback={<p>legacy</p>} />
      </MemoryRouter>
    );
    rerender(
      <MemoryRouter>
        <TicketThreads ticketId={5} fallback={<p>legacy</p>} />
      </MemoryRouter>
    );
    expect(await screen.findByText('new@x.example')).toBeInTheDocument();
    releaseOld({ unavailable: false, rows: [thread({ requesterEmail: 'old@x.example' })], hiddenCount: 0 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('old@x.example')).not.toBeInTheDocument();
  });

  it('the tab count is withheld while loading or after a failure, and "unavailable" says so', async () => {
    const onCountChange = vi.fn();
    threadsOfTicket.mockRejectedValue(new Error('boom'));
    renderList(onCountChange);
    await screen.findByText(/could not read this ticket’s threads/);
    expect(onCountChange.mock.calls.map(([count]: unknown[]) => count)).toEqual([null]);

    const onUnavailable = vi.fn();
    threadsOfTicket.mockResolvedValue({ unavailable: true });
    renderList(onUnavailable);
    await screen.findAllByText('legacy list');
    expect(onUnavailable).toHaveBeenLastCalledWith('unavailable');
  });

  it('says the owing count covers only the threads the agent can open', async () => {
    threadsOfTicket.mockResolvedValue({
      unavailable: false,
      rows: [thread({ owesReply: true })],
      hiddenCount: 2,
    });
    renderList();
    expect(
      await screen.findByText(/1 thread still needs a reply about this fix \(among the threads you can open\)/)
    ).toBeInTheDocument();
  });

  it('an add FAILING after a switch does not show its error on the new ticket, and the picker closes', async () => {
    let failAdd: (reason: unknown) => void = () => undefined;
    addThreads.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          failAdd = reject;
        })
    );
    const { rerender } = render(
      <MemoryRouter>
        <TicketThreads ticketId={4} fallback={<p>legacy</p>} />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: /Add threads/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    rerender(
      <MemoryRouter>
        <TicketThreads ticketId={5} fallback={<p>legacy</p>} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.queryByText('Add threads to this ticket')).not.toBeInTheDocument());
    failAdd(new Error('boom'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByText('That thread could not be added.')).not.toBeInTheDocument();
  });

  it('⛔ a REMOVE still in flight when the page switches ticket does not reload the old ticket into the new one', async () => {
    let finishRemove: (value: unknown) => void = () => undefined;
    removeThread.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRemove = resolve;
        })
    );
    threadsOfTicket.mockImplementation((ticketId: number) =>
      Promise.resolve({
        unavailable: false,
        hiddenCount: 0,
        rows:
          ticketId === 4
            ? [thread({ isPrimary: true, requesterEmail: 'a-origin@x.example' }), thread({ conversationId: 12, requesterEmail: 'a-other@x.example' })]
            : [thread({ conversationId: 60, isPrimary: true, requesterEmail: 'b-origin@x.example' })],
      })
    );
    const { rerender } = render(
      <MemoryRouter>
        <TicketThreads ticketId={4} fallback={<p>legacy</p>} />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Remove a-other@x.example’s thread from this ticket' }));
    rerender(
      <MemoryRouter>
        <TicketThreads ticketId={5} fallback={<p>legacy</p>} />
      </MemoryRouter>
    );
    expect(await screen.findByText('b-origin@x.example')).toBeInTheDocument();
    finishRemove(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByText('b-origin@x.example')).toBeInTheDocument();
    expect(screen.queryByText('a-origin@x.example')).not.toBeInTheDocument();
    expect(threadsOfTicket.mock.calls.filter(([id]: unknown[]) => id === 4)).toHaveLength(1);
  });

  it('a failed picker search says so inside the picker — not "no other threads"', async () => {
    getThreads.mockRejectedValue(new Error('boom'));
    renderList();
    await userEvent.click(await screen.findByRole('button', { name: /Add threads/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveTextContent(/boom|Could not search threads/));
    expect(screen.queryByText('No other threads to add.')).not.toBeInTheDocument();
  });
  it('resolving THIS ticket (socket) shows who is owed a reply, without a reload — another ticket does nothing', async () => {
    threadsOfTicket.mockResolvedValue({ unavailable: false, rows: [thread({})], hiddenCount: 0 });
    renderList();
    await screen.findByText('Cannot pay');
    await waitFor(() => expect(socketHandlers.get('ticket:updated')).toBeDefined());
    let answer: (value: unknown) => void = () => {};
    threadsOfTicket.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    act(() => socketHandlers.get('ticket:updated')?.({ ticketId: 5 }));
    expect(threadsOfTicket).toHaveBeenCalledTimes(1);
    act(() => socketHandlers.get('ticket:updated')?.({ ticketId: 4 }));
    expect(threadsOfTicket).toHaveBeenCalledTimes(2);
    // Quiet: the list stays while it reloads.
    expect(screen.getByText('Cannot pay')).toBeInTheDocument();
    act(() => answer({ unavailable: false, rows: [thread({ owesReply: true })], hiddenCount: 0 }));
    expect(await screen.findByText(/still needs? a reply about this fix/)).toBeInTheDocument();
  });

  it('a reply sent — or failing to send — on one of its threads refreshes the list', async () => {
    threadsOfTicket.mockResolvedValue({ unavailable: false, rows: [thread({ owesReply: true })], hiddenCount: 0 });
    renderList();
    expect(await screen.findByText(/Fixed — reply to tell this customer/)).toBeInTheDocument();
    threadsOfTicket.mockResolvedValue({ unavailable: false, rows: [thread({ owesReply: false })], hiddenCount: 0 });
    act(() => socketHandlers.get('message:replied')?.({ messageId: 99 }));
    expect(threadsOfTicket).toHaveBeenCalledTimes(1);
    act(() => socketHandlers.get('message:replied')?.({ messageId: 11 }));
    await waitFor(() => expect(screen.queryByText(/Fixed — reply to tell this customer/)).not.toBeInTheDocument());
    threadsOfTicket.mockResolvedValue({ unavailable: false, rows: [thread({ owesReply: true })], hiddenCount: 0 });
    act(() => socketHandlers.get('send-failed')?.({ messageId: 11 }));
    expect(await screen.findByText(/Fixed — reply to tell this customer/)).toBeInTheDocument();
  });
  it('a quiet refresh that replaced the first load and FAILED says so — not "Loading…" for good', async () => {
    let first: (value: unknown) => void = () => {};
    threadsOfTicket.mockReturnValueOnce(new Promise((resolve) => (first = resolve)));
    renderList();
    await waitFor(() => expect(socketHandlers.get('ticket:updated')).toBeDefined());
    threadsOfTicket.mockRejectedValueOnce(new Error('boom'));
    act(() => socketHandlers.get('ticket:updated')?.({ ticketId: 4 }));
    act(() => first({ unavailable: false, rows: [thread({})], hiddenCount: 0 }));
    expect(await screen.findByText(/could not read this ticket’s threads/)).toBeInTheDocument();
  });
});
