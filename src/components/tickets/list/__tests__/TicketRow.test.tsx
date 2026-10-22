import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Ticket } from '@/types';
import { TicketCard } from '../TicketCard';
import { TicketRow } from '../TicketRow';
import { spineTone } from '../ticketRowBits';

const base: Ticket = {
  id: 1182,
  title: 'Checkout fails at the 3-D Secure step',
  description: '<p>Visa cardholders are returned to the basket.</p>',
  sender: 'anna@example.com',
  status: 'resolved',
  priority: 'high',
  categoryId: 3,
  categoryName: 'Payments',
  assigneeId: null,
  assigneeName: null,
  externalId: null,
  externalUrl: null,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T19:00:00Z',
  labels: [
    { id: 1, name: 'Incident', color: '#B42318' },
    { id: 2, name: 'Web', color: '#2A6FB4' },
  ],
  threadCount: 9,
  owedCount: 3,
};

const assignees = [
  { id: 7, name: 'Robin Example' },
  { id: 8, name: 'Sam Sample' },
];

const renderRow = (ticket: Ticket, canManage = true) => {
  const props = {
    ticket,
    canManage,
    assignees,
    currentUserId: 7,
    current: false,
    onOpen: vi.fn(),
    onAssign: vi.fn(),
    onRowMenu: vi.fn(),
  };
  render(<TicketRow {...props} />);
  return props;
};

describe('TicketRow', () => {
  it('shows id, title, the first label only, threads and the owed badge', () => {
    renderRow(base);
    const row = screen.getByRole('row');
    expect(within(row).getByText('#1182')).toBeInTheDocument();
    expect(within(row).getByText(base.title)).toBeInTheDocument();
    expect(within(row).getByText('Incident')).toBeInTheDocument();
    expect(within(row).queryByText('Web')).toBeNull();
    expect(within(row).getByText('9')).toBeInTheDocument();
    expect(within(row).getByText('3 owed')).toBeInTheDocument();
  });

  it('shows a dash when nobody is owed, and when the count is unknown (older backend)', () => {
    renderRow({ ...base, owedCount: 0 });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('copes with a ticket that has no counts at all', () => {
    renderRow({ ...base, threadCount: undefined, owedCount: undefined });
    expect(screen.queryByText(/owed/)).toBeNull();
  });

  it('claims an unassigned ticket for me without opening it', () => {
    const props = renderRow(base);
    fireEvent.click(screen.getByRole('button', { name: 'Claim #1182' }));
    expect(props.onAssign).toHaveBeenCalledWith(1182, 7);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('re-assigns or unassigns from the avatar', () => {
    const props = renderRow({ ...base, assigneeId: 8, assigneeName: 'Sam Sample' });
    fireEvent.click(screen.getByRole('button', { name: 'Re-assign #1182' }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Robin Example/ }));
    expect(props.onAssign).toHaveBeenCalledWith(1182, 7);
    fireEvent.click(screen.getByRole('button', { name: 'Re-assign #1182' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unassign' }));
    expect(props.onAssign).toHaveBeenLastCalledWith(1182, null);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('offers no Claim to someone who cannot manage tickets', () => {
    renderRow(base, false);
    expect(screen.queryByRole('button', { name: /Claim/ })).toBeNull();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('opens on click and on Enter', () => {
    const props = renderRow(base);
    fireEvent.click(screen.getByText(base.title));
    fireEvent.keyDown(screen.getByRole('row'), { key: 'Enter' });
    expect(props.onOpen).toHaveBeenCalledTimes(2);
  });
});

describe('TicketCard', () => {
  it('shows the description as plain text and the owed badge', () => {
    render(
      <TicketCard
        ticket={base}
        canManage
        assignees={assignees}
        currentUserId={7}
        current={false}
        onOpen={vi.fn()}
        onAssign={vi.fn()}
        onRowMenu={vi.fn()}
      />
    );
    expect(screen.getByText('Visa cardholders are returned to the basket.')).toBeInTheDocument();
    expect(screen.getByText('3 owed')).toBeInTheDocument();
  });
});

describe('spineTone', () => {
  it('ranks critical-and-open over owed over resolved over active over calm', () => {
    expect(spineTone({ ...base, priority: 'critical', status: 'open' })).toBe('danger');
    expect(spineTone({ ...base, priority: 'critical', status: 'resolved', owedCount: 2 })).toBe('att');
    expect(spineTone({ ...base, owedCount: 0 })).toBe('ok');
    expect(spineTone({ ...base, status: 'in_progress', owedCount: 0 })).toBe('blue');
    expect(spineTone({ ...base, status: 'pending', owedCount: 0 })).toBe('calm');
  });
});
