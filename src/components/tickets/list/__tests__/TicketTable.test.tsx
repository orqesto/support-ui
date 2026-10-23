import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { defaultFilters } from '@/stores/ticketsStore';
import type { Ticket, TicketStatus } from '@/types';
import { TicketTable, type TicketTableProps } from '../TicketTable';
import { buildTicketFilterKeys } from '../ticketFilterKeys';

// The app reads the workspace code from the server; these suites render rows on their own.
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));

const ticket = (id: number, status: TicketStatus, owedCount = 0): Ticket => ({
  id,
  title: `Ticket ${id}`,
  description: '',
  sender: 'someone@example.com',
  status,
  priority: 'medium',
  categoryId: null,
  assigneeId: null,
  externalId: null,
  externalUrl: null,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T19:00:00Z',
  threadCount: 2,
  owedCount,
});

const rows = [
  ticket(1, 'resolved', 2),
  ticket(2, 'open'),
  ticket(3, 'closed'),
  ticket(4, 'resolved', 1),
];

const setup = (over: Partial<TicketTableProps> = {}) => {
  const props: TicketTableProps = {
    tickets: rows,
    total: 4,
    loading: false,
    filters: defaultFilters,
    sorting: { sortBy: 'updatedAt', sortOrder: 'desc' },
    keys: buildTicketFilterKeys({ assignees: [], categories: [], labels: [], jiraOn: false }),
    density: 'table',
    group: false,
    layout: 'list',
    splitAvailable: true,
    canManage: true,
    assignees: [],
    currentUserId: 7,
    currentId: null,
    onOpen: vi.fn(),
    onAssign: vi.fn(),
    onRowMenu: () => null,
    onFilters: vi.fn(),
    onSort: vi.fn(),
    onDensity: vi.fn(),
    onGroup: vi.fn(),
    onLayout: vi.fn(),
    onClearFilters: vi.fn(),
    emptyAction: null,
    ...over,
  };
  render(<TicketTable {...props} />);
  return props;
};

describe('TicketTable', () => {
  it('says how many tickets there are', () => {
    setup();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText(/tickets/)).toBeInTheDocument();
  });

  it('sorts and filters from the Owed column header', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Owed: filter and sort/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Most owed first' }));
    expect(props.onSort).toHaveBeenCalledWith({ sortBy: 'owed', sortOrder: 'desc' });
    fireEvent.click(screen.getByRole('button', { name: /Owed: filter and sort/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Customers still owed a reply' }));
    expect(props.onFilters).toHaveBeenCalledWith({ ...defaultFilters, owes: 'yes' });
  });

  it('turns a column filter off when its value is picked again', () => {
    const props = setup({ filters: { ...defaultFilters, owes: 'yes' } });
    fireEvent.click(screen.getByRole('button', { name: /Owed: filter and sort \(filtered\)/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Customers still owed a reply' }));
    expect(props.onFilters).toHaveBeenCalledWith(defaultFilters);
  });

  it('pauses grouping while a search is typed: rows stay in best-match order, none collapsed', () => {
    setup({ group: true, filters: { ...defaultFilters, search: 'pallet' } });
    expect(screen.queryAllByRole('button', { name: /^(Open|Resolved|Closed) \d/ })).toEqual([]);
    // The closed ticket is listed (its group would start collapsed), in the order given.
    const titles = screen.getAllByText(/^Ticket \d$/).map((cell) => cell.textContent);
    expect(titles).toEqual(['Ticket 1', 'Ticket 2', 'Ticket 3', 'Ticket 4']);
  });

  it('groups by status in lane order, closed collapsed, with each group’s owed total', () => {
    setup({ group: true });
    const headers = screen.getAllByRole('button', {
      name: /^(Open|In progress|Pending|Resolved|Closed) \d/,
    });
    expect(headers.map((head) => head.textContent?.replace(/\d.*$/, '').trim())).toEqual([
      'Open',
      'Resolved',
      'Closed',
    ]);
    const resolved = headers[1];
    expect(within(resolved).getByText('3 owed')).toBeInTheDocument();
    expect(headers[2]).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Ticket 3')).toBeNull();
    fireEvent.click(headers[2]);
    expect(screen.getByText('Ticket 3')).toBeInTheDocument();
  });

  it('renders cards in card density and whenever the layout is split', () => {
    setup({ density: 'table', layout: 'split' });
    expect(screen.queryByRole('columnheader')).toBeNull();
  });

  it('changes density, layout and grouping from the caption', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Card rows' }));
    expect(props.onDensity).toHaveBeenCalledWith('cards');
    fireEvent.click(screen.getByRole('button', { name: 'Split layout' }));
    expect(props.onLayout).toHaveBeenCalledWith('split');
    fireEvent.click(screen.getByRole('button', { name: /Group by status/ }));
    expect(props.onGroup).toHaveBeenCalledWith(true);
  });

  it('hides the split choice where there is no room for it', () => {
    setup({ splitAvailable: false });
    expect(screen.queryByRole('button', { name: 'Split layout' })).toBeNull();
  });

  it('explains an empty list and offers to clear the filters', () => {
    const props = setup({ tickets: [], total: 0, filters: { ...defaultFilters, owes: 'yes' } });
    expect(screen.getByText('No tickets match these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(props.onClearFilters).toHaveBeenCalled();
  });
});
