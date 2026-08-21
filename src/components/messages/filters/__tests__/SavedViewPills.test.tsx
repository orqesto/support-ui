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

const setup = (filters: FilterState, isKanban = false) => {
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
      isKanban={isKanban}
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

  it('removes only its OWN filters when the same view is clicked again', () => {
    const { onFilterChange, onClearFilters } = setup({
      lifecycle: 'open',
      slaBreached: true,
    } as FilterState);
    fireEvent.click(screen.getByText('Inbox'));
    expect(onFilterChange).toHaveBeenCalledWith('lifecycle', 'all');
    // Breached was on too and is nobody else's business — a blanket clear would take it.
    expect(onFilterChange).not.toHaveBeenCalledWith('slaBreached', false);
    expect(onClearFilters).not.toHaveBeenCalled();
  });

  it('combines with what is already on instead of replacing it', () => {
    const { onFilterChange } = setup({ assigneeId: 'me' } as FilterState);
    fireEvent.click(screen.getByText('Breached'));
    expect(onFilterChange).toHaveBeenCalledWith('slaBreached', true);
    // The whole point: Mine survives. Replacing is what made the pills disagree with
    // the same two filters applied from the menu.
    expect(onFilterChange).not.toHaveBeenCalledWith('assigneeId', 'all');
  });

  it('lights every view whose filters are present', () => {
    setup({ assigneeId: 'me', slaBreached: true } as FilterState);
    const pressed = (name: string) =>
      screen.getByText(name).closest('button')?.getAttribute('aria-pressed');
    expect(pressed('Mine')).toBe('true');
    expect(pressed('Breached')).toBe('true');
    expect(pressed('Unassigned')).toBe('false');
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
  });

  it('keeps offering a view while its options are still loading', () => {
    // Applicability is a question about the MODE, not about load state. Keying it on
    // "is this filter in the schema" would make Mine and Unassigned vanish on first
    // paint and pop back in when the assignee fetch returned.
    options.current = [];
    setup({} as FilterState);
    expect(screen.getByText('Mine')).toBeTruthy();
    expect(screen.getByText('Unassigned')).toBeTruthy();
  });

  // ── kanban ───────────────────────────────────────────────────────────────
  //
  // Every kanban column hard-sets its own `lifecycle`, and a column's filters win over
  // the shared ones — so a lifecycle filter cannot move a card. Offering "Inbox" there
  // lit the pill and changed the header count while the board stayed put.
  it('does not offer a lifecycle-only view on the kanban board', () => {
    setup({} as FilterState, true);
    expect(screen.queryByText('Inbox')).toBeNull();
  });

  it('still offers the views that CAN act on the board', () => {
    setup({} as FilterState, true);
    expect(screen.getByText('Mine')).toBeTruthy();
    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.getByText('Breached')).toBeTruthy();
  });

  it('offers every view in list mode', () => {
    setup({} as FilterState);
    for (const name of ['Inbox', 'Mine', 'Unassigned', 'Breached']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('Mine and Unassigned filter by WHO, without pinning a status', () => {
    const { onFilterChange } = setup({} as FilterState);
    fireEvent.click(screen.getByText('Mine'));
    expect(onFilterChange).toHaveBeenCalledWith('assigneeId', 'me');
    expect(onFilterChange).not.toHaveBeenCalledWith('lifecycle', 'open');
  });

  it('swaps rather than stacks when two views name the same filter', () => {
    // Mine and Unassigned are both assigneeId. The second write overwrites the first,
    // so they exchange rather than fighting.
    const { onFilterChange } = setup({ assigneeId: 'me' } as FilterState);
    fireEvent.click(screen.getByText('Unassigned'));
    expect(onFilterChange).toHaveBeenCalledWith('assigneeId', 'unassigned');
  });
});
