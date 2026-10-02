/**
 * Message detail v4 — the header: the ticket chip and its Related popover — placement, rejoins,
 * closing, hidden tickets (H2). Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi } from 'vitest';
import { svc, message, ticket, renderHeader, setPhone, twoTickets } from './md4.header.utils';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message } from '@/types';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { THREAD_TICKETS_CHANGED } from '@/services/ticketThreadsEvents';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

describe('H2 — the ticket chip and its Related popover', () => {
  it('popoverShift: moves left just enough to fit, never past the left edge', async () => {
    const { popoverShift } = await import('../RelatedPopover');
    // 640px slide-over, chip ~280px in: 380px popover would end at 660.
    expect(popoverShift({ left: 280, right: 660 }, { left: 0, right: 640 })).toBe(-28);
    expect(popoverShift({ left: 20, right: 400 }, { left: 0, right: 640 })).toBe(0);
    // Narrower than the popover: the start stays readable (left edge + gutter).
    expect(popoverShift({ left: 100, right: 480 }, { left: 50, right: 300 })).toBe(-42);
  });

  /** Opens the ticket popover inside a 640px overflow-hidden slide-over, chip ~280px in. */
  const popoverInSlideOver = async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    const box = (left: number, right: number) =>
      ({
        left,
        right,
        top: 0,
        bottom: 0,
        width: right - left,
        height: 0,
        x: left,
        y: 0,
      }) as DOMRect;
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'slide-over') return box(0, 640);
        if (this.getAttribute('role') === 'dialog') return box(280, 660);
        return box(0, 0);
      });
    try {
      render(
        <ThemeProvider>
          <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
              <div data-testid="slide-over" style={{ overflowX: 'hidden' }}>
                <MessageDetailHeader
                  message={message}
                  showFullPageButton={false}
                  isFullPage
                  threadCount={1}
                />
              </div>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      );
      fireEvent.click(await screen.findByTestId('ticket-chip'));
      return await screen.findByRole('dialog', { name: 'Tickets' });
    } finally {
      rects.mockRestore();
    }
  };

  it('desktop: a popover that would cross the slide-over’s right edge is moved inside it', async () => {
    setPhone(false);
    expect((await popoverInSlideOver()).style.left).toBe('-28px');
  });

  it('phones: the bottom sheet is never shifted, in the same spot that shifts on desktop', async () => {
    setPhone(true);
    expect((await popoverInSlideOver()).style.left).toBe('');
  });

  it('a ticket the thread left and rejoined has its thread list read again', async () => {
    const one = {
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 7, isPrimary: true }), ticket({ ticketId: 9 })],
    };
    svc.ticketsOfThread.mockResolvedValue(one);
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    await screen.findByRole('dialog', { name: 'Tickets' });
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(2));
    const announce = () =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
        );
      });
    svc.ticketsOfThread.mockResolvedValue({ ...one, rows: [one.rows[0]] });
    announce();
    await waitFor(() => expect(screen.queryByTestId('related-ticket-9')).not.toBeInTheDocument());
    svc.ticketsOfThread.mockResolvedValue(one);
    announce();
    await screen.findByTestId('related-ticket-9');
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(3));
    expect(Number(svc.threadsOfTicket.mock.calls[2][0])).toBe(9);
  });

  it('a ticket that left and came back drops its old list: a failed re-read says it failed', async () => {
    const one = {
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 7, isPrimary: true }), ticket({ ticketId: 9 })],
    };
    svc.ticketsOfThread.mockResolvedValue(one);
    svc.threadsOfTicket.mockImplementation((id: number) =>
      Promise.resolve({
        unavailable: false,
        hiddenCount: 0,
        rows: [
          { conversationId: 1, publicId: 'SUP-1', subject: 'Hello', status: 'open' },
          {
            conversationId: 40 + id,
            publicId: null,
            subject: `Before leaving ${id}`,
            status: 'open',
          },
        ],
      })
    );
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(await within(popover).findByText('Before leaving 9')).toBeInTheDocument();
    const announce = () =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
        );
      });
    svc.ticketsOfThread.mockResolvedValue({ ...one, rows: [one.rows[0]] });
    announce();
    await waitFor(() => expect(screen.queryByTestId('related-ticket-9')).not.toBeInTheDocument());
    // Back on ticket 9 — and its list cannot be read now.
    svc.threadsOfTicket.mockRejectedValue(new Error('boom'));
    svc.ticketsOfThread.mockResolvedValue(one);
    announce();
    const card = await screen.findByTestId('related-ticket-9');
    expect(
      await within(card).findByText(/could not list the threads on this ticket/)
    ).toBeInTheDocument();
    expect(within(card).queryByText('Before leaving 9')).toBeNull();
  });

  it('a read still in flight when its ticket is left cannot bring the old list back', async () => {
    const one = {
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 7, isPrimary: true }), ticket({ ticketId: 9 })],
    };
    svc.ticketsOfThread.mockResolvedValue(one);
    let finishOld: (value: unknown) => void = () => {};
    svc.threadsOfTicket.mockImplementation((id: number) =>
      id === 9
        ? new Promise((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve({ unavailable: false, hiddenCount: 0, rows: [] })
    );
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    await screen.findByRole('dialog', { name: 'Tickets' });
    await waitFor(() => expect(svc.threadsOfTicket).toHaveBeenCalledTimes(2));
    const announce = () =>
      act(() => {
        window.dispatchEvent(
          new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
        );
      });
    svc.ticketsOfThread.mockResolvedValue({ ...one, rows: [one.rows[0]] });
    announce();
    await waitFor(() => expect(screen.queryByTestId('related-ticket-9')).not.toBeInTheDocument());
    // The read from before it left lands now.
    await act(async () => {
      finishOld({
        unavailable: false,
        hiddenCount: 0,
        rows: [{ conversationId: 49, publicId: null, subject: 'Before leaving 9', status: 'open' }],
      });
      // Let the late read's .then run inside act.
      await Promise.resolve();
    });
    svc.threadsOfTicket.mockRejectedValue(new Error('boom'));
    svc.ticketsOfThread.mockResolvedValue(one);
    announce();
    const card = await screen.findByTestId('related-ticket-9');
    expect(
      await within(card).findByText(/could not list the threads on this ticket/)
    ).toBeInTheDocument();
    expect(within(card).queryByText('Before leaving 9')).toBeNull();
  });

  it('a lead thread: the popover offers "Create lead ticket", worded as the More menu is', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    renderHeader({ message: { ...message, isLead: true } as Message });
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByRole('button', { name: 'Create lead ticket' })).toBeInTheDocument();
    expect(within(popover).queryByRole('button', { name: 'Create ticket' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(within(screen.getByRole('menu')).getByText('Create lead ticket')).toBeInTheDocument();
  });

  it('desktop: the popover is measured again when the window resizes', async () => {
    setPhone(false);
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    const room = { right: 640 };
    const box = (left: number, right: number) =>
      ({
        left,
        right,
        top: 0,
        bottom: 0,
        width: right - left,
        height: 0,
        x: left,
        y: 0,
      }) as DOMRect;
    const rects = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.testid === 'slide-over') return box(0, room.right);
        if (this.getAttribute('role') === 'dialog') {
          // Where it is drawn: 280–660 unshifted, moved by its own `left`.
          const moved = Number.parseFloat(this.style.left || '0');
          return box(280 + moved, 660 + moved);
        }
        return box(0, 0);
      });
    try {
      render(
        <ThemeProvider>
          <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
              <div data-testid="slide-over" style={{ overflowX: 'hidden' }}>
                <MessageDetailHeader
                  message={message}
                  showFullPageButton={false}
                  isFullPage
                  threadCount={1}
                />
              </div>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      );
      fireEvent.click(await screen.findByTestId('ticket-chip'));
      const popover = await screen.findByRole('dialog', { name: 'Tickets' });
      expect(popover.style.left).toBe('-28px');
      // The window narrows: the panel that clips it is 600px now.
      room.right = 600;
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(popover.style.left).toBe('-68px');
    } finally {
      rects.mockRestore();
    }
  });

  it('a click elsewhere closes the popover — even when the page sits in a non-modal dialog (the rail)', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    render(
      <ThemeProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <div role="dialog" aria-label="Rail">
              <MessageDetailHeader
                message={message}
                showFullPageButton={false}
                isFullPage
                threadCount={1}
              />
            </div>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    await screen.findByRole('dialog', { name: 'Tickets' });
    fireEvent.mouseDown(screen.getByText('Hello'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Tickets' })).not.toBeInTheDocument()
    );
  });

  it('a second press on the chip closes the popover it opened', async () => {
    twoTickets();
    renderHeader();
    const chip = await screen.findByTestId('ticket-chip');
    fireEvent.click(chip);
    await screen.findByRole('dialog', { name: 'Tickets' });
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(chip);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Tickets' })).not.toBeInTheDocument()
    );
    expect(chip.getAttribute('aria-expanded')).toBe('false');
  });

  it('two visible tickets: the popover heading counts them', async () => {
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByRole('heading', { name: 'On 2 tickets' })).toBeInTheDocument();
  });

  it('1 visible + 2 hidden: the chip says #7 +2, the name and the heading count all three', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 2,
      rows: [ticket({})],
    });
    renderHeader();
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip.textContent).toContain('#7');
    expect(chip.textContent).toContain('+2');
    expect(chip).toHaveAccessibleName(
      '#7 +2 — linked to 3 tickets (2 in departments you cannot open)'
    );
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByRole('heading', { name: 'On 3 tickets' })).toBeInTheDocument();
    expect(
      within(popover).getByText(/\+ 2 tickets in departments you cannot open/)
    ).toBeInTheDocument();
  });

  it('1 visible, none hidden: "#7", no +N, "Linked to ticket #7" and a "Linked to ticket" heading', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({})],
    });
    renderHeader();
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip.textContent).not.toContain('+');
    expect(chip).toHaveAccessibleName('#7 — linked to ticket #7');
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByRole('heading', { name: 'Linked to ticket' })).toBeInTheDocument();
  });

  it('every ticket hidden: the chip says "2 hidden" (no +N), the heading claims only "Tickets"', async () => {
    svc.ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 2, rows: [] });
    renderHeader();
    const chip = await screen.findByTestId('ticket-chip');
    expect(chip.textContent).toContain('2 hidden');
    expect(chip.textContent).not.toContain('+');
    expect(chip).toHaveAccessibleName('2 hidden — on 2 tickets in departments you cannot open');
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Tickets' });
    expect(within(popover).getByRole('heading', { name: 'Tickets' })).toBeInTheDocument();
    expect(
      within(popover).getByText(/\+ 2 tickets in departments you cannot open/)
    ).toBeInTheDocument();
  });

  it('Esc closes the popover', async () => {
    twoTickets();
    renderHeader();
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    await screen.findByRole('dialog', { name: 'Tickets' });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Tickets' })).not.toBeInTheDocument()
    );
  });
});
