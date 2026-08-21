/**
 * The expanded filters panel used to run ~730px tall — a full viewport — so the thread
 * list started below the fold. The height came from three uppercase section headers, a
 * label stacked above every control, rigid 4-column grid rows, and a full-width COLLAPSE
 * bar duplicating the header chevron.
 *
 * These assert the SHAPE, not the pixels: no headers, no second collapse control, and —
 * the part worth protecting — every filter still reachable after the grids were dissolved
 * into a wrapping row with `contents`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { FilterState } from '@/stores/messagesStore';

vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/hooks/useDepartments', () => ({ useDepartments: () => ({ data: [] }) }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => 'all' }));
vi.mock('@/hooks/useFilterPanel', () => ({
  useFilterPanel: () => ({ showAdvancedFilters: false, toggleAdvancedFilters: vi.fn() }),
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getIntegrations: () => Promise.resolve([]) },
}));
vi.mock('@/services/settings.service', () => ({ labelService: { getLabels: () => Promise.resolve([]) } }));
vi.mock('@/components/filters/AssigneeFilter', () => ({ AssigneeFilter: () => <div>assignee</div> }));
vi.mock('./ReceivedAtFilter', () => ({ ReceivedAtFilter: () => null }));

const { MessageFilters } = await import('../MessageFilters');

afterEach(cleanup);

const filters = { slaBreached: false, slaAtRisk: false, hasAttachments: false } as FilterState;

/** Renders and OPENS the panel — it starts collapsed, and collapsed is not what
 *  these assertions are about. */
const renderPanel = () => {
  const view = renderClosed();
  fireEvent.click(screen.getByLabelText('Expand filters'));
  return view;
};

const renderClosed = () =>
  render(
    <MessageFilters
      filters={filters}
      pendingSearch=""
      activeFilterCount={0}
      pagination={{ page: 1, limit: 20, total: 17 }}
      onFilterChange={vi.fn()}
      onSearch={vi.fn()}
      onSearchBlur={vi.fn()}
      onClearFilters={vi.fn()}
      setPendingSearch={vi.fn()}
    />
  );

describe('MessageFilters — the compact panel', () => {
  it('drops the uppercase section headers', () => {
    renderPanel();
    for (const header of ['CHANNEL', 'QUEUE', 'TAGS']) {
      expect(screen.queryByText(header)).toBeNull();
    }
  });

  it('keeps exactly ONE collapse control — the header chevron', () => {
    renderPanel();
    expect(screen.getAllByLabelText(/collapse filters/i)).toHaveLength(1);
  });

  it('still renders every filter after the grids were dissolved', () => {
    renderPanel();
    // `contents` on a wrapper is easy to get wrong in a way that drops children from
    // layout while leaving them in the tree, so assert each label is really present.
    for (const label of ['Status', 'Queue', 'Read', 'Priority', 'Assignee', 'AI State', 'Linked']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('keeps the SLA and attachment pills', () => {
    renderPanel();
    expect(screen.getByText('SLA Breach')).toBeTruthy();
    expect(screen.getByText('SLA At Risk')).toBeTruthy();
    expect(screen.getByText('Has Attachments')).toBeTruthy();
  });

  it('drops the redundant empty-state line while the controls are on screen', () => {
    renderPanel();
    expect(screen.queryByText(/No filters applied/)).toBeNull();
  });

  // Control: collapsed, the line is the only thing telling you nothing is filtered,
  // so it must still be there.
  it('keeps the empty-state line while collapsed', () => {
    renderClosed();
    expect(screen.getByText(/No filters applied/)).toBeTruthy();
  });
});
