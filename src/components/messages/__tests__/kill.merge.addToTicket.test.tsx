/**
 * AddToTicketDialog — multi-digit ticket ids in the "already on" list, and the joined ticket
 * keeping the priority and Jira key the picker read (the header shows both before a re-read).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ addThreads: vi.fn(), getAll: vi.fn() }));
vi.mock('@/services/ticketThreads.service', () => ({
  ticketThreadsService: { addThreads: mocks.addThreads },
}));
vi.mock('@/services/ticket.service', () => ({ ticketService: { getAll: mocks.getAll } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { AddToTicketDialog } = await import('../AddToTicketDialog');

beforeEach(() => {
  mocks.addThreads.mockReset();
  mocks.getAll.mockReset();
  mocks.addThreads.mockResolvedValue({ added: [11], alreadyAttached: [] });
});

const renderPicker = (exclude: number[], onAdded = vi.fn()) => {
  render(
    <AddToTicketDialog
      open
      onOpenChange={vi.fn()}
      message={{ id: 11 }}
      excludeTicketIds={exclude}
      onAdded={onAdded}
    />
  );
  return onAdded;
};

describe('AddToTicketDialog', () => {
  it('multi-digit ids already on the thread are not offered; the others are', async () => {
    mocks.getAll.mockResolvedValue({
      data: [
        { id: 1, title: 'One', status: 'open' },
        { id: 12, title: 'Twelve', status: 'open' },
        { id: 4, title: 'Four', status: 'open' },
        { id: 2, title: 'Two', status: 'open' },
      ],
    });
    renderPicker([12, 4]);
    expect(await screen.findByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(screen.queryByText('Twelve')).toBeNull();
    expect(screen.queryByText('Four')).toBeNull();
  });

  it('the joined ticket keeps the priority and Jira key the picker read', async () => {
    mocks.getAll.mockResolvedValue({
      data: [
        { id: 9, title: 'Login broken', status: 'open', priority: 'high', externalId: 'PROJ-1' },
      ],
    });
    const onAdded = renderPicker([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    const { ticket } = onAdded.mock.calls[0][0] as {
      ticket: { priority: string; externalId: string | null };
    };
    expect(ticket.priority).toBe('high');
    expect(ticket.externalId).toBe('PROJ-1');
  });

  it('CONTROL: a row without them gives an empty priority and no Jira key', async () => {
    mocks.getAll.mockResolvedValue({ data: [{ id: 9, title: 'Login broken', status: 'open' }] });
    const onAdded = renderPicker([]);
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    const { ticket } = onAdded.mock.calls[0][0] as {
      ticket: { priority: string; externalId: string | null };
    };
    expect(ticket.priority).toBe('');
    expect(ticket.externalId).toBeNull();
  });
});
