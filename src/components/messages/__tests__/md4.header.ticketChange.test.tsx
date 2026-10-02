/**
 * Message detail v4 — the header after a ticket change the server CONFIRMED: the chip and the
 * Related popover show it at once, and a re-read that then fails keeps that, never the state the
 * server just contradicted. Also: refreshes that fail keep what is shown, and the chip's tooltip
 * on an owed ticket. Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { svc, ticket, renderHeader, twoTickets, message } from './md4.header.utils';
import { screen, fireEvent, waitFor, within, act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { Message } from '@/types';
import { announceThreadTicketsChanged } from '@/services/ticketThreadsEvents';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { withTicketChange } from '../useThreadTicketsState';
import type { HeaderTickets } from '../RelatedPopover';
import type { ThreadTicket } from '@/services/ticketThreads.service';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

const tick = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** Fire `ticket:updated` the way the socket would, to every handler subscribed to it. */
const ticketUpdated = async (ticketId: number) => {
  const { subscribeToEvent } = await import('@/lib/socketManager');
  const handlers = vi
    .mocked(subscribeToEvent)
    .mock.calls.filter(([event]) => event === 'ticket:updated')
    .map(([, handler]) => handler);
  act(() => {
    for (const handler of handlers) handler({ ticketId });
  });
};

/** As the real service does: announce after the request succeeded — and the re-read fails. */
const confirmThenFailReads = () => {
  svc.removeThread.mockImplementation((_ticketId: number, conversationId: number) => {
    svc.ticketsOfThread.mockRejectedValue(new Error('network'));
    announceThreadTicketsChanged([conversationId]);
    return Promise.resolve(true);
  });
  svc.addThreads.mockImplementation((_ticketId: number, conversationIds: number[]) => {
    svc.ticketsOfThread.mockRejectedValue(new Error('network'));
    announceThreadTicketsChanged(conversationIds);
    return Promise.resolve({ added: conversationIds, alreadyAttached: [] });
  });
};

const openTickets = async () => {
  fireEvent.click(await screen.findByTestId('ticket-chip'));
  return screen.findByRole('dialog', { name: 'Tickets' });
};

const addFromMore = async (title: RegExp | string) => {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(await screen.findByText('Add to ticket…'));
  const option = (await screen.findByText(title)).closest('li') as HTMLElement;
  fireEvent.click(within(option).getByRole('button', { name: 'Add' }));
};

describe('a confirmed Remove / Add, then a re-read that fails', () => {
  it('Remove: the removed ticket goes from the popover and the chip at once', async () => {
    twoTickets();
    confirmThenFailReads();
    renderHeader();
    const popover = await openTickets();
    await waitFor(() => expect(screen.getByTestId('ticket-chip').textContent).toContain('+1'));
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    await waitFor(() => expect(svc.removeThread).toHaveBeenCalledWith(9, 1));
    await waitFor(() => expect(screen.queryByTestId('related-ticket-9')).toBeNull());
    await tick(30); // the failed re-read has landed
    expect(svc.ticketsOfThread.mock.calls.length).toBeGreaterThan(1);
    expect(screen.queryByTestId('related-ticket-9')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove from ticket #9/ })).toBeNull();
    const chip = screen.getByTestId('ticket-chip');
    expect(chip.textContent).toContain('#7');
    expect(chip.textContent).not.toContain('+1');
  });

  it('Add: the thread reads as on the added ticket — not "on no ticket"', async () => {
    confirmThenFailReads();
    renderHeader();
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalled());
    await tick(10);
    expect(screen.queryByTestId('ticket-chip')).toBeNull();
    await addFromMore('Login broken');
    await waitFor(() => expect(svc.addThreads).toHaveBeenCalledWith(30, [1]));
    await tick(30);
    expect(svc.ticketsOfThread.mock.calls.length).toBeGreaterThan(1);
    expect((await screen.findByTestId('ticket-chip')).textContent).toContain('#30');
    const popover = await openTickets();
    expect(within(popover).getByText('Login broken')).toBeInTheDocument();
  });

  it('a removed ticket added back shows again', async () => {
    twoTickets();
    confirmThenFailReads();
    svc.getAll.mockResolvedValue({ data: [{ id: 9, title: 'Refund export', status: 'resolved' }] });
    renderHeader();
    const popover = await openTickets();
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    await waitFor(() => expect(screen.queryByTestId('related-ticket-9')).toBeNull());
    fireEvent.keyDown(document, { key: 'Escape' });
    await addFromMore('Refund export');
    await waitFor(() => expect(svc.addThreads).toHaveBeenCalledWith(9, [1]));
    await tick(30);
    expect(screen.getByTestId('ticket-chip').textContent).toContain('+1');
  });

  it('the re-read the add announced is not disowned: when it lands, the server’s list wins', async () => {
    let land: (value: unknown) => void = () => {};
    svc.addThreads.mockImplementation((_ticketId: number, conversationIds: number[]) => {
      svc.ticketsOfThread.mockReturnValueOnce(new Promise((resolve) => (land = resolve)));
      announceThreadTicketsChanged(conversationIds);
      return Promise.resolve({ added: conversationIds, alreadyAttached: [] });
    });
    renderHeader();
    await tick(10);
    await addFromMore('Login broken');
    expect((await screen.findByTestId('ticket-chip')).textContent).toContain('#30');
    await act(async () => {
      land({
        unavailable: false,
        hiddenCount: 0,
        rows: [ticket({ ticketId: 30, title: 'Login broken for SSO users' })],
      });
      await Promise.resolve();
    });
    const popover = await openTickets();
    expect(await within(popover).findByText('Login broken for SSO users')).toBeInTheDocument();
  });

  it('a re-read that later SUCCEEDS replaces the shown change with the server’s list', async () => {
    confirmThenFailReads();
    renderHeader();
    await tick(10);
    await addFromMore('Login broken');
    await waitFor(() => expect(svc.addThreads).toHaveBeenCalled());
    await tick(30);
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 30, title: 'Login broken for SSO users', externalId: 'OPS-9' })],
    });
    await ticketUpdated(30);
    const popover = await openTickets();
    expect(await within(popover).findByText('Login broken for SSO users')).toBeInTheDocument();
    expect(within(popover).getByText('Jira OPS-9')).toBeInTheDocument();
  });

  it('a Remove confirmed after a thread switch does not touch the thread now shown', async () => {
    const other = { ...message, id: 2, publicId: 'SUP-2' } as Message;
    const tree = (msg: Message) => (
      <ThemeProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <MessageDetailHeader
              message={msg}
              showFullPageButton={false}
              isFullPage
              threadCount={1}
            />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
    twoTickets();
    let confirm: (value: boolean) => void = () => {};
    svc.removeThread.mockReturnValue(new Promise((resolve) => (confirm = resolve)));
    const view = render(tree(message));
    const popover = await openTickets();
    fireEvent.click(within(popover).getByRole('button', { name: /^Remove from ticket #9/ }));
    view.rerender(tree(other)); // thread 2 is on #9 too
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.getByTestId('ticket-chip').textContent).toContain('+1'));
    await act(async () => {
      confirm(true);
      await Promise.resolve();
    });
    await tick(10);
    expect(screen.getByTestId('ticket-chip').textContent).toContain('+1');
  });
});

