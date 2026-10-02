import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';

/**
 * The thread header's ticket signal: a thread can be on several
 * tickets, and a fixed incident owes THIS customer a reply until an agent sends one.
 *
 * v4 replaced the ticket BAR row with a ticket CHIP in the chip row (first ticket's #id, "+N")
 * that opens the Related popover — one card per ticket. The owes-reply prompt moved with it: the
 * chip carries a warning dot and the sentence in its name, the popover shows it on the card.
 */
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: true,
    isOrgAdmin: true,
    canManage: true,
    hasPermission: () => true,
  }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [], departments: [] }),
  useDepartmentById: () => undefined,
}));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));
const { getLinkedTicket, ticketsOfThread, threadsOfTicket } = vi.hoisted(() => ({
  getLinkedTicket: vi.fn(),
  ticketsOfThread: vi.fn(),
  threadsOfTicket: vi.fn(),
}));
vi.mock('@/services/message.service', () => ({
  messageService: new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'getLinkedTicket'
          ? getLinkedTicket
          : () => Promise.resolve({ success: true, data: [] }),
    }
  ),
}));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { ticketsOfThread, threadsOfTicket },
}));
vi.mock('@/services/category.service', () => ({
  categoryService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
vi.mock('@/services/settings.service', () => ({
  labelService: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}));
// Child components fetch through the api-client; keep every request inside the test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));
vi.mock('@/lib/socketManager', () => ({
  subscribeToEvent: vi.fn(),
  unsubscribeFromEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { MessageDetailHeader } from '../MessageDetailHeader';
import { THREAD_TICKETS_CHANGED } from '@/services/ticketThreadsEvents';
import { ThemeProvider } from '@/contexts/ThemeContext';

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  getLinkedTicket.mockResolvedValue({ success: true, data: null });
  threadsOfTicket.mockResolvedValue({ unavailable: false, rows: [], hiddenCount: 0 });
});

/** The ticket chip once it names a ticket. */
const chip = () => screen.findByTestId('ticket-chip');
/** Open the Related popover from the chip. */
const openPopover = async () => {
  fireEvent.click(await chip());
  return screen.findByRole('dialog', { name: 'Tickets' });
};

const message = {
  id: 1,
  publicId: 'SUP-1',
  status: 'open',
  channel: 'email',
  sender: 'customer@example.com',
  subject: 'Hello',
  createdAt: '2026-09-27T10:00:00Z',
  metadata: { analysis: { category: 'other' } },
} as unknown as Message;

const renderHeader = (msg: Message = message) =>
  render(
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

const row = (over: Record<string, unknown>) => ({
  ticketId: 4,
  publicId: null,
  title: 't',
  status: 'open',
  priority: 'medium',
  issueType: 'bug',
  externalId: null,
  isPrimary: false,
  resolvedAt: null,
  owesReply: false,
  ...over,
});

describe('ticket chip (was the ticket bar)', () => {
  it('names the newest OPEN ticket, counts the rest, and prompts for the fixed one', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      // newest first, as the backend sends them
      rows: [
        row({ ticketId: 9, status: 'resolved', owesReply: true }),
        row({ ticketId: 7, status: 'in_progress' }),
      ],
    });
    renderHeader();
    await waitFor(async () => expect((await chip()).textContent).toContain('#7'));
    expect((await chip()).textContent).toContain('+1');
    expect(screen.queryByText(/✓ Ticket #/)).not.toBeInTheDocument(); // the bar row is gone
    // The prompt: a dot and the sentence on the chip, the sentence on #9's card in the popover.
    expect(screen.getByTestId('owes-reply-dot')).toBeInTheDocument();
    expect(await chip()).toHaveAccessibleName(
      '#7 +1 — linked to 2 tickets. Ticket #9 is fixed — reply to tell this customer.'
    );
    const popover = await openPopover();
    expect(
      within(within(popover).getByTestId('related-ticket-9')).getByText(
        'Ticket #9 is fixed — reply to tell this customer.'
      )
    ).toBeInTheDocument();
    expect(
      within(within(popover).getByTestId('related-ticket-7')).queryByText(/is fixed/)
    ).toBeNull();
  });

  it('no prompt when the fix is unknown (owesReply null) or already told (false)', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [
        row({ ticketId: 9, status: 'closed', owesReply: null }),
        row({ ticketId: 7, status: 'resolved' }),
      ],
    });
    renderHeader();
    await waitFor(async () => expect((await chip()).textContent).toContain('#9'));
    expect(screen.queryByTestId('owes-reply-dot')).not.toBeInTheDocument();
    const popover = await openPopover();
    expect(within(popover).queryByText(/reply to tell this customer/)).not.toBeInTheDocument();
  });

  it('an older backend: the one ticket its old route names', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: true });
    getLinkedTicket.mockResolvedValue({ success: true, data: { id: 5, status: 'open' } });
    renderHeader();
    await waitFor(async () => expect((await chip()).textContent).toContain('#5'));
    expect((await chip()).textContent).not.toContain('+');
    expect(await chip()).toHaveAccessibleName('#5 — linked to ticket #5');
  });

  it('no chip when the thread is on no ticket', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 0, rows: [] });
    renderHeader();
    await vi.waitFor(() => expect(ticketsOfThread).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('ticket-chip')).not.toBeInTheDocument();
  });

  it('reloads when an add or remove anywhere announces THIS thread’s tickets changed — and only this thread’s', async () => {
    ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 0, rows: [] });
    renderHeader();
    await vi.waitFor(() => expect(ticketsOfThread).toHaveBeenCalledTimes(1));
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9 })],
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [2] } })
      );
    });
    expect(ticketsOfThread).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
    await waitFor(async () => expect((await chip()).textContent).toContain('#9'));
  });

  const announce = () =>
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });

  it('overlapping reloads: an OLDER answer landing last does not overwrite the newer one', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'in_progress' })],
    });
    renderHeader();
    await waitFor(async () => expect((await chip()).textContent).toContain('#9'));
    const answers: Array<(value: unknown) => void> = [];
    ticketsOfThread.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    announce(); // e.g. the ticket was resolved…
    announce(); // …and reopened
    expect(answers).toHaveLength(2);
    act(() =>
      answers[1]({
        unavailable: false,
        hiddenCount: 0,
        rows: [row({ ticketId: 9, status: 'open', owesReply: false })],
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // CONTROL for the absence below: the newer answer has been applied (no dot, plain name).
    expect(await chip()).toHaveAccessibleName('#9 — linked to ticket #9');
    await act(async () => {
      answers[0]({
        unavailable: false,
        hiddenCount: 0,
        rows: [row({ ticketId: 9, status: 'resolved', owesReply: true })],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByTestId('owes-reply-dot')).not.toBeInTheDocument();
    expect(await chip()).toHaveAccessibleName('#9 — linked to ticket #9');
  });

  it('a reload that replaced the first read and FAILED says so — the first read landing late does not paper over it', async () => {
    let first: (value: unknown) => void = () => {};
    ticketsOfThread.mockReturnValueOnce(new Promise((resolve) => (first = resolve)));
    renderHeader();
    await vi.waitFor(() => expect(ticketsOfThread).toHaveBeenCalledTimes(1));
    ticketsOfThread.mockRejectedValueOnce(new Error('boom'));
    announce();
    await waitFor(async () => expect((await chip()).textContent).toBe('?'));
    await act(async () => {
      first({ unavailable: false, hiddenCount: 0, rows: [row({ ticketId: 4 })] });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect((await chip()).textContent).toBe('?');
    expect(await chip()).toHaveAccessibleName('? — could not read this thread’s tickets');
  });

  it('an OLDER read failing while a newer one runs does not flash "could not read"', async () => {
    let failFirst: (reason: unknown) => void = () => {};
    let answerSecond: (value: unknown) => void = () => {};
    ticketsOfThread
      .mockReturnValueOnce(new Promise((_resolve, reject) => (failFirst = reject)))
      .mockReturnValueOnce(new Promise((resolve) => (answerSecond = resolve)));
    renderHeader();
    await vi.waitFor(() => expect(ticketsOfThread).toHaveBeenCalledTimes(1));
    announce();
    expect(ticketsOfThread).toHaveBeenCalledTimes(2);
    await act(async () => {
      failFirst(new Error('boom'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByTestId('ticket-chip')).not.toBeInTheDocument();
    act(() => answerSecond({ unavailable: false, hiddenCount: 0, rows: [row({ ticketId: 9 })] }));
    // CONTROL: the chip does render here once the newer read lands.
    await waitFor(async () => expect((await chip()).textContent).toContain('#9'));
  });

  it('D2: the prompt shows on a RESOLVED thread too — resolved is not "told"', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'resolved', owesReply: true })],
    });
    renderHeader({ ...message, status: 'resolved' } as Message);
    await waitFor(async () =>
      expect(await chip()).toHaveAccessibleName(
        '#9 — linked to ticket #9. Ticket #9 is fixed — reply to tell this customer.'
      )
    );
    const popover = await openPopover();
    expect(
      within(popover).getByText('Ticket #9 is fixed — reply to tell this customer.')
    ).toBeInTheDocument();
  });

  it('names EVERY ticket still owing this customer a reply', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [
        row({ ticketId: 9, status: 'resolved', owesReply: true }),
        row({ ticketId: 4, status: 'closed', owesReply: true }),
      ],
    });
    renderHeader();
    await waitFor(async () =>
      expect(await chip()).toHaveAccessibleName(
        '#9 +1 — linked to 2 tickets. Tickets #9, #4 are fixed — reply to tell this customer.'
      )
    );
    const popover = await openPopover();
    expect(
      within(popover).getByText('Ticket #9 is fixed — reply to tell this customer.')
    ).toBeInTheDocument();
    expect(
      within(popover).getByText('Ticket #4 is fixed — reply to tell this customer.')
    ).toBeInTheDocument();
  });

  it('reloads when one of its tickets changes (socket), not for another ticket', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 7, status: 'open' })],
    });
    renderHeader();
    await waitFor(async () => expect((await chip()).textContent).toContain('#7'));
    const { subscribeToEvent } = await import('@/lib/socketManager');
    const handler = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'ticket:updated')
      .at(-1)?.[1] as ((data: unknown) => void) | undefined;
    expect(handler).toBeDefined();
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 7, status: 'in_progress' })],
    });
    act(() => handler?.({ ticketId: 99 }));
    expect(ticketsOfThread).toHaveBeenCalledTimes(1);
    act(() => handler?.({ ticketId: 7 }));
    await vi.waitFor(() => expect(ticketsOfThread).toHaveBeenCalledTimes(2));
    const popover = await openPopover();
    expect(await within(popover).findByText(/In progress/)).toBeInTheDocument();
  });

  it('D2: the "fixed" prompt goes once an agent replies on THIS thread — another thread’s reply leaves it', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'resolved', owesReply: true })],
    });
    renderHeader();
    expect(await screen.findByTestId('owes-reply-dot')).toBeInTheDocument();
    const { subscribeToEvent } = await import('@/lib/socketManager');
    const replied = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'message:replied')
      .at(-1)?.[1] as ((data: unknown) => void) | undefined;
    expect(replied).toBeDefined();
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'resolved', owesReply: false })],
    });
    act(() => replied?.({ messageId: 2 }));
    expect(ticketsOfThread).toHaveBeenCalledTimes(1);
    act(() => replied?.({ messageId: message.id }));
    await waitFor(() => expect(screen.queryByTestId('owes-reply-dot')).not.toBeInTheDocument());
    expect(await chip()).toHaveAccessibleName('#9 — linked to ticket #9');
  });
  it('D2: a reply that failed to send brings the prompt back', async () => {
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'resolved', owesReply: false })],
    });
    renderHeader();
    await waitFor(async () => expect((await chip()).textContent).toContain('#9'));
    const { subscribeToEvent } = await import('@/lib/socketManager');
    const failed = vi
      .mocked(subscribeToEvent)
      .mock.calls.filter(([name]) => name === 'send-failed')
      .at(-1)?.[1] as ((data: unknown) => void) | undefined;
    expect(failed).toBeDefined();
    ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [row({ ticketId: 9, status: 'resolved', owesReply: true })],
    });
    act(() => failed?.({ messageId: message.id }));
    expect(await screen.findByTestId('owes-reply-dot')).toBeInTheDocument();
    const popover = await openPopover();
    expect(
      within(popover).getByText('Ticket #9 is fixed — reply to tell this customer.')
    ).toBeInTheDocument();
  });
});
