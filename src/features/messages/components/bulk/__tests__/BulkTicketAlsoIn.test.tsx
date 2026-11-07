import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * Bulk "Create one ticket" (2026-09-30): a thread already on a ticket is no longer refused — it
 * joins the new ticket too — and the agent is told BEFORE confirming, not surprised after.
 */
vi.mock('@/services/assignment.service', () => ({
  assignmentService: { getAssignableUsers: () => Promise.resolve([]) },
}));

import { BulkConfirmDialog } from '../BulkConfirmDialog';

afterEach(cleanup);

const renderDialog = (preview: Record<string, unknown>) =>
  render(
    <BulkConfirmDialog
      open
      action="create_ticket"
      preview={preview as never}
      selectedCount={3}
      running={false}
      onOpenChange={() => undefined}
      onConfirm={() => undefined}
    />
  );

describe('bulk create ticket — threads already on a ticket', () => {
  it('says how many will be on both', () => {
    renderDialog({ eligible: [1, 2, 3], refused: [], alsoInTicket: [1, 3] });
    expect(screen.getByText('2 of them are already on another ticket — they will be on both.')).toBeInTheDocument();
  });

  it('singular', () => {
    renderDialog({ eligible: [1, 2], refused: [], alsoInTicket: [2] });
    expect(screen.getByText('1 of them is already on another ticket — it will be on both.')).toBeInTheDocument();
  });

  it('says nothing when none are — and an older backend (no field) does not crash it', () => {
    renderDialog({ eligible: [1, 2], refused: [] });
    expect(screen.queryByText(/already on another ticket/)).not.toBeInTheDocument();
  });
});
