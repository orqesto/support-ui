/**
 * Mentors (1.1.330) in the ticket / thread assignee picker: working agents first, then a "Mentors"
 * section. Mentors are never routed to but stay pickable by hand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { listOptions } from '@/test/chooseOption';

const svc = vi.hoisted(() => ({ users: [] as object[], assignTicket: vi.fn(() => Promise.resolve()) }));
vi.mock('@/services/assignment.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assignmentService: {
    getAssignableUsers: () => Promise.resolve(svc.users),
    assignThread: vi.fn(),
    assignMessage: vi.fn(),
    assignTicket: svc.assignTicket,
  },
}));

const { AssignmentSelect } = await import('../AssignmentSelect');

const user = (id: number, firstName: string, isMentor: boolean) => ({
  id,
  firstName,
  lastName: 'Example',
  email: `${firstName.toLowerCase()}@example.com`,
  role: 'user',
  eligible: true,
  isMentor,
});

const openPicker = async () => {
  render(<AssignmentSelect type="ticket" itemId={5} currentAssigneeId={null} />);
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Assignee' })).not.toBeInactive()
  );
  return screen.getByRole('combobox', { name: 'Assignee' });
};

beforeEach(() => svc.assignTicket.mockClear());

describe('AssignmentSelect — mentors', () => {
  it('lists working agents, then the Mentors section; a mentor can still be picked', async () => {
    svc.users = [user(1, 'Mia', true), user(2, 'Ada', false), user(3, 'Ben', false)];
    const options = await listOptions(await openPicker());
    expect(options).toEqual([
      'Unassigned',
      'Ada Example (user)',
      'Ben Example (user)',
      'Mia Example (user)',
    ]);
    const heading = screen.getByText('Mentors');
    const mentor = screen.getByRole('option', { name: 'Mia Example (user)' });
    expect(heading.compareDocumentPosition(mentor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(mentor);
    await waitFor(() => expect(svc.assignTicket).toHaveBeenCalledWith(5, 1));
  });

  it('control: nobody is a mentor (or an older backend) ⇒ no section, the server’s order', async () => {
    svc.users = [user(1, 'Mia', false), user(2, 'Ada', false)];
    const options = await listOptions(await openPicker());
    expect(options).toEqual(['Unassigned', 'Mia Example (user)', 'Ada Example (user)']);
    expect(screen.queryByText('Mentors')).toBeNull();
  });
});
