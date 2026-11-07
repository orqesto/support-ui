/**
 * KB soft delete + Restore (BE #1400, owner 2026-11-07). A person's delete keeps the entry 90 days:
 * the 'Deleted' filter lists it with who and when, and Restore is its only action. On a backend
 * whose delete is still for good (no `filters.deletedStatus`) nothing of this is offered, and the
 * delete dialog keeps saying it cannot be undone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KBEntry } from '@/services/kb.service';
import { KbStatusFilter } from '../KbStatusFilter';
import { KBDeleteDialog } from '../KBDeleteDialog';
import { KBStatusBadge } from '../KBStatusBadge';

vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
const { KBTableView } = await import('../KBTableView');
const { KBEntryCard } = await import('../KBEntryCard');

afterEach(cleanup);

const entry = (over: Partial<KBEntry> = {}): KBEntry => ({
  id: 11,
  type: 'qa_pair',
  title: 'Q: How do I change my delivery address?',
  content: 'Question: How do I change my delivery address?\n\nAnswer: In your account settings.',
  category: 'support',
  departmentId: null,
  qualityScore: 0.8,
  approved: true,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-10-14T09:00:00.000Z',
  sourceDeleted: false,
  ...over,
});
const deleted = entry({
  approved: false,
  hidden: true,
  deletedAt: '2026-11-07T09:00:00.000Z',
  deletedBy: 4,
  deletedByName: 'Sam Moderator',
});

const renderTable = (rows: KBEntry[], onRestoreDeleted = vi.fn(), onDelete = vi.fn()) => {
  render(
    <MemoryRouter>
      <KBTableView
        entries={rows}
        loading={false}
        canReview
        onView={vi.fn()}
        onApprove={vi.fn()}
        onHide={vi.fn()}
        onUnhide={vi.fn()}
        onReject={vi.fn()}
        onDelete={onDelete}
        onRestoreDeleted={onRestoreDeleted}
      />
    </MemoryRouter>
  );
  return within(screen.getByTestId('kb-row-actions'));
};

describe('KB soft delete', () => {
  it('offers Deleted only on a backend whose delete is soft', () => {
    render(<KbStatusFilter value="approved" onChange={() => {}} softDelete />);
    expect(screen.getByRole('button', { name: 'Deleted' })).toBeInTheDocument();
    cleanup();
    // CONTROL: an older backend deletes for good — nothing to list or restore.
    render(<KbStatusFilter value="approved" onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Deleted' })).toBeNull();
  });

  it('a deleted row offers Restore and nothing else that writes', () => {
    const onRestoreDeleted = vi.fn();
    const actions = renderTable([deleted], onRestoreDeleted);
    expect(actions.getByRole('button', { name: 'View details' })).toBeInTheDocument();
    for (const name of ['Delete', 'Approve', 'Hide', 'Unhide', 'Reject', 'Approve again'])
      expect(actions.queryByRole('button', { name })).toBeNull();
    fireEvent.click(actions.getByRole('button', { name: 'Restore' }));
    expect(onRestoreDeleted).toHaveBeenCalledWith(deleted);
  });

  it('control: a live row keeps Delete and has no Restore', () => {
    const actions = renderTable([entry()]);
    expect(actions.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(actions.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('the mobile card of a deleted row has Restore and no Delete', () => {
    const onRestoreDeleted = vi.fn();
    render(
      <MemoryRouter>
        <KBEntryCard
          entry={deleted}
          canReview
          onView={vi.fn()}
          onApprove={vi.fn()}
          onHide={vi.fn()}
          onUnhide={vi.fn()}
          onReject={vi.fn()}
          onDelete={vi.fn()}
          onRestoreDeleted={onRestoreDeleted}
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Restore/ }));
    expect(onRestoreDeleted).toHaveBeenCalledWith(deleted);
  });

  it('the status says Deleted, with who deleted it', () => {
    render(<KBStatusBadge entry={deleted} compact />);
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getByText(/Sam Moderator/)).toBeInTheDocument();
    // Not mistaken for a hand-hidden entry.
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('the delete dialog says it can be restored only where it can', () => {
    const props = {
      open: true,
      onOpenChange: () => {},
      entry: entry(),
      deleting: false,
      onConfirm: () => {},
    };
    render(<KBDeleteDialog {...props} restorable />);
    expect(screen.getByText(/restore it from Deleted for 90 days/)).toBeInTheDocument();
    expect(screen.queryByText(/cannot be undone/)).toBeNull();
    cleanup();
    // CONTROL: an older backend deletes for good, and the dialog says so.
    render(<KBDeleteDialog {...props} />);
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });
});
