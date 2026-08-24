/**
 * When a move is refused, the agent must see the backend's reason — it is the only
 * thing that says WHY (assignee not in target dept, department not served, no
 * permission). That line read `err.response.data.message`, which the api-client
 * interceptor never produces, so every refusal rendered the same
 * "Failed to move the ticket. Please try again." and the agent had nothing to act on.
 *
 * Fixtures come from the real interceptor via `@/test/apiError`.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const moveTicketDepartment = vi.fn<(...args: unknown[]) => Promise<{ assigneeCleared: boolean }>>();
const getAssignableUsers = vi.fn<(...args: unknown[]) => Promise<{ id: number }[]>>();

vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    moveTicketDepartment: (...args: unknown[]) => moveTicketDepartment(...args),
    getAssignableUsers: (...args: unknown[]) => getAssignableUsers(...args),
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 1, name: 'Support', active: true, hasMessageSource: true },
      { id: 2, name: 'Billing', active: true, hasMessageSource: true },
    ],
  }),
}));

import { MoveDepartmentDialog } from '@/components/tickets/MoveDepartmentDialog';
import { useAuthStore } from '@/stores/authStore';
import { apiError, networkError } from '@/test/apiError';
import type { User } from '@/types';

const openAndAttemptMove = () => {
  render(
    <MoveDepartmentDialog
      isOpen
      onClose={vi.fn()}
      ticketId={7}
      currentDepartmentId={1}
      currentAssigneeId={null}
    />
  );
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Move' }));
};

describe('MoveDepartmentDialog — a refused move explains itself', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAssignableUsers.mockResolvedValue([]);
    useAuthStore.setState({
      user: { id: 1, email: 'a@b.co', firstName: 'A', role: 'admin' } as User,
    });
  });
  afterEach(cleanup);

  it("shows the backend's reason instead of a generic failure", async () => {
    moveTicketDepartment.mockRejectedValue(
      await apiError(403, { message: 'You are not a member of the target department.' })
    );
    openAndAttemptMove();
    expect(
      await screen.findByText('You are not a member of the target department.')
    ).toBeInTheDocument();
  });

  it('reads an `error` envelope too — the BE uses both keys', async () => {
    moveTicketDepartment.mockRejectedValue(
      await apiError(409, { error: 'That department is no longer served.' })
    );
    openAndAttemptMove();
    expect(await screen.findByText('That department is no longer served.')).toBeInTheDocument();
  });

  it('falls back to the generic line when there is nothing to say', async () => {
    moveTicketDepartment.mockRejectedValue(await networkError());
    openAndAttemptMove();
    expect(
      await screen.findByText('Failed to move the ticket. Please try again.')
    ).toBeInTheDocument();
  });

  it('never shows a customer-hostile 5xx body to the agent', async () => {
    moveTicketDepartment.mockRejectedValue(
      await apiError(500, { error: 'duplicate key value violates unique constraint "dept_pkey"' })
    );
    openAndAttemptMove();
    expect(
      await screen.findByText('Failed to move the ticket. Please try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/dept_pkey/)).not.toBeInTheDocument();
  });

  it('leaves no error banner on a successful move', async () => {
    moveTicketDepartment.mockResolvedValue({ assigneeCleared: false });
    openAndAttemptMove();
    await waitFor(() => expect(moveTicketDepartment).toHaveBeenCalled());
    expect(screen.queryByText(/Failed to move/)).not.toBeInTheDocument();
  });
});