describe('withTicketChange', () => {
  const nine = ticket({ ticketId: 9 }) as ThreadTicket;
  const seven = ticket({ ticketId: 7 }) as ThreadTicket;
  const ready: HeaderTickets = { state: 'ready', rows: [seven], hiddenCount: 1, legacy: null };

  it('adds the joined ticket first, removes the left one; hidden tickets still count', () => {
    const added = withTicketChange(ready, { conversationId: 1, added: nine });
    expect(added.rows.map((row) => row.ticketId)).toEqual([9, 7]);
    expect(added.hiddenCount).toBe(1);
    const removed = withTicketChange(added, { conversationId: 1, removed: 9 });
    expect(removed.rows.map((row) => row.ticketId)).toEqual([7]);
  });

  it('a list that already carries the change is left as the server sent it', () => {
    const server = { ...seven, title: 'Server title' };
    const fromServer: HeaderTickets = { ...ready, rows: [server] };
    expect(withTicketChange(fromServer, { conversationId: 1, added: seven })).toBe(fromServer);
    expect(withTicketChange(ready, { conversationId: 1, removed: 9 })).toBe(ready);
  });

  it.each(['loading', 'failed', 'unavailable'] as const)(
    'a list that was not read (%s) is not patched into one',
    (state) => {
      const unread: HeaderTickets = { state, rows: [], hiddenCount: 0, legacy: null };
      expect(withTicketChange(unread, { conversationId: 1, added: nine })).toBe(unread);
    }
  );
});

describe('refreshes that fail keep what is shown', () => {
  it('CONTROL: a background re-read of the tickets that fails keeps both tickets', async () => {
    twoTickets();
    renderHeader();
    await waitFor(() => expect(screen.getByTestId('ticket-chip').textContent).toContain('+1'));
    svc.ticketsOfThread.mockRejectedValue(new Error('network'));
    await ticketUpdated(9);
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalledTimes(2));
    await tick(10);
    const chip = screen.getByTestId('ticket-chip');
    expect(chip.textContent).toContain('#7');
    expect(chip.textContent).toContain('+1');
  });

  it('a ticket’s thread list whose re-read fails keeps its rows — no "could not list"', async () => {
    twoTickets();
    svc.threadsOfTicket.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [{ conversationId: 44, publicId: 'SUP-44', subject: 'Same bug', status: 'open' }],
    });
    renderHeader();
    await openTickets();
    const nine = screen.getByTestId('related-ticket-9');
    expect(await within(nine).findByText('Same bug')).toBeInTheDocument();
    svc.threadsOfTicket.mockRejectedValue(new Error('network'));
    await ticketUpdated(9);
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(3));
    await tick(10);
    expect(within(nine).getByText('Same bug')).toBeInTheDocument();
    expect(within(nine).queryByText(/could not list the threads/)).toBeNull();
  });
});

describe('the ticket chip’s tooltip', () => {
  it('on an owed ticket it says what is owed, not only "Linked to 2 tickets"', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9, status: 'resolved', owesReply: true }), ticket({ ticketId: 7 })],
    });
    renderHeader();
    const chip = await screen.findByTestId('ticket-chip');
    await waitFor(() => expect(screen.getByTestId('owes-reply-dot')).toBeInTheDocument());
    fireEvent.focus(chip);
    await tick(250); // past the tooltip's 200ms delay
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Ticket #9 is fixed — reply to tell this customer.'
    );
    fireEvent.blur(chip);
  });
});
