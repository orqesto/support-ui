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
});
