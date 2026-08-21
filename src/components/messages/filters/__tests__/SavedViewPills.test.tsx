/**
 * The saved-view pills. The one behaviour with a wrong answer available: clicking a pill
 * that is already lit. Re-applying the same filters looks like nothing happened, which
 * makes a visibly-active control feel broken — it toggles off instead.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { FilterState } from '@/stores/messagesStore';

// The user's own views come from the API now. Mocked so these tests are about the pills
// rather than about what a request does in jsdom.
const service = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
}));
vi.mock('@/services/savedView.service', () => ({ savedViewService: service }));

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
  service.list.mockReset().mockResolvedValue([]);
  service.save.mockReset();
  service.remove.mockReset().mockResolvedValue(undefined);
  options.current = [
    { value: 'me', label: 'Me' },
    { value: 'unassigned', label: 'Unassigned' },
  ];
});
afterEach(cleanup);

const setup = (filters: FilterState, isKanban = false) => {
  const onFilterChange = vi.fn();
  const onFilterPatch = vi.fn();
  const onClearFilters = vi.fn();
  render(
    <MessageFilterBar
      filters={filters}
      pagination={{ page: 1, limit: 20, total: 17 }}
      activeFilterCount={Object.keys(filters).length}
      onFilterChange={onFilterChange}
      onFilterPatch={onFilterPatch}
      onCommitSearch={vi.fn()}
      onClearFilters={onClearFilters}
      isKanban={isKanban}
    />
  );
  // A view is applied and unapplied as ONE write now — several filters arriving one at a
  // time walked the list through states nobody picked.
  const patched = (): Record<string, unknown> =>
    (onFilterPatch.mock.calls as [Partial<FilterState>][]).reduce<Record<string, unknown>>(
      (acc, [patch]) => ({ ...acc, ...patch }),
      {}
    );
  return { onFilterChange, onFilterPatch, patched, onClearFilters };
};

describe('saved view pills', () => {
  it('applies a view when it is not the current one', () => {
    const { patched, onClearFilters } = setup({} as FilterState);
    fireEvent.click(screen.getByText('Mine'));
    expect(patched()).toEqual({ assigneeId: 'me' });
    expect(onClearFilters).not.toHaveBeenCalled();
  });

  it('removes only its OWN filters when the same view is clicked again', () => {
    const { patched, onClearFilters } = setup({
      assigneeId: 'me',
      slaBreached: true,
    } as FilterState);
    fireEvent.click(screen.getByText('Mine'));
    expect(patched()).toEqual({ assigneeId: 'all' });
    // Breached was on too and is nobody else's business — a blanket clear would take it.
    expect(patched()).not.toHaveProperty('slaBreached');
    expect(onClearFilters).not.toHaveBeenCalled();
  });

  it('combines with what is already on instead of replacing it', () => {
    const { patched } = setup({ assigneeId: 'me' } as FilterState);
    fireEvent.click(screen.getByText('Breached'));
    expect(patched()).toEqual({ slaBreached: true });
    // The whole point: Mine survives. Replacing is what made the pills disagree with
    // the same two filters applied from the menu.
    expect(patched()).not.toHaveProperty('assigneeId');
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
    setup({ assigneeId: 'me' } as FilterState);
    expect(screen.getByText('Mine').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Breached').closest('button')?.getAttribute('aria-pressed')).toBe(
      'false'
    );
  });

  it('switches between views rather than clearing', () => {
    // Breached is lit; clicking Mine must APPLY Mine, not toggle Breached off.
    const { patched, onClearFilters } = setup({ slaBreached: true } as FilterState);
    fireEvent.click(screen.getByText('Mine'));
    expect(patched()).toEqual({ assigneeId: 'me' });
    expect(onClearFilters).not.toHaveBeenCalled();
  });

  it('applies a view key even when that filter has NO options yet', () => {
    // Regression: applyView iterated the SCHEMA, and a select filter with zero options
    // is dropped from the schema — so clicking "Mine" before the assignee list returned
    // applied the lifecycle half and dropped the assignee half, silently.
    options.current = [];
    const { patched } = setup({} as FilterState);
    fireEvent.click(screen.getByText('Unassigned'));
    expect(patched()).toEqual({ assigneeId: 'unassigned' });
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
  it('still offers the views that CAN act on the board', () => {
    setup({} as FilterState, true);
    expect(screen.getByText('Mine')).toBeTruthy();
    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.getByText('Breached')).toBeTruthy();
  });

  it('offers every view in list mode', () => {
    setup({} as FilterState);
    for (const name of ['Mine', 'Unassigned', 'Breached']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('Mine and Unassigned filter by WHO, without pinning a status', () => {
    const { patched } = setup({} as FilterState);
    fireEvent.click(screen.getByText('Mine'));
    expect(patched()).toEqual({ assigneeId: 'me' });
    expect(patched()).not.toHaveProperty('lifecycle');
  });

  it('swaps rather than stacks when two views name the same filter', () => {
    // Mine and Unassigned are both assigneeId. The second write overwrites the first,
    // so they exchange rather than fighting.
    const { patched } = setup({ assigneeId: 'me' } as FilterState);
    fireEvent.click(screen.getByText('Unassigned'));
    expect(patched()).toEqual({ assigneeId: 'unassigned' });
  });
});

// ── the user's own views, on the account ─────────────────────────────────────
describe('saved views belong to the person, not the browser', () => {
  const openNameField = () => fireEvent.click(screen.getByText('Save as view'));

  const nameAndSave = (name: string) => {
    openNameField();
    fireEvent.change(screen.getByLabelText('Name this view'), { target: { value: name } });
    fireEvent.click(screen.getByText('Save'));
  };

  it('saves a named view through the API', async () => {
    service.save.mockResolvedValue({
      id: 3,
      name: 'VIP',
      filters: { priority: 'critical' },
      createdAt: '',
      updatedAt: '',
    });
    setup({ priority: 'critical' } as FilterState);
    await waitFor(() => expect(service.list).toHaveBeenCalled());

    nameAndSave('VIP');

    expect(service.save).toHaveBeenCalledWith('VIP', { priority: 'critical' });
    expect(await screen.findByText('VIP')).toBeTruthy();
  });

  it('deletes one through the API', async () => {
    service.list.mockResolvedValue([
      { id: 3, name: 'VIP', filters: { priority: 'critical' }, createdAt: '', updatedAt: '' },
    ]);
    setup({ priority: 'critical' } as FilterState);
    await screen.findByText('VIP');

    fireEvent.click(screen.getByLabelText('Delete view VIP'));

    await waitFor(() => expect(service.remove).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByText('VIP')).toBeNull());
  });

  it('keeps the pill when the delete failed', async () => {
    // The row is still there. Removing the pill would show a delete that did not happen
    // and bring it back on the next load.
    service.list.mockResolvedValue([
      { id: 3, name: 'VIP', filters: { priority: 'critical' }, createdAt: '', updatedAt: '' },
    ]);
    service.remove.mockRejectedValue(new Error('500'));
    setup({ priority: 'critical' } as FilterState);
    await screen.findByText('VIP');

    fireEvent.click(screen.getByLabelText('Delete view VIP'));

    expect(await screen.findByText(/could not be deleted/)).toBeTruthy();
    expect(screen.getByText('VIP')).toBeTruthy();
  });

  it('says so when it is falling back to this browser', async () => {
    // The window where this frontend is live and the endpoint is not. The views still
    // work; they just will not be on the next machine, and that is worth saying.
    service.list.mockRejectedValue(new Error('404'));
    localStorage.setItem(
      'odly-inbox-saved-views',
      JSON.stringify([{ name: 'Local', filters: { priority: 'high' } }])
    );
    setup({ priority: 'high' } as FilterState);

    expect(await screen.findByText(/on this device only/)).toBeTruthy();
    expect(screen.getByText('Local')).toBeTruthy();
  });

  it('writes to this browser when there is no endpoint', async () => {
    service.list.mockRejectedValue(new Error('404'));
    setup({ priority: 'high' } as FilterState);
    await waitFor(() => expect(service.list).toHaveBeenCalled());

    nameAndSave('Local only');

    expect(service.save).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem('odly-inbox-saved-views') ?? '[]') as {
      name: string;
    }[];
    expect(stored.map((view) => view.name)).toEqual(['Local only']);
  });
});
