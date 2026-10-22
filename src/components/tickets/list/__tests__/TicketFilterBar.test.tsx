import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { defaultFilters, type TicketFilters } from '@/stores/ticketsStore';
import { TicketFilterBar } from '../TicketFilterBar';
import { buildTicketFilterKeys } from '../ticketFilterKeys';

const keys = buildTicketFilterKeys({
  assignees: [{ id: 5, name: 'Robin Example' }],
  categories: [{ id: 3, name: 'Payments' }],
  labels: [{ id: 4, name: 'Incident', color: '#B42318' }],
  jiraOn: false,
});

const setup = (filters: TicketFilters, search = '') => {
  const props = {
    filters,
    keys,
    search,
    onChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSearch: vi.fn(),
    onClear: vi.fn(),
  };
  render(<TicketFilterBar {...props} />);
  return props;
};

describe('TicketFilterBar', () => {
  it('shows each set filter as a chip with its readable value', () => {
    setup({ ...defaultFilters, owes: 'yes', categoryId: '3' });
    expect(screen.getByText('Customers still owed a reply')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
  });

  it('removes one filter from its chip', () => {
    const props = setup({ ...defaultFilters, owes: 'yes', categoryId: '3' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Owed filter' }));
    expect(props.onChange).toHaveBeenCalledWith({ ...defaultFilters, categoryId: '3' });
  });

  it('adds a filter through Filter → Priority → High', () => {
    const props = setup(defaultFilters);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Priority/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'High' }));
    expect(props.onChange).toHaveBeenCalledWith({ ...defaultFilters, priority: 'high' });
  });

  it('marks its search field so / can jump to it', () => {
    setup(defaultFilters);
    expect(document.querySelector('[data-ticket-search] input')).not.toBeNull();
  });

  it('offers no Jira filter when Jira is not connected', () => {
    setup(defaultFilters);
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.queryByRole('menuitem', { name: /Jira/ })).toBeNull();
  });

  it('shows Clear only when something is filtered or searched, and clears both', () => {
    const props = setup(defaultFilters);
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
    const { onClear } = setup({ ...defaultFilters, needs: 'yes' });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
    expect(props.onClear).not.toHaveBeenCalled();
  });
});
