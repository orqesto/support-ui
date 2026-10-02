/**
 * Message detail v4 — the header: the ticket chip and its Related popover — cards, Remove, Add to
 * ticket…, permissions, reads (H2). Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { perms, svc, ticket, renderHeader, twoTickets, message } from './md4.header.utils';
import { screen, fireEvent, waitFor, within, act, cleanup } from '@testing-library/react';
import type { Message } from '@/types';
import { Permission } from '@/types/roles';
import { THREAD_TICKETS_CHANGED } from '@/services/ticketThreadsEvents';
import { toast } from '@/lib/toast';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

describe('H2 — the ticket chip and its Related popover', () => {
  it('shows the first ticket’s #id and +N — no ticket bar row', async () => {
    twoTickets();
    renderHeader();
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip.textContent).toContain('#7');
    expect(chip.textContent).toContain('+1');
    expect(chip).toHaveAccessibleName('#7 +1 — linked to 2 tickets');
    expect(screen.queryByText(/✓ Ticket/)).not.toBeInTheDocument();
    expect(screen.queryByText('View')).not.toBeInTheDocument();
  });

  it('reads each ticket’s threads only when the popover opens', async () => {
    twoTickets();
    renderHeader();
    await screen.findByTestId('ticket-chip');
    expect(svc.threadsOfTicket).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ticket-chip'));
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(2));
    expect(svc.threadsOfTicket.mock.calls.map((call) => Number(call[0])).sort()).toEqual([7, 9]);
  });

  it('lists a card per ticket: id, Jira key, title, status · priority, its threads', async () => {
    twoTickets();
    svc.threadsOfTicket.mockImplementation((id: number) =>
      Promise.resolve({
        unavailable: false,
        hiddenCount: id === 9 ? 1 : 0,
        rows: [
          {
            conversationId: 1,
            publicId: 'SUP-1',
            subject: 'Hello',
            status: 'open',
            isPrimary: id === 7,
          },
          {
            conversationId: 44,
            publicId: 'SUP-44',
            subject: 'Same bug',
            status: 'pending',
            isPrimary: false,
          },
        ],
      })
    );
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    const nine = within(popover).getByTestId('related-ticket-9');
    const seven = within(popover).getByTestId('related-ticket-7');
    expect(within(nine).getByText('#9')).toBeInTheDocument();
    expect(within(nine).getByText('Jira OPS-12')).toBeInTheDocument();
    expect(within(nine).getByText('Refund export')).toBeInTheDocument();
    expect(within(nine).getByText('Resolved')).toBeInTheDocument();
    expect(within(nine).getByText('High')).toBeInTheDocument();
    expect(within(seven).queryByText(/^Jira /)).toBeNull(); // no external id → no Jira tag
    // Threads: this one marked, the other opens; the hidden one is counted, not dropped.
    expect(await within(nine).findByText('3 threads on this ticket')).toBeInTheDocument();
    expect(within(nine).getByText('This thread')).toBeInTheDocument();
    expect(within(nine).getByText(/1 in departments you cannot open/)).toBeInTheDocument();
    // A link (staging's was): Cmd/Ctrl-click and "Open in new tab" work.
    const openThread = within(nine).getByRole('link', { name: 'Open TES-SUP-44' });
    expect(openThread).toHaveAttribute('href', '/messages?id=TES-SUP-44');
    fireEvent.click(openThread);
    expect(screen.getByTestId('where').textContent).toBe('/messages?id=TES-SUP-44');
  });

  it('Open ticket goes where the bar’s View went', async () => {
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    const open = within(within(popover).getByTestId('related-ticket-9')).getByRole('link', {
      name: 'Open ticket',
    });
    expect(open).toHaveAttribute('href', '/tickets?id=9');
    fireEvent.click(open);
    expect(screen.getByTestId('where').textContent).toBe('/tickets?id=9');
  });

  it('Remove takes the thread off a ticket — never the one created from it', async () => {
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    const removes = within(popover).getAllByRole('button', { name: /^Remove from ticket #/ });
    expect(removes).toHaveLength(1);
    expect(
      within(within(popover).getByTestId('related-ticket-7')).getByText('created from this thread')
    ).toBeInTheDocument();
    fireEvent.click(removes[0]);
    await waitFor(() => expect(svc.removeThread).toHaveBeenCalledWith(9, 1));
  });

  it('a failed remove says so in the popover', async () => {
    twoTickets();
    svc.removeThread.mockRejectedValue(new Error('nope'));
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    expect(await within(popover).findByText(/nope|could not be taken off/)).toBeInTheDocument();
  });

  it('a Remove says what it kept (toast) — and a failed one does not claim it', async () => {
    twoTickets();
    const success = vi.spyOn(toast, 'success').mockImplementation(() => {});
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith(
        'Removed from ticket #9 — the ticket and this thread are both kept'
      )
    );
    cleanup();
    success.mockClear();
    svc.removeThread.mockRejectedValue(new Error('nope'));
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const again = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(again).getByRole('button', { name: /^Remove from ticket #9/ }));
    expect(await within(again).findByText(/nope|could not be taken off/)).toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();
  });

  it('Add to ticket… opens the picker, with "Create a new ticket from this thread"', async () => {
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Add to ticket…' }));
    expect(await screen.findByText('Add this thread to a ticket')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Tickets' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(svc.addThreads).toHaveBeenCalledWith(30, [1]));
  });

  it('adding to a ticket the thread is already on says so in words (toast)', async () => {
    twoTickets();
    svc.addThreads.mockResolvedValue({ added: [], alreadyAttached: [1] });
    const info = vi.spyOn(toast, 'info').mockImplementation(() => {});
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Add to ticket…' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(info).toHaveBeenCalledWith('This thread is already on ticket #30.'));
    info.mockRestore();
  });

  it('the picker words a status as the popover does: "In progress", every underscore', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 7, status: 'in_progress' })],
    });
    svc.getAll.mockResolvedValue({
      data: [
        { id: 30, title: 'Login broken', status: 'in_progress' },
        { id: 31, title: 'Slow export', status: 'waiting_on_customer' },
      ],
    });
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(
      within(within(popover).getByTestId('related-ticket-7')).getByText('In progress')
    ).toBeInTheDocument();
    fireEvent.click(within(popover).getByRole('button', { name: 'Add to ticket…' }));
    const picker = (await screen.findByText('Add this thread to a ticket')).closest(
      '[role="dialog"]'
    ) as HTMLElement;
    expect(await within(picker).findByText('In progress')).toBeInTheDocument();
    expect(within(picker).getByText('Waiting on customer')).toBeInTheDocument();
    expect(within(picker).queryByText(/in progress|_/)).toBeNull();
  });

  it('the picker’s Create row goes where staging’s New ticket went', async () => {
    renderHeader();
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Add to ticket…'));
    fireEvent.click(
      await screen.findByRole('button', { name: /Create a new ticket from this thread/ })
    );
    expect(screen.getByTestId('where').textContent).toBe('/tickets/create?messageId=1');
  });

  it('the picker’s Create row is the header’s own create: the host’s onApprove, not a route of its own', async () => {
    const onApprove = vi.fn();
    renderHeader({ onApprove });
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    fireEvent.click(within(screen.getByRole('menu')).getByText('Add to ticket…'));
    fireEvent.click(
      await screen.findByRole('button', { name: /Create a new ticket from this thread/ })
    );
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('where').textContent).toBe('/messages/1');
    expect(screen.queryByRole('button', { name: /Create a new/ })).toBeNull();
  });

  it('on a lead thread the picker’s Create row makes a LEAD ticket, as More says', async () => {
    renderHeader({ message: { ...message, isLead: true } as unknown as Message });
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).getByText('Create lead ticket')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('menu')).getByText('Add to ticket…'));
    expect(
      await screen.findByRole('button', { name: 'Create a new lead ticket from this thread' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create a new ticket from this thread' })
    ).toBeNull();
  });

  describe('Add to ticket… only once the backend is KNOWN to have ticket links', () => {
    const moreMenu = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
      return screen.getByRole('menu');
    };

    it('while the first read is in flight More does not offer it; once it answers, it does', async () => {
      let answer: (value: unknown) => void = () => {};
      svc.ticketsOfThread.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderHeader();
      const menu = await moreMenu();
      expect(within(menu).queryByText('Add to ticket…')).toBeNull();
      act(() => answer({ unavailable: false, rows: [], hiddenCount: 0 }));
      expect(await within(menu).findByText('Add to ticket…')).toBeInTheDocument();
    });

    it('a failed first read does not offer it — in More or in the chip’s popover', async () => {
      svc.ticketsOfThread.mockRejectedValue(new Error('boom'));
      renderHeader();
      fireEvent.click(await screen.findByTestId('ticket-chip'));
      const popover = await screen.findByRole('dialog', { name: 'Tickets' });
      expect(within(popover).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(within(popover).queryByRole('button', { name: 'Add to ticket…' })).toBeNull();
      fireEvent.keyDown(document, { key: 'Escape' });
      const menu = await moreMenu();
      expect(within(menu).queryByText('Add to ticket…')).toBeNull();
    });

    it('an open picker closes when a re-read finds an older backend', async () => {
      renderHeader();
      fireEvent.click(within(await moreMenu()).getByText('Add to ticket…'));
      expect(
        await screen.findByRole('button', { name: /Create a new ticket from this thread/ })
      ).toBeInTheDocument();
      svc.ticketsOfThread.mockResolvedValue({ unavailable: true, rows: [], hiddenCount: 0 });
      act(() => {
        window.dispatchEvent(
          new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
        );
      });
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: /Create a new ticket from this thread/ })
        ).toBeNull()
      );
    });
  });

  it('a failed read is not "on no ticket": the chip says it, the popover offers a retry', async () => {
    svc.ticketsOfThread.mockRejectedValue(new Error('boom'));
    renderHeader();
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip).toHaveAccessibleName('? — could not read this thread’s tickets');
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByText(/could not read this thread’s tickets/)).toBeInTheDocument();
    // The heading claims nothing it does not know.
    expect(within(popover).getByRole('heading', { name: 'Tickets' })).toBeInTheDocument();
    expect(within(popover).queryByText('Linked to ticket')).toBeNull();
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    fireEvent.click(within(popover).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByTestId('ticket-chip').textContent).toContain('#7'));
  });

  it('a RE-read that fails keeps what is on screen: the #7 card and Add to ticket… stay, no failure line', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByTestId('related-ticket-7')).toBeInTheDocument();
    svc.ticketsOfThread.mockRejectedValue(new Error('boom'));
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(within(popover).getByTestId('related-ticket-7')).toBeInTheDocument();
    expect(within(popover).getByRole('button', { name: 'Add to ticket…' })).toBeInTheDocument();
    expect(within(popover).queryByText(/could not read this thread’s tickets/)).toBeNull();
    expect(screen.getByTestId('ticket-chip').textContent).toContain('#7');
  });

  it('a ticket’s thread list that fails says so — never "only this thread"', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    svc.threadsOfTicket.mockRejectedValue(new Error('boom'));
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(
      await within(popover).findByText(/could not list the threads on this ticket/)
    ).toBeInTheDocument();
    expect(within(popover).queryByText(/threads? on this ticket$/)).toBeNull();
  });

  it('without MANAGE_TICKETS: no Remove and no Add to ticket — Open ticket and Create ticket stay', async () => {
    perms.denied.add(Permission.MANAGE_TICKETS);
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Add to ticket…' })).toBeNull();
    expect(within(popover).getAllByRole('link', { name: 'Open ticket' })).toHaveLength(2);
    // CREATE_TICKETS is enough for a new ticket — staging's "New ticket" needed nothing more.
    fireEvent.click(within(popover).getByRole('button', { name: 'Create ticket' }));
    expect(screen.getByTestId('where').textContent).toBe('/tickets/create?messageId=1');
  });

  it('with tickets: Create ticket sits beside Add to ticket… and goes to the create page', async () => {
    twoTickets();
    const onApprove = vi.fn();
    renderHeader({ onApprove });
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByRole('button', { name: 'Add to ticket…' })).toBeInTheDocument();
    fireEvent.click(within(popover).getByRole('button', { name: 'Create ticket' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('without CREATE_TICKETS: no Create ticket in the popover, the More menu or the picker', async () => {
    perms.denied.add(Permission.CREATE_TICKETS);
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).queryByRole('button', { name: 'Create ticket' })).toBeNull();
    fireEvent.click(within(popover).getByRole('button', { name: 'Add to ticket…' }));
    expect(await screen.findByText('Add this thread to a ticket')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Create a new ticket from this thread/ })
    ).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() =>
      expect(screen.queryByText('Add this thread to a ticket')).not.toBeInTheDocument()
    );
    // ⛔ The labels are sentence case ("Create ticket" / "Create lead ticket"); a Title-Case
    // matcher here matched nothing and passed whatever the menu held — hence the control below.
    const createItem = /^Create (lead )?ticket$/i;
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).queryByText(createItem)).toBeNull();
    // CONTROL: the same matcher finds the item once the permission is there.
    cleanup();
    perms.denied.delete(Permission.CREATE_TICKETS);
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).getByText(createItem)).toBeInTheDocument();
  });

  it('Remove refreshes the board (its card chip reads the thread list), as an add does', async () => {
    twoTickets();
    const onRefresh = vi.fn();
    renderHeader({ onRefresh });
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it('a failed Remove does not refresh the board', async () => {
    twoTickets();
    svc.removeThread.mockRejectedValue(new Error('nope'));
    const onRefresh = vi.fn();
    renderHeader({ onRefresh });
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    expect(await within(popover).findByText(/nope|could not be taken off/)).toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('after a Remove the other tickets keep their thread lists — no re-read', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 }), ticket({ ticketId: 7, isPrimary: true })],
    });
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(2));
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 7, isPrimary: true })],
    });
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    await waitFor(() => expect(svc.removeThread).toHaveBeenCalled());
    // What the real service announces after a remove (mocked here).
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
    await waitFor(() => expect(screen.queryByTestId('related-ticket-9')).not.toBeInTheDocument());
    expect(screen.getByTestId('related-ticket-7')).toBeInTheDocument();
    expect(svc.threadsOfTicket).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Loading the threads on this ticket…')).toBeNull();
  });

  it('a ticket that changes (ticket:updated) re-reads ITS thread list, keeping the old one on screen meanwhile', async () => {
    const { subscribeToEvent } = await import('@/lib/socketManager');
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    await screen.findByRole('dialog', { name: 'Tickets' });
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(2));
    const nine = screen.getByTestId('related-ticket-9');
    await within(nine).findByText('0 threads on this ticket');
    let resolveRead: (value: unknown) => void = () => {};
    svc.threadsOfTicket.mockReturnValueOnce(new Promise((resolve) => (resolveRead = resolve)));
    const handlers = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([event]) => event === 'ticket:updated')
      .map(([, handler]) => handler);
    act(() => {
      for (const handler of handlers) handler({ ticketId: 9 });
    });
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(3));
    expect(Number(svc.threadsOfTicket.mock.calls[2][0])).toBe(9);
    // The old list stays until the new one lands — no "Loading…" flash.
    expect(within(nine).getByText('0 threads on this ticket')).toBeInTheDocument();
    await act(async () => {
      resolveRead({
        unavailable: false,
        hiddenCount: 0,
        rows: [
          {
            conversationId: 1,
            publicId: 'SUP-1',
            subject: 'Hello',
            status: 'open',
            isPrimary: false,
          },
          {
            conversationId: 44,
            publicId: 'SUP-44',
            subject: 'Same bug',
            status: 'open',
            isPrimary: false,
          },
        ],
      });
      await Promise.resolve();
    });
    expect(await within(nine).findByText('2 threads on this ticket')).toBeInTheDocument();
  });

  it('thread lists are read for the first 5 tickets only; the rest say to open the ticket', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [21, 22, 23, 24, 25, 26].map((id) => ticket({ ticketId: id })),
    });
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    await screen.findByRole('dialog', { name: 'Tickets' });
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(5));
    expect(svc.threadsOfTicket.mock.calls.map((call) => Number(call[0]))).not.toContain(26);
    const sixth = screen.getByTestId('related-ticket-26');
    expect(
      within(sixth).getByText('Open the ticket to see the threads on it.')
    ).toBeInTheDocument();
    expect(within(sixth).getByRole('link', { name: 'Open ticket' })).toBeInTheDocument();
    expect(
      within(screen.getByTestId('related-ticket-25')).queryByText(
        'Open the ticket to see the threads on it.'
      )
    ).toBeNull();
  });

  it('the card names a ticket by #id — as the ticket list, board and ticket page do — even when it has a publicId', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9, publicId: 'SUP-1' })],
    });
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const card = within(await screen.findByRole('dialog', { name: 'Tickets' })).getByTestId(
      'related-ticket-9'
    );
    expect(within(card).getByText('#9')).toBeInTheDocument();
  });

  it('removing the last ticket closes the popover — it does not reopen when a ticket comes back', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 })],
    });
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    await screen.findByRole('dialog', { name: 'Tickets' });
    // Off its only ticket: the chip and its popover go.
    svc.ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 0, rows: [] });
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
    await waitFor(() => expect(screen.queryByTestId('ticket-chip')).not.toBeInTheDocument());
    // Added to a ticket again: the chip is back, closed.
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 11 })],
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
    await waitFor(() => expect(screen.getByTestId('ticket-chip').textContent).toContain('#11'));
    expect(screen.queryByRole('dialog', { name: 'Tickets' })).not.toBeInTheDocument();
  });

  it('an older backend: the one ticket it names, with Open ticket and nothing that would 404', async () => {
    svc.ticketsOfThread.mockResolvedValue({ unavailable: true });
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(within(popover).queryByRole('button', { name: 'Add to ticket…' })).toBeNull();
    // Creating a ticket needs only POST /api/tickets, which every backend has.
    expect(within(popover).getByRole('button', { name: 'Create ticket' })).toBeInTheDocument();
    const open = within(popover).getByRole('link', { name: 'Open ticket' });
    expect(open).toHaveAttribute('href', '/tickets?id=5');
    fireEvent.click(open);
    expect(screen.getByTestId('where').textContent).toBe('/tickets?id=5');
  });
});
