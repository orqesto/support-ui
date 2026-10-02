/**
 * Message detail v4 — the header: what the Related popover's rows SAY (counts, plurals, the
 * subject fallback, the "This thread" row, an older backend's card) and what an add from the
 * header does to the host (refresh) and to the picker (no ticket the thread is already on).
 * Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { svc, ticket, renderHeader, twoTickets } from './md4.header.utils';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

const thread = (conversationId: number, over: Record<string, unknown> = {}) => ({
  conversationId,
  publicId: `SUP-${conversationId}`,
  subject: `Subject ${conversationId}`,
  status: 'open',
  isPrimary: false,
  ...over,
});

const openPopover = async () => {
  fireEvent.click(await screen.findByTestId('ticket-chip'));
  return screen.findByRole('dialog', { name: 'Tickets' });
};

describe('H2 — the Related popover’s rows', () => {
  it('"1 thread on this ticket" for one, "2 threads on this ticket" for two', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 }), ticket({ ticketId: 7, isPrimary: true })],
    });
    svc.threadsOfTicket.mockImplementation((id: number) =>
      Promise.resolve({
        unavailable: false,
        hiddenCount: 0,
        rows: id === 9 ? [thread(1)] : [thread(1), thread(44)],
      })
    );
    renderHeader();
    const popover = await openPopover();
    const nine = within(popover).getByTestId('related-ticket-9');
    const seven = within(popover).getByTestId('related-ticket-7');
    expect(await within(nine).findByText('1 thread on this ticket')).toBeInTheDocument();
    expect(await within(seven).findByText('2 threads on this ticket')).toBeInTheDocument();
  });

  it('the "This thread" row has no Open link; every other row has one', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 })],
    });
    svc.threadsOfTicket.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [thread(1), thread(44)],
    });
    renderHeader();
    const popover = await openPopover();
    const self = (await within(popover).findByText('This thread')).closest('li')!;
    expect(within(self).queryByRole('link')).toBeNull();
    expect(within(popover).queryByRole('link', { name: 'Open TES-SUP-1' })).toBeNull();
    const other = within(popover).getByRole('link', { name: 'Open TES-SUP-44' });
    expect(other).toHaveAttribute('href', '/messages?id=TES-SUP-44');
  });

  it('a thread with no subject (empty or blank) reads "(no subject)"', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 })],
    });
    svc.threadsOfTicket.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [thread(1), thread(44, { subject: '' }), thread(45, { subject: '   ' })],
    });
    renderHeader();
    const popover = await openPopover();
    const row = (id: number) =>
      within(popover)
        .getByRole('link', { name: `Open TES-SUP-${id}` })
        .closest('li')!;
    await within(popover).findByText('3 threads on this ticket');
    expect(row(44).textContent).toContain('(no subject)');
    expect(row(45).textContent).toContain('(no subject)');
    // CONTROL: a real subject is shown as it is.
    expect(within(popover).getByText('This thread').closest('li')!.textContent).toContain(
      'Subject 1'
    );
  });

  it('another thread reads the board’s work status, not the raw conversation status', async () => {
    // BE ticketThreads sends `conversations.status` — the raw reply sub-values, no flags.
    const raw: [string, string][] = [
      ['awaiting_response', 'Pending'],
      ['pending', 'Pending'],
      ['client_replied', 'In progress'],
      ['in_progress', 'In progress'],
      ['new', 'Open'],
      ['open', 'Open'],
      ['needs_routing', 'Open'],
      ['resolved', 'Resolved'],
      ['closed', 'Closed'],
      ['filtered', 'Filtered'],
    ];
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 })],
    });
    svc.threadsOfTicket.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [thread(1), ...raw.map(([status], index) => thread(50 + index, { status }))],
    });
    renderHeader();
    const popover = await openPopover();
    await within(popover).findByText(`${raw.length + 1} threads on this ticket`);
    raw.forEach(([status, label], index) => {
      const row = within(popover)
        .getByRole('link', { name: `Open TES-SUP-${50 + index}` })
        .closest('li')!;
      expect([status, row.textContent]).toEqual([
        status,
        `TES-SUP-${50 + index}Subject ${50 + index}${label}Open`,
      ]);
    });
  });

  it.each([
    [1, '+ 1 ticket in departments you cannot open.'],
    [2, '+ 2 tickets in departments you cannot open.'],
  ])('%i hidden ticket(s): "%s"', async (hiddenCount, line) => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount,
      rows: [ticket({ ticketId: 9 })],
    });
    renderHeader();
    const popover = await openPopover();
    expect(within(popover).getByText(line)).toBeInTheDocument();
  });

  it('an older backend: the card shows the ticket’s status, under "Linked to ticket"', async () => {
    // getLinkedTicket (md4.header.utils): { id: 5, status: 'open' }.
    svc.ticketsOfThread.mockResolvedValue({ unavailable: true });
    renderHeader();
    const popover = await openPopover();
    expect(within(popover).getByRole('heading', { name: 'Linked to ticket' })).toBeInTheDocument();
    const card = within(popover).getByText('#5').closest('article')!;
    expect(within(card).getByText('Open')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Open ticket' })).toBeInTheDocument();
  });
});

describe('H2 — Add to ticket… from the header', () => {
  const addFromPopover = async () => {
    const popover = await openPopover();
    fireEvent.click(within(popover).getByRole('button', { name: 'Add to ticket…' }));
    await screen.findByText('Add this thread to a ticket');
  };

  it('a successful add asks the host to refresh, once (the board’s card chip reads the list)', async () => {
    twoTickets();
    const onRefresh = vi.fn();
    renderHeader({ onRefresh });
    await addFromPopover();
    fireEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(svc.addThreads).toHaveBeenCalledWith(30, [1]));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('the picker does not list a ticket the thread is already on', async () => {
    twoTickets(); // on #9 and #7
    svc.getAll.mockResolvedValue({
      data: [
        { id: 9, title: 'Already on nine', status: 'open' },
        { id: 7, title: 'Already on seven', status: 'open' },
        { id: 30, title: 'Login broken', status: 'open' },
      ],
    });
    renderHeader();
    await addFromPopover();
    // CONTROL: the picker did list what came back for a ticket it is not on.
    expect(await screen.findByText('Login broken')).toBeInTheDocument();
    expect(screen.queryByText('Already on nine')).toBeNull();
    expect(screen.queryByText('Already on seven')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Add$/ })).toHaveLength(1);
  });
});
