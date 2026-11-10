import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { chooseOption } from '@/test/chooseOption';

const assignThread = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    getAssignableUsers: () =>
      Promise.resolve([{ id: 8, firstName: 'Ben', lastName: null, role: 'user', eligible: true }]),
    assignThread,
    assignMessage: vi.fn(),
    assignTicket: vi.fn(),
  },
}));

const { AssignmentSelect } = await import('../AssignmentSelect');

beforeEach(() => assignThread.mockClear());

describe('AssignmentSelect beforeChange (thread presence confirm)', () => {
  it('the assign waits for the guard: nothing is written until `run` is called', async () => {
    let pending: (() => void) | null = null;
    render(
      <AssignmentSelect
        type="thread"
        itemId="conv_41"
        currentAssigneeId={null}
        beforeChange={(run) => {
          pending = run;
        }}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Assignee' })).not.toBeInactive()
    );
    await chooseOption(screen.getByRole('combobox', { name: 'Assignee' }), /Ben/);
    expect(assignThread).not.toHaveBeenCalled();
    expect(pending).not.toBeNull();
    (pending as unknown as () => void)();
    await waitFor(() => expect(assignThread).toHaveBeenCalledWith('conv_41', 8));
  });

  it('without a guard the assign runs at once', async () => {
    render(<AssignmentSelect type="thread" itemId="conv_41" currentAssigneeId={null} />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Assignee' })).not.toBeInactive()
    );
    await chooseOption(screen.getByRole('combobox', { name: 'Assignee' }), /Ben/);
    await waitFor(() => expect(assignThread).toHaveBeenCalledWith('conv_41', 8));
  });
});
