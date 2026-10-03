/**
 * Mutation batch (message detail v4), chunk 5: the Related popover's "+ N tickets in departments
 * you cannot open" line — every mutant of its condition survived, so it could show for zero.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHeader, svc, ticket } from './md4.header.utils';
import { screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/lib/api-client', () => ({
  apiClient: new Proxy(
    {},
    { get: () => () => Promise.resolve({ data: { success: true, data: [] } }) }
  ),
}));

afterEach(cleanup);

const openTickets = async (hiddenCount: number) => {
  svc.ticketsOfThread.mockResolvedValue({
    unavailable: false,
    rows: [ticket({ ticketId: 7 })],
    hiddenCount,
  });
  renderHeader();
  fireEvent.click(await screen.findByTestId('ticket-chip'));
  return screen.findByText('Checkout outage');
};

describe('the Related popover and the tickets this viewer cannot open', () => {
  it('names how many there are, in the plural', async () => {
    await openTickets(2);
    expect(screen.getByText(/\+ 2 tickets in departments you cannot open\./)).toBeInTheDocument();
  });

  it('one is named in the singular', async () => {
    await openTickets(1);
    expect(screen.getByText(/\+ 1 ticket in departments you cannot open\./)).toBeInTheDocument();
  });

  it('CONTROL: none means no such line', async () => {
    await openTickets(0);
    expect(screen.queryByText(/in departments you cannot open/)).toBeNull();
  });
});
