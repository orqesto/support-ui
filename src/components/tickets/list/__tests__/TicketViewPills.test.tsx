import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defaultFilters } from '@/stores/ticketsStore';
import { TicketViewPills } from '../TicketViewPills';
import { BUILT_IN_TICKET_VIEWS, filtersOfView, type TicketView } from '../ticketViews';

const saved: TicketView = { id: 9, name: 'Billing incidents', filters: { categoryId: '3' } };
const views = [...BUILT_IN_TICKET_VIEWS, saved];

const setup = (filters = filtersOfView({ needs: 'yes' })) => {
  const props = {
    filters,
    views,
    counts: { 'Needs us': 12, Mine: 4, 'Billing incidents': 2 } as Record<string, number | undefined>,
    onApply: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
  };
  render(<TicketViewPills {...props} />);
  return props;
};

describe('TicketViewPills', () => {
  it('lights the view that matches the filters', () => {
    setup();
    expect(screen.getByRole('button', { name: /Needs us/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Mine/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows each view’s count, and no number where the count is unknown', () => {
    setup();
    expect(screen.getByRole('button', { name: /Needs us/ })).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: /^All/ })).not.toHaveTextContent(/\d/);
  });

  it('applies a view over the defaults', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Mine/ }));
    expect(props.onApply).toHaveBeenCalledWith({ ...defaultFilters, assigneeId: 'me' });
  });

  it('offers Save as view only for a filter state no view matches', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Save as view/ })).toBeNull();
  });

  it('saves the current filters under a typed name', async () => {
    const props = setup({ ...defaultFilters, priority: 'high', assigneeId: 'me' });
    fireEvent.click(screen.getByRole('button', { name: /Save as view/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My high ones' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalledWith('My high ones'));
  });

  it('says so when a view cannot be saved, and keeps the name typed', async () => {
    const props = setup({ ...defaultFilters, priority: 'high' });
    props.onSave.mockRejectedValueOnce(new Error('Request failed with status code 404'));
    fireEvent.click(screen.getByRole('button', { name: /Save as view/ }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'High ones' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('High ones');
  });

  it('lets a saved view be deleted, but not a built-in one', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Delete view Billing incidents' }));
    expect(props.onDelete).toHaveBeenCalledWith(saved);
    expect(screen.queryByRole('button', { name: 'Delete view Mine' })).toBeNull();
  });
});
