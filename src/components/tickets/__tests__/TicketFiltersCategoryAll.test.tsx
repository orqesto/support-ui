/**
 * The Category filter with no category chosen. The store says `'all'` (its default, and what
 * picking "All" writes back) while the option for it is `''` — so the control matched nothing and
 * showed react-select's English "Select..." on every page load instead of "All".
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('@/services/category.service', () => ({
  categoryService: {
    getAll: () => Promise.resolve({ success: true, data: [{ id: 3, name: 'Billing' }] }),
  },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: { getLabels: () => Promise.resolve([]) },
}));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => Promise.resolve([]) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { TicketFilters } = await import('../TicketFilters');

afterEach(cleanup);

const renderFilters = (categoryId: string) =>
  render(
    <TicketFilters
      filters={{ status: 'all', priority: 'all', categoryId }}
      sorting={{ sortBy: 'createdAt', sortOrder: 'desc' }}
      pendingSearch=""
      pagination={{ page: 1, limit: 20, total: 0, totalPages: 0 } as never}
      onFilterChange={vi.fn()}
      onApplyPreset={vi.fn()}
      onSearch={vi.fn()}
      onSearchBlur={vi.fn()}
      onClearFilters={vi.fn()}
      onSortingChange={vi.fn()}
      onPendingSearchChange={vi.fn()}
    />
  );

const categoryControlText = async () => {
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
  const control = await screen.findByRole('combobox', { name: 'Category' });
  return control.closest('.select__control')?.textContent;
};

describe('Ticket filters — Category with nothing chosen', () => {
  it("the store's 'all' shows \"All\", not a placeholder", async () => {
    renderFilters('all');
    expect(await categoryControlText()).toBe('All');
  });

  it('a chosen category shows its name (control)', async () => {
    renderFilters('3');
    expect(await categoryControlText()).toBe('Billing');
  });
});
