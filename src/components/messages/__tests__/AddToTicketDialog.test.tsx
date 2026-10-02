/**
 * "Add this thread to a ticket" — AddToTicketDialog, the picker the header opens (the ticket
 * chip's Related popover, the More menu). Tested on its own: the Customer-tab Tickets panel that
 * used to host it is gone, so these moved here from that panel's tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';

const addThreads = vi.fn();
const getAll = vi.fn();

vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { addThreads },
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { getAll } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { AddToTicketDialog } = await import('@/components/messages/AddToTicketDialog');

const onAdded = vi.fn();
const onOpenChange = vi.fn();

/** The host's part: a button that opens the picker, and the open state the picker closes. */
const Host = ({ exclude = [] }: { exclude?: number[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open picker
      </button>
      <AddToTicketDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        message={{ id: 11 }}
        excludeTicketIds={exclude}
        onAdded={onAdded}
      />
    </>
  );
};
const renderPicker = (exclude?: number[]) =>
  render(
    <MemoryRouter>
      <Host exclude={exclude} />
    </MemoryRouter>
  );
const openPicker = () => userEvent.click(screen.getByRole('button', { name: 'open picker' }));

beforeEach(() => {
  vi.clearAllMocks();
  getAll.mockResolvedValue({ data: [{ id: 9, title: 'Login broken', status: 'in_progress' }] });
  addThreads.mockResolvedValue({ added: [11], alreadyAttached: [] });
});

describe('AddToTicketDialog', () => {
  it('adds the thread to the ticket the agent picks, then closes', async () => {
    renderPicker();
    await openPicker();
    await userEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(addThreads).toHaveBeenCalledWith(9, [11]));
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(onAdded.mock.lastCall?.[0] as unknown).toMatchObject({
      ticketId: 9,
      alreadyOn: false,
      conversationId: 11,
      // The ticket as the header lists it, from what the picker read (nothing invented).
      ticket: {
        ticketId: 9,
        title: 'Login broken',
        status: 'in_progress',
        isPrimary: false,
        owesReply: null,
      },
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a ticket the thread is already on is not offered again', async () => {
    getAll.mockResolvedValue({
      data: [
        { id: 9, title: 'Login broken', status: 'open' },
        { id: 4, title: 'Checkout outage', status: 'open' },
      ],
    });
    renderPicker([4]);
    await openPicker();
    // CONTROL for the absence below: the list has loaded.
    expect(await screen.findByText('Login broken')).toBeInTheDocument();
    expect(screen.queryByText('Checkout outage')).not.toBeInTheDocument();
  });

  it('someone added it a moment ago: the caller is told this click changed nothing', async () => {
    addThreads.mockResolvedValue({ added: [], alreadyAttached: [11] });
    renderPicker();
    await openPicker();
    await userEvent.click(await screen.findByRole('button', { name: /^Add$/ }));
    await waitFor(() =>
      expect(onAdded).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: 9, alreadyOn: true })
      )
    );
  });

  it('a full picker page says it is capped — "no other tickets" is never the cap talking', async () => {
    getAll.mockResolvedValue({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: index + 1,
        title: `T${index}`,
        status: 'open',
      })),
    });
    renderPicker();
    await openPicker();
    expect(await screen.findByText(/Showing the newest 20/)).toBeInTheDocument();
    expect(getAll).toHaveBeenCalledWith(undefined, 1, 20);
  });

  it('CONTROL: a page short of the cap does not claim to be capped', async () => {
    renderPicker();
    await openPicker();
    expect(await screen.findByText('Login broken')).toBeInTheDocument();
    expect(screen.queryByText(/Showing the newest/)).not.toBeInTheDocument();
  });

  it('searches once per pause, not per keystroke', async () => {
    renderPicker();
    await openPicker();
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
        data: [
          {
            id: filters?.search ? 77 : 9,
            title: filters?.search ? 'ACME result' : 'Default list',
            status: 'open',
          },
        ],
      })
    );
    renderPicker();
    await openPicker();
    await screen.findByText('Default list');
    await userEvent.type(screen.getByPlaceholderText(/Search tickets/), 'acme');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await openPicker();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.queryByText('ACME result')).not.toBeInTheDocument();
    expect(screen.getByText('Default list')).toBeInTheDocument();
  });

  it('closing the picker inside the debounce sends no search at all', async () => {
    renderPicker();
    await openPicker();
    await waitFor(() => expect(getAll).toHaveBeenCalledTimes(1)); // the initial list
    await userEvent.type(screen.getByPlaceholderText(/Search tickets/), 'acme');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('a failed search says so inside the picker — not "no other tickets"', async () => {
    getAll.mockRejectedValue(new Error('boom'));
    renderPicker();
    await openPicker();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog).toHaveTextContent(/boom|Could not search tickets/));
    expect(screen.queryByText('No other tickets to add it to.')).not.toBeInTheDocument();
  });

  it('an older search failing after a newer one landed: the newer results stay, no failure line', async () => {
    let failA: (reason: unknown) => void = () => {};
    getAll.mockImplementation((filters?: { search?: string }) => {
      if (filters?.search === 'a')
        return new Promise((_resolve, reject) => {
          failA = reject;
        });
      if (filters?.search === 'ab')
        return Promise.resolve({ data: [{ id: 31, title: 'AB result', status: 'open' }] });
      return Promise.resolve({ data: [{ id: 9, title: 'Default list', status: 'open' }] });
    });
    renderPicker();
    await openPicker();
    await screen.findByText('Default list');
    const box = screen.getByPlaceholderText(/Search tickets/);
    await userEvent.type(box, 'a');
    await waitFor(() => expect(getAll).toHaveBeenCalledWith({ search: 'a' }, 1, 20));
    await userEvent.type(box, 'b');
    expect(await screen.findByText('AB result')).toBeInTheDocument();
    act(() => failA(new Error('boom')));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText('AB result')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/boom|Could not search tickets/);
  });
});
