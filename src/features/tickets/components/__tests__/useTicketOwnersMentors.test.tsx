/**
 * Mentors (1.1.330) in the New ticket Owner picker: a mentor's option carries the "Mentors"
 * section (the Select lists it after the working agents); a working agent's carries none.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/services/assignment.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assignmentService: {
    getAssignableUsers: () =>
      Promise.resolve([
        { id: 1, firstName: 'Mia', lastName: 'Mentor', email: 'mia@example.com', isMentor: true },
        { id: 2, firstName: 'Ada', lastName: 'Agent', email: 'ada@example.com', isMentor: false },
        { id: 3, firstName: 'Ben', lastName: 'Agent', email: 'ben@example.com' },
      ]),
  },
}));

const { useTicketOwners } = await import('../useTicketOwners');

describe('useTicketOwners — mentors', () => {
  it('a mentor is offered under Mentors; agents (and an older backend’s rows) are not', async () => {
    const { result } = renderHook(() => useTicketOwners(''));
    await waitFor(() => expect(result.current.ownersLoaded).toBe(true));
    expect(result.current.owners).toEqual([
      { value: '1', label: 'Mia Mentor', group: 'Mentors' },
      { value: '2', label: 'Ada Agent' },
      { value: '3', label: 'Ben Agent' },
    ]);
  });
});
