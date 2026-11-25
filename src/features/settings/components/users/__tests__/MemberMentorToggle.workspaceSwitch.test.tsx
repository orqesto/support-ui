/**
 * Review 1.1.330 F3: a mentor save that answers after the admin switched workspace must not write
 * its mark into the NEW workspace's Members list — user ids are global, so the same member can be
 * a row there too, where they are not a mentor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@/types';
import { useAuthStore } from '@/stores/authStore';

const setMentor = vi.fn();
vi.mock('@/services/user.service', () => ({
  userService: { setMentor: (...args: unknown[]) => setMentor(...args) as unknown },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { MemberMentorToggle } = await import('../MemberMentorToggle');
const { useUsersStore } = await import('../../../stores/usersStore');

const member = {
  id: 7,
  email: 'agent@example.test',
  firstName: 'Ann',
  lastName: 'Agent',
  isMentor: false,
} as User;

const deferredSave = () => {
  let answer: (value: { isMentor: boolean; openAssigned: number }) => void = () => undefined;
  setMentor.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  return (value: { isMentor: boolean; openAssigned: number }) => answer(value);
};

beforeEach(() => {
  setMentor.mockReset();
  useAuthStore.setState({ selectedOrganizationId: 1 });
  useUsersStore.getState().setUsers([member]);
});
afterEach(() => {
  cleanup();
  useAuthStore.setState({ selectedOrganizationId: null });
  useUsersStore.getState().setUsers([]);
});

const mentorIn = () => useUsersStore.getState().users.find((row) => row.id === 7)?.isMentor;

describe('MemberMentorToggle — a save that lands after a workspace switch (F3)', () => {
  it('does not write the mark into the other workspace’s list', async () => {
    const answer = deferredSave();
    render(<MemberMentorToggle user={member} canEdit />);
    fireEvent.click(screen.getByRole('switch', { name: 'Mentor: Ann Agent' }));
    await waitFor(() => expect(setMentor).toHaveBeenCalledWith(7, true));
    // The admin switches workspace; that workspace's list has the same member, not a mentor.
    useAuthStore.setState({ selectedOrganizationId: 2 });
    useUsersStore.getState().setUsers([{ ...member }]);
    answer({ isMentor: true, openAssigned: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mentorIn()).toBe(false);
  });

  it('control: in the same workspace the stored mark goes into the list', async () => {
    const answer = deferredSave();
    render(<MemberMentorToggle user={member} canEdit />);
    fireEvent.click(screen.getByRole('switch', { name: 'Mentor: Ann Agent' }));
    await waitFor(() => expect(setMentor).toHaveBeenCalledWith(7, true));
    answer({ isMentor: true, openAssigned: 0 });
    await waitFor(() => expect(mentorIn()).toBe(true));
  });
});
