/**
 * A ticket's threads — every customer who reported the incident (2026-09-30).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    data: [{ latestMessage: { id: 21, subject: 'Checkout fails', sender: 'bob@other.example' } }],
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
    expect(await screen.findByText('2 customers still need a reply about this fix')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
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
      await screen.findByText(/1 customer still needs a reply about this fix \(among the threads you can open\)/)
    ).toBeInTheDocument();
  });
});
