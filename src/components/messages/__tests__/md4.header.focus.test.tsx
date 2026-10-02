/**
 * Message detail v4 — the header: focus goes back to what opened a popover, a picker or More.
 * Shared mocks and render helpers: md4.header.utils.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { svc, message, ticket, renderHeader } from './md4.header.utils';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageDetailHeader } from '../MessageDetailHeader';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { THREAD_TICKETS_CHANGED } from '@/services/ticketThreadsEvents';
import { useState } from 'react';
import { DeleteMessageDialog } from '../DeleteMessageDialog';

// In each test file, not the shared utils: the apiClient path scanner
// (servicePathsCarryApiPrefix.test.ts) reads every module that is not itself a test.
vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

describe('Focus — a popover, a picker or More hands focus back to what opened it', () => {
  const twoTickets = () =>
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 }), ticket({ ticketId: 7, isPrimary: true })],
    });
  const merged = { id: 50, publicId: 'SUP-50', subject: 'Old', mergedAt: null, mergedBy: null };
  const esc = () =>
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
  const openTickets = async () => {
    const chip = await screen.findByTestId('ticket-chip');
    fireEvent.click(chip);
    return { chip, popover: await screen.findByRole('dialog', { name: 'Tickets' }) };
  };

  it('opening the popover moves focus INTO it (the dialog itself)', async () => {
    twoTickets();
    renderHeader();
    const { popover } = await openTickets();
    expect(document.activeElement).toBe(popover);
  });

  it('a re-render of the open popover does not pull focus back from inside it', async () => {
    twoTickets();
    renderHeader();
    const { popover } = await openTickets();
    const remove = within(popover).getByRole('button', { name: /^Remove from ticket #9/ });
    remove.focus();
    // The ticket list re-reads (a socket announcement) and the popover re-renders.
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
    await waitFor(() => expect(svc.ticketsOfThread).toHaveBeenCalledTimes(2));
    expect(document.activeElement).toBe(remove);
  });

  it('Esc: focus goes back to the ticket chip', async () => {
    twoTickets();
    renderHeader();
    const { chip } = await openTickets();
    esc();
    await waitFor(() => expect(document.activeElement).toBe(chip));
    expect(screen.queryByRole('dialog', { name: 'Tickets' })).not.toBeInTheDocument();
  });

  it('an outside press on nothing focusable: focus goes back to the chip', async () => {
    twoTickets();
    renderHeader();
    const { chip } = await openTickets();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('CONTROL: an outside press that put focus on another control leaves it there', async () => {
    twoTickets();
    renderHeader();
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    try {
      await openTickets();
      fireEvent.mouseDown(elsewhere);
      elsewhere.focus(); // what the browser does after the press
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Tickets' })).not.toBeInTheDocument()
      );
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(document.activeElement).toBe(elsewhere);
    } finally {
      elsewhere.remove();
    }
  });

  it('Add to ticket… from the popover: closing the picker returns focus to the chip', async () => {
    twoTickets();
    renderHeader();
    const { chip, popover } = await openTickets();
    fireEvent.click(within(popover).getByRole('button', { name: 'Add to ticket…' }));
    expect(await screen.findByText('Add this thread to a ticket')).toBeInTheDocument();
    // Not while the picker is up.
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(document.activeElement).not.toBe(chip);
    esc();
    await waitFor(() => expect(screen.queryByText('Add this thread to a ticket')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('Merge… from Same conversation: closing the picker returns focus to the Merged chip', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    renderHeader();
    const chip = await screen.findByTestId('merged-chip');
    fireEvent.click(chip);
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    expect(document.activeElement).toBe(popover);
    fireEvent.click(within(popover).getByRole('button', { name: 'Merge…' }));
    expect(await screen.findByText('Merge with another thread')).toBeInTheDocument();
    esc();
    await waitFor(() => expect(screen.queryByText('Merge with another thread')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it('the chip went away (last ticket removed): focus goes to More, not <body>', async () => {
    svc.ticketsOfThread.mockResolvedValue({
      unavailable: false,
      hiddenCount: 0,
      rows: [ticket({ ticketId: 9 })],
    });
    renderHeader();
    await openTickets();
    svc.ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 0, rows: [] });
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
    await waitFor(() => expect(screen.queryByTestId('ticket-chip')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }))
    );
  });

  it('the Merged chip went away (last merge undone): focus goes to More, and a merge coming back does not reopen the popover', async () => {
    svc.listMerges.mockResolvedValue([merged]);
    renderHeader();
    fireEvent.click(await screen.findByTestId('merged-chip'));
    const popover = await screen.findByRole('dialog', { name: 'Same conversation' });
    // The re-read after the unmerge is held, then brings a merge back (a peer merged meanwhile).
    let reread: (rows: unknown) => void = () => {};
    svc.listMerges.mockReturnValue(
      new Promise((resolve) => {
        reread = resolve;
      })
    );
    fireEvent.click(within(popover).getByRole('button', { name: 'Unmerge TES-SUP-50' }));
    await waitFor(() => expect(svc.unmerge).toHaveBeenCalledWith(1, 50));
    await waitFor(() => expect(screen.queryByTestId('merged-chip')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }))
    );
    act(() => reread([merged]));
    expect(await screen.findByTestId('merged-chip')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Same conversation' })).not.toBeInTheDocument();
  });

  it('More: Esc returns focus to More; a picker opened from More returns there too', async () => {
    renderHeader();
    const more = await screen.findByRole('button', { name: 'More actions' });
    fireEvent.click(more);
    within(screen.getByRole('menu')).getByText('Conversation history').closest('button')!.focus();
    esc();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));

    more.blur();
    fireEvent.click(more);
    fireEvent.click(within(screen.getByRole('menu')).getByText('Add to ticket…'));
    expect(await screen.findByText('Add this thread to a ticket')).toBeInTheDocument();
    esc();
    await waitFor(() => expect(screen.queryByText('Add this thread to a ticket')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('a press on More closes the popover without sending focus to the chip behind the menu', async () => {
    twoTickets();
    renderHeader();
    const { chip } = await openTickets();
    const more = screen.getByRole('button', { name: 'More actions' });
    fireEvent.mouseDown(more);
    fireEvent.click(more);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(document.activeElement).not.toBe(chip);
    // Closing the menu then hands focus to More, not to the chip.
    esc();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('CONTROL: nothing opened, nothing moves — focus is not taken on render', async () => {
    twoTickets();
    svc.listMerges.mockResolvedValue([merged]);
    renderHeader();
    await screen.findByTestId('ticket-chip');
    await screen.findByTestId('merged-chip');
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Focus residuals — Remove inside the popover, the host Delete modal, the tooltip', () => {
  const announce = () =>
    act(() => {
      window.dispatchEvent(
        new CustomEvent(THREAD_TICKETS_CHANGED, { detail: { conversationIds: [1] } })
      );
    });
  const ticketsAre = (...rows: ReturnType<typeof ticket>[]) =>
    svc.ticketsOfThread.mockResolvedValue({ unavailable: false, hiddenCount: 0, rows });
  const openTickets = async () => {
    fireEvent.click(await screen.findByTestId('ticket-chip'));
    return screen.findByRole('dialog', { name: 'Tickets' });
  };
  const removeButton = (popover: HTMLElement, id: number) =>
    within(popover).getByRole('button', { name: new RegExp(`^Remove from ticket #${id}`) });
  /** Press Remove the way a keyboard user does: focused, then activated. */
  const pressRemove = async (popover: HTMLElement, id: number) => {
    const button = removeButton(popover, id);
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(svc.removeThread).toHaveBeenCalledWith(id, 1));
    return button;
  };
  const tick = (ms = 10) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

  it('(a) one of several removed: focus goes to the NEXT card’s Remove, popover still open', async () => {
    ticketsAre(
      ticket({ ticketId: 9 }),
      ticket({ ticketId: 8 }),
      ticket({ ticketId: 7, isPrimary: true })
    );
    renderHeader();
    const popover = await openTickets();
    await pressRemove(popover, 9);
    ticketsAre(ticket({ ticketId: 8 }), ticket({ ticketId: 7, isPrimary: true }));
    announce();
    await waitFor(() => expect(within(popover).queryByTestId('related-ticket-9')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(removeButton(popover, 8)));
    expect(screen.getByRole('dialog', { name: 'Tickets' })).toBe(popover);
  });

  it('(a) the next card has no Remove (created from this thread): its Open ticket', async () => {
    ticketsAre(ticket({ ticketId: 9 }), ticket({ ticketId: 7, isPrimary: true }));
    renderHeader();
    const popover = await openTickets();
    await pressRemove(popover, 9);
    ticketsAre(ticket({ ticketId: 7, isPrimary: true }));
    announce();
    await waitFor(() => expect(within(popover).queryByTestId('related-ticket-9')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(within(popover).getByTestId('related-ticket-7')).getByRole('link', {
          name: 'Open ticket',
        })
      )
    );
  });

  it('(a) the LAST card removed, others above it: focus goes to the popover itself', async () => {
    ticketsAre(ticket({ ticketId: 7, isPrimary: true }), ticket({ ticketId: 9 }));
    renderHeader();
    const popover = await openTickets();
    await pressRemove(popover, 9);
    ticketsAre(ticket({ ticketId: 7, isPrimary: true }));
    announce();
    await waitFor(() => expect(within(popover).queryByTestId('related-ticket-9')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(popover));
  });

  it('(a) a failed Remove: focus goes back to the same Remove (a browser drops it on disable)', async () => {
    ticketsAre(ticket({ ticketId: 9 }), ticket({ ticketId: 8 }));
    svc.removeThread.mockImplementation(() => {
      // What Chrome does to a focused control that becomes disabled.
      (document.activeElement as HTMLElement | null)?.blur();
      return Promise.reject(new Error('nope'));
    });
    renderHeader();
    const popover = await openTickets();
    const button = await pressRemove(popover, 9);
    await waitFor(() =>
      expect(
        within(popover).getByText('This thread could not be taken off that ticket.')
      ).toBeTruthy()
    );
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('(a) CONTROL: a user who moved on during the request keeps their place', async () => {
    ticketsAre(ticket({ ticketId: 9 }), ticket({ ticketId: 8 }));
    renderHeader();
    const popover = await openTickets();
    await pressRemove(popover, 9);
    const addButton = within(popover).getByRole('button', { name: 'Add to ticket…' });
    addButton.focus();
    ticketsAre(ticket({ ticketId: 8 }));
    announce();
    await waitFor(() => expect(within(popover).queryByTestId('related-ticket-9')).toBeNull());
    await tick();
    expect(document.activeElement).toBe(addButton);
  });

  const DeleteHost = () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <MessageDetailHeader
          message={message}
          showFullPageButton={false}
          isFullPage
          threadCount={1}
          onDelete={() => setOpen(true)}
        />
        <DeleteMessageDialog
          open={open}
          message={message}
          deleting={false}
          onCancel={() => setOpen(false)}
          onConfirm={() => {}}
        />
      </>
    );
  };
  const renderDeleteHost = () =>
    render(
      <ThemeProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <DeleteHost />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  const openDeleteFromMore = async () => {
    const more = await screen.findByRole('button', { name: 'More actions' });
    fireEvent.click(more);
    fireEvent.click(within(screen.getByRole('menu')).getByText('Delete message'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Delete message');
    return more;
  };

  it('(b) the host Delete modal closed on Cancel: focus goes back to More', async () => {
    renderDeleteHost();
    const more = await openDeleteFromMore();
    await tick();
    // Not while the modal is up.
    expect(document.activeElement).not.toBe(more);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.mouseDown(cancel);
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('(b) … and on Esc', async () => {
    renderDeleteHost();
    const more = await openDeleteFromMore();
    await tick();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('(b) the page changing under the modal (a toast) does not hand focus back early', async () => {
    renderDeleteHost();
    const more = await openDeleteFromMore();
    await tick();
    // Anything added to the page while the modal is still up — a toast, a portal.
    const toastNode = document.createElement('div');
    act(() => {
      document.body.appendChild(toastNode);
    });
    await tick();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(more);
    // …and the return is still owed: Cancel brings focus back to More.
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.mouseDown(cancel);
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(more));
    toastNode.remove();
  });

  describe('(c) the chip’s tooltip on focus return', () => {
    // jsdom has no layout; a real box lets the tooltip's edge clamp settle.
    beforeEach(() => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 120,
        left: 100,
        right: 200,
        width: 100,
        height: 20,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      } as DOMRect);
    });
    afterEach(() => vi.restoreAllMocks());

    it('a MOUSE outside press: focus comes back to the chip without flashing its tooltip', async () => {
      ticketsAre(ticket({ ticketId: 9 }));
      renderHeader();
      await openTickets();
      fireEvent.pointerDown(document.body);
      fireEvent.mouseDown(document.body);
      const chip = screen.getByTestId('ticket-chip');
      await waitFor(() => expect(document.activeElement).toBe(chip));
      await tick(300); // past the tooltip's 200ms delay
      expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('CONTROL: closed with Esc (keyboard) the tooltip shows on the returned focus', async () => {
      ticketsAre(ticket({ ticketId: 9 }));
      renderHeader();
      // Opened with the mouse, closed with a key: the KEY decides.
      fireEvent.pointerDown(await screen.findByTestId('ticket-chip'));
      await openTickets();
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      const chip = screen.getByTestId('ticket-chip');
      await waitFor(() => expect(document.activeElement).toBe(chip));
      await tick(300);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });
});
