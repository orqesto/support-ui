/**
 * Mentors (1.1.330) in the bulk Assign picker: working agents, then a "Mentors" section; a mentor
 * can still be picked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { listOptions } from '@/test/chooseOption';

const svc = vi.hoisted(() => ({ users: [] as object[] }));
vi.mock('@/services/assignment.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assignmentService: { getAssignableUsers: () => Promise.resolve(svc.users) },
}));

import { BulkConfirmDialog } from '../BulkConfirmDialog';

const renderAssign = (onConfirm = vi.fn()) => {
  render(
    <BulkConfirmDialog
      open
      action="assign"
      preview={{ eligible: [1, 2], refused: [] } as never}
      selectedCount={2}
      running={false}
      onOpenChange={() => undefined}
      onConfirm={onConfirm}
    />
  );
  return onConfirm;
};

afterEach(cleanup);

describe('bulk Assign — mentors', () => {
  it('lists working agents, then Mentors; picking a mentor assigns them', async () => {
    svc.users = [
      { id: 9, firstName: 'Mia', lastName: 'Mentor', isMentor: true },
      { id: 7, firstName: 'Ada', lastName: 'Agent', isMentor: false },
    ];
    const onConfirm = renderAssign();
    expect(await listOptions(screen.getByLabelText('Assign to'))).toEqual([
      'Nobody (unassign)',
      'Ada Agent',
      'Mia Mentor',
    ]);
    const heading = screen.getByText('Mentors');
    const mentor = screen.getByRole('option', { name: 'Mia Mentor' });
    expect(heading.compareDocumentPosition(mentor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(mentor);
    fireEvent.click(screen.getByRole('button', { name: /^Assign 2$/ }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: 9 }));
  });

  it('control: no mentors ⇒ no section heading', async () => {
    svc.users = [{ id: 7, firstName: 'Ada', lastName: 'Agent', isMentor: false }];
    renderAssign();
    expect(await listOptions(screen.getByLabelText('Assign to'))).toEqual([
      'Nobody (unassign)',
      'Ada Agent',
    ]);
    expect(screen.queryByText('Mentors')).toBeNull();
  });
});
