/**
 * The saved-view pills. The one behaviour with a wrong answer available: clicking a pill
 * that is already lit. Re-applying the same filters looks like nothing happened, which
 * makes a visibly-active control feel broken — it toggles off instead.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { FilterState } from '@/stores/messagesStore';

// Mutable so a test can reproduce the pre-fetch state, where a filter has no options
// and is therefore absent from the schema entirely.
const options = vi.hoisted(() => ({
  current: [{ value: 'me', label: 'Me' }, { value: 'unassigned', label: 'Unassigned' }],
}));
vi.mock('../useFilterOptions', () => ({
  useFilterOptions: () => ({
    assignees: options.current,
    departments: [],
    sources: [],
    labels: [],
    aliases: [],
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

const { MessageFilterBar } = await import('../MessageFilterBar');

beforeEach(() => {
  localStorage.clear();
  options.current = [
    { value: 'me', label: 'Me' },
    { value: 'unassigned', label: 'Unassigned' },
  ];
});
afterEach(cleanup);

const setup = (filters: FilterState) => {
  const onFilterChange = vi.fn();
  const onClearFilters = vi.fn();
  render(
    <MessageFilterBar
      filters={filters}
      pagination={{ page: 1, limit: 20, total: 17 }}
      activeFilterCount={Object.keys(filters).length}
      onFilterChange={onFilterChange}
      onCommitSearch={vi.fn()}
      onClearFilters={onClearFilters}
    />
  );
  return { onFilterChange, onClearFilters };
};

describe('saved view pills', () => {
  it('applies a view when it is not the current one', () => {
    const { onFilterChange, onClearFilters } = setup({} as FilterState);
    fireEvent.click(screen.getByText('Inbox'));
    expect(onFilterChange).toHaveBeenCalledWith('lifecycle', 'open');
    expect(onClearFilters).not.toHaveBeenCalled();
  });

  it('clears when the SAME view is clicked again', () => {
    const { onClearFilters } = setup({ lifecycle: 'open' } as FilterState);
    fireEvent.click(screen.getByText('Inbox'));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('marks the active pill as pressed', () => {
    setup({ lifecycle: 'open' } as FilterState);
    expect(screen.getByText('Inbox').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Mine').closest('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches between views rather than clearing', () => {
    // Inbox is lit; clicking Mine must APPLY Mine, not toggle Inbox off.
    const { onFilterChange, onClearFilters } = setup({ lifecycle: 'open' } as FilterState);
    fireEvent.click(screen.getByText('Mine'));
    expect(onFilterChange).toHaveBeenCalledWith('assigneeId', 'me');
    expect(onClearFilters).not.toHaveBeenCalled();
  });

  it('applies a view key even when that filter has NO options yet', () => {
    // Regression: applyView iterated the SCHEMA, and a select filter with zero options
    // is dropped from the schema — so clicking "Mine" before the assignee list returned
    // applied the lifecycle half and dropped the assignee half, silently.
    options.current = [];
    const { onFilterChange } = setup({} as FilterState);
    fireEvent.click(screen.getByText('Unassigned'));
    expect(onFilterChange).toHaveBeenCalledWith('assigneeId', 'unassigned');
    expect(onFilterChange).toHaveBeenCalledWith('lifecycle', 'open');
  });

  it('clears the keys a view does not name when switching to it', () => {
    // Breached is only slaBreached — the lifecycle carried over from Inbox has to go,
    // or the pill would light up for a state it does not describe.
    const { onFilterChange } = setup({ lifecycle: 'open' } as FilterState);
    fireEvent.click(screen.getByText('Breached'));
    expect(onFilterChange).toHaveBeenCalledWith('slaBreached', true);
    expect(onFilterChange).toHaveBeenCalledWith('lifecycle', 'all');
  });
});
