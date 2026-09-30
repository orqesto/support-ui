/**
 * The thread's "Tickets" panel (2026-09-30): which incidents this thread reports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const ticketsOfThread = vi.fn();
const addThreads = vi.fn();
const removeThread = vi.fn();
const getAll = vi.fn();

vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { ticketsOfThread, addThreads, removeThread },
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { getAll } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const socketHandlers = new Map<string, (data: unknown) => void>();
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: (name: string, handler: (data: unknown) => void) => socketHandlers.set(name, handler),
  unsubscribeFromEvent: (name: string) => socketHandlers.delete(name),
}));

const { ThreadTickets } = await import('@/components/messages/ThreadTickets');

const message = { id: 11, sender: 'ada@example.com', status: 'open' } as never;
const ticket = (over: Record<string, unknown>) => ({
  ticketId: 4,
  publicId: 'SUP-4',
  title: 'Checkout outage',
  status: 'open',
  priority: 'high',
  issueType: 'bug',
  externalId: null,
  isPrimary: false,
  resolvedAt: null,
  owesReply: false,
  ...over,
});
const renderPanel = () =>
  render(
    <MemoryRouter>
      <ThreadTickets message={message} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 0 });
  getAll.mockResolvedValue({ data: [{ id: 9, title: 'Login broken', status: 'in_progress' }] });
  addThreads.mockResolvedValue({ added: [11], alreadyAttached: [] });
  removeThread.mockResolvedValue(true);
});

describe('ThreadTickets', () => {
  it('lists every ticket, with the same #number the ticket page shows', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      rows: [ticket({}), ticket({ ticketId: 7, title: 'Slow search', status: 'in_progress' })],
      hiddenCount: 0,
    });
    renderPanel();
    expect(await screen.findByText('Checkout outage')).toBeInTheDocument();
    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByText('Slow search')).toBeInTheDocument();
  });

  it('D2: prompts only when owesReply is TRUE — null (unknown) says nothing', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      rows: [
        ticket({ status: 'resolved', owesReply: true }),
        ticket({ ticketId: 7, status: 'closed', owesReply: null }),
      ],
      hiddenCount: 0,
    });
    renderPanel();
    expect(await screen.findAllByText(/reply to tell this customer/)).toHaveLength(1);
  });

  it('the origin ticket cannot be removed here; another one can', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      rows: [ticket({ isPrimary: true }), ticket({ ticketId: 7, title: 'Slow search' })],
      hiddenCount: 0,
    });
    renderPanel();
    expect(await screen.findByText('created from this thread')).toBeInTheDocument();
    const removes = screen.getAllByRole('button', { name: /^Remove from ticket #/ });
    expect(removes).toHaveLength(1);
    await userEvent.click(removes[0]);
    await waitFor(() => expect(removeThread).toHaveBeenCalledWith(7, 11));
  });

  it('says how many tickets it could not show, instead of claiming the list is whole', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 2 });
    renderPanel();
    expect(await screen.findByText(/2 tickets in departments you cannot/)).toBeInTheDocument();
    expect(screen.queryByText(/Not on any ticket/)).not.toBeInTheDocument();
  });

  it('⛔ a failed read is not "not on any ticket"', async () => {
    ticketsOfThread.mockRejectedValue(new Error('boom'));
    renderPanel();
    expect(await screen.findByText(/could not read this thread’s tickets/)).toBeInTheDocument();
    expect(screen.queryByText(/Not on any ticket/)).not.toBeInTheDocument();
  });

  it('an older backend: says so, and offers no Add button that would 404', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: true });
    renderPanel();
    expect(await screen.findByText(/does not list a thread’s tickets yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add to ticket/ })).toBeDisabled();
  });

  it('adds the thread to a ticket the agent picks', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Add to ticket/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(addThreads).toHaveBeenCalledWith(9, [11]));
  });

  it('a full picker page says it is capped — "no other tickets" is never the cap talking', async () => {
    getAll.mockResolvedValue({
      data: Array.from({ length: 20 }, (_, index) => ({ id: index + 1, title: `T${index}`, status: 'open' })),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Add to ticket/ }));
    expect(await screen.findByText(/Showing the newest 20/)).toBeInTheDocument();
  });

  it('says so when the thread was already on the picked ticket', async () => {
    addThreads.mockResolvedValue({ added: [], alreadyAttached: [11] });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Add to ticket/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    expect(await screen.findByText('This thread is already on that ticket.')).toBeInTheDocument();
  });

  it('searches once per pause, not per keystroke', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Add to ticket/ }));
    await waitFor(() => expect(getAll).toHaveBeenCalledTimes(1)); // the initial list
    await userEvent.type(screen.getByPlaceholderText(/Search tickets/), 'login');
    await waitFor(() => expect(getAll).toHaveBeenCalledTimes(2), { timeout: 1500 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getAll).toHaveBeenCalledTimes(2);
    expect(getAll.mock.calls[1][0]).toEqual({ search: 'login' });
  });

  it('closing the picker inside the debounce drops that search — a reopened, empty picker never shows its results', async () => {
    getAll.mockImplementation((filters?: { search?: string }) =>
      Promise.resolve({
        data: [{ id: filters?.search ? 77 : 9, title: filters?.search ? 'ACME result' : 'Default list', status: 'open' }],
      })
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Add to ticket/ }));
    await screen.findByText('Default list');
    await userEvent.type(screen.getByPlaceholderText(/Search tickets/), 'acme');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: /Add to ticket/ }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByText('ACME result')).not.toBeInTheDocument();
    expect(screen.getByText('Default list')).toBeInTheDocument();
  });

  it('a reply on THIS thread clears "Fixed — reply…" without a click', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [ticket({ status: 'resolved', owesReply: true })], hiddenCount: 0 });
    renderPanel();
    expect(await screen.findByText(/reply to tell this customer/)).toBeInTheDocument();
    let answer: (value: unknown) => void = () => {};
    ticketsOfThread.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    act(() => socketHandlers.get('message:replied')?.({ messageId: 99 }));
    expect(ticketsOfThread).toHaveBeenCalledTimes(1);
    act(() => socketHandlers.get('message:replied')?.({ messageId: 11 }));
    // A quiet refresh: while it runs, the list stays on screen instead of "Loading…".
    expect(ticketsOfThread).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Checkout outage')).toBeInTheDocument();
    act(() => answer({ unavailable: false, rows: [ticket({ status: 'resolved', owesReply: false })], hiddenCount: 0 }));
    await waitFor(() => expect(screen.queryByText(/reply to tell this customer/)).not.toBeInTheDocument());
  });

  it('a ticket resolved elsewhere shows here — only for this thread’s tickets', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [ticket({ status: 'in_progress' })], hiddenCount: 0 });
    renderPanel();
    await screen.findByText('Checkout outage');
    await waitFor(() => expect(socketHandlers.get('ticket:updated')).toBeDefined());
    ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [ticket({ status: 'resolved', owesReply: true })], hiddenCount: 0 });
    act(() => socketHandlers.get('ticket:updated')?.({ ticketId: 5 }));
    expect(ticketsOfThread).toHaveBeenCalledTimes(1);
    act(() => socketHandlers.get('ticket:updated')?.({ ticketId: 4 }));
    expect(await screen.findByText(/reply to tell this customer/)).toBeInTheDocument();
  });

  it('a failed picker search says so inside the picker — not "no other tickets"', async () => {
    getAll.mockRejectedValue(new Error('boom'));
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /Add to ticket/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveTextContent(/boom|Could not search tickets/));
    expect(screen.queryByText('No other tickets to add it to.')).not.toBeInTheDocument();
  });
  it('overlapping quiet refreshes: an OLDER answer landing last does not overwrite the newer one', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [ticket({ status: 'in_progress' })], hiddenCount: 0 });
    renderPanel();
    await screen.findByText('Checkout outage');
    await waitFor(() => expect(socketHandlers.get('ticket:updated')).toBeDefined());
    const answers: Array<(value: unknown) => void> = [];
    ticketsOfThread.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    act(() => socketHandlers.get('ticket:updated')?.({ ticketId: 4 })); // resolved
    act(() => socketHandlers.get('ticket:updated')?.({ ticketId: 4 })); // reopened
    act(() => answers[1]({ unavailable: false, rows: [ticket({ status: 'open', owesReply: false })], hiddenCount: 0 }));
    await waitFor(() => expect(screen.queryByText(/in progress/)).not.toBeInTheDocument());
    act(() => answers[0]({ unavailable: false, rows: [ticket({ status: 'resolved', owesReply: true })], hiddenCount: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/reply to tell this customer/)).not.toBeInTheDocument();
  });

  it('a reply that failed to send brings "Fixed — reply…" back', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [ticket({ status: 'resolved', owesReply: false })], hiddenCount: 0 });
    renderPanel();
    await screen.findByText('Checkout outage');
    ticketsOfThread.mockResolvedValue({ unavailable: false, rows: [ticket({ status: 'resolved', owesReply: true })], hiddenCount: 0 });
    act(() => socketHandlers.get('send-failed')?.({ messageId: 11 }));
    expect(await screen.findByText(/reply to tell this customer/)).toBeInTheDocument();
  });
});
