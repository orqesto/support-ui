import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { KBEntry } from '@/services/kb.service';

const toastSuccess = vi.fn<(message: string) => void>();
const toastError = vi.fn<(message: string) => void>();
vi.mock('@/lib/toast', () => ({
  toast: {
    success: (message: string) => toastSuccess(message),
    error: (message: string) => toastError(message),
  },
}));

vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));

const { KbBulkDecisionBar, describeBulkOutcome } = await import('../KbBulkDecisionBar');
const { KBTableView } = await import('../KBTableView');

const nothing = () => Promise.resolve({ done: 0, skipped: 0, failed: 0 });
const makeBulk = (over: Record<string, unknown> = {}) => ({
  selected: new Set<number>(),
  toggle: vi.fn(),
  clear: () => {},
  busy: false,
  selectableIds: [1, 2],
  selectable: () => true,
  captureCount: 0,
  removeCount: 0,
  approveSelected: vi.fn(nothing),
  rejectSelected: vi.fn(nothing),
  removeSelected: vi.fn(nothing),
  ...over,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KbBulkDecisionBar', () => {
  it('is hidden below md, like the checkbox table it acts on', () => {
    render(<KbBulkDecisionBar bulk={makeBulk()} mode="needs_decision" />);
    const bar = screen.getByText('Select all (2)').closest('div.hidden');
    expect(bar).not.toBeNull();
    expect(bar).toHaveClass('md:flex');
  });

  it('shows nothing when no row on the page can be selected', () => {
    const { container } = render(
      <KbBulkDecisionBar bulk={makeBulk({ selectableIds: [] })} mode="needs_decision" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('Select all ticks every selectable row', () => {
    const bulk = makeBulk();
    render(<KbBulkDecisionBar bulk={bulk} mode="needs_decision" />);
    fireEvent.click(screen.getByLabelText('Select all (2)'));
    expect(bulk.toggle).toHaveBeenCalledWith(1, true);
    expect(bulk.toggle).toHaveBeenCalledWith(2, true);
  });

  it('nothing selected: every action is disabled', () => {
    render(<KbBulkDecisionBar bulk={makeBulk()} mode="needs_decision" />);
    expect(screen.getByRole('button', { name: 'Approve selected (0)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject selected (0)' })).toBeDisabled();
  });

  it('Approve runs at once and reports the outcome', async () => {
    const bulk = makeBulk({
      selected: new Set([1, 2]),
      captureCount: 2,
      approveSelected: vi.fn(() => Promise.resolve({ done: 2, skipped: 0, failed: 0 })),
    });
    render(<KbBulkDecisionBar bulk={bulk} mode="needs_decision" />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve selected (2)' }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Approved 2'));
    expect(bulk.approveSelected).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Reject asks first: Cancel rejects nothing, Reject rejects', async () => {
    const bulk = makeBulk({
      selected: new Set([1]),
      captureCount: 1,
      rejectSelected: vi.fn(() => Promise.resolve({ done: 0, skipped: 0, failed: 1 })),
    });
    render(<KbBulkDecisionBar bulk={bulk} mode="needs_decision" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject selected (1)' }));
    expect(screen.getByText('1 selected entry will be rejected.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bulk.rejectSelected).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reject selected (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(bulk.rejectSelected).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Rejected 0 · 1 failed'));
  });

  it('Suggested change offers only Remove, behind the same confirmation', async () => {
    const bulk = makeBulk({ selected: new Set([1, 2]), removeCount: 2 });
    render(<KbBulkDecisionBar bulk={bulk} mode="suggested_change" />);
    expect(screen.queryByRole('button', { name: /Approve selected/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected (2)' }));
    expect(bulk.removeSelected).not.toHaveBeenCalled();
    expect(
      screen.getByText('2 selected entries will be removed from the knowledge base.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(bulk.removeSelected).toHaveBeenCalledTimes(1));
  });

  it('a thrown bulk call says it failed and that the list was refreshed', async () => {
    const bulk = makeBulk({
      selected: new Set([1]),
      captureCount: 1,
      approveSelected: vi.fn(() => Promise.reject(new Error('network'))),
    });
    render(<KbBulkDecisionBar bulk={bulk} mode="needs_decision" />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve selected (1)' }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Approved failed — the list was refreshed')
    );
  });
});

describe('describeBulkOutcome', () => {
  it('names every part that is not zero, and drops the zero parts', () => {
    expect(describeBulkOutcome('Approved', { done: 3, skipped: 1, failed: 1 })).toBe(
      'Approved 3 · 1 already decided elsewhere · 1 failed'
    );
    expect(describeBulkOutcome('Removed', { done: 2, skipped: 0, failed: 0 })).toBe('Removed 2');
    expect(describeBulkOutcome('Rejected', { done: 0, skipped: 2, failed: 0 })).toBe(
      'Rejected 0 · 2 already decided elsewhere'
    );
  });
});

describe('KBTableView checkbox column', () => {
  const row = (id: number, title: string): KBEntry =>
    ({
      id,
      title,
      content: 'Example answer.',
      type: 'qa_pair',
      category: 'general',
      qualityScore: 0.9,
      usageCount: 0,
      approved: false,
      hidden: false,
      pendingDecision: null,
      otherPendingDecisions: 0,
    }) as unknown as KBEntry;
  const renderTable = (selection?: Parameters<typeof KBTableView>[0]['selection']) =>
    render(
      <KBTableView
        entries={[row(1, 'Selectable answer'), row(2, 'Not selectable answer')]}
        loading={false}
        onView={() => {}}
        onApprove={() => {}}
        onHide={() => {}}
        onUnhide={() => {}}
        onReject={() => {}}
        onDelete={() => {}}
        canReview
        selection={selection}
      />
    );

  it('gives a checkbox only to rows the bulk action can take, and ticking one toggles it', () => {
    const toggle = vi.fn();
    renderTable({ selected: new Set([1]), toggle, selectable: (entry) => entry.id === 1 });
    const box = screen.getByLabelText('Select Selectable answer');
    expect(box).toBeChecked();
    expect(screen.queryByLabelText('Select Not selectable answer')).toBeNull();
    fireEvent.click(box);
    expect(toggle).toHaveBeenCalledWith(1, false);
  });

  it('no selection: no checkbox column at all', () => {
    renderTable();
    const table = screen.getByRole('table');
    expect(within(table).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(table).queryByRole('columnheader', { name: 'Select' })).toBeNull();
  });
});
