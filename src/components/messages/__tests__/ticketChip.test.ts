/**
 * The list/kanban ticket chip must stay TRUE in every state the backend's pair (count + one
 * headline status) can describe — a thread can be on several tickets since 2026-09-30.
 */
import { describe, it, expect } from 'vitest';
import { ticketChip } from '@/components/messages/ticketChip';

describe('ticketChip', () => {
  it('no ticket: no chip', () => {
    expect(ticketChip({ hasTicket: false, linkedTicketStatus: null, ticketCount: 0 }, null)).toBeNull();
  });

  it('one ticket: unchanged from before — the Jira key or "Ticket", and its status', () => {
    expect(
      ticketChip({ hasTicket: true, linkedTicketStatus: 'in_progress', ticketCount: 1 }, 'SUP-9')
    ).toEqual({ label: 'SUP-9', tooltip: 'Ticket · in progress' });
  });

  it('an older backend sends no count: one ticket if it says there is one', () => {
    expect(ticketChip({ hasTicket: true, linkedTicketStatus: 'open' }, null)).toEqual({
      label: 'Ticket',
      tooltip: 'Ticket · open',
    });
    expect(ticketChip({ hasTicket: false, linkedTicketStatus: null }, null)).toBeNull();
  });

  it('several tickets with a live one: names the headline for what it is', () => {
    expect(
      ticketChip({ hasTicket: true, linkedTicketStatus: 'in_progress', ticketCount: 3 }, 'SUP-9')
    ).toEqual({ label: '3 tickets', tooltip: '3 tickets · newest open one: in progress' });
  });

  it('⛔ several tickets whose headline is done means ALL are done — and never "Ticket · resolved"', () => {
    const chip = ticketChip({ hasTicket: true, linkedTicketStatus: 'resolved', ticketCount: 2 }, null);
    expect(chip).toEqual({ label: '2 tickets', tooltip: '2 tickets · all resolved or closed' });
  });
});
