/**
 * Mentors (1.1.330) in the ticket list's Assign / Re-assign menu: working agents, then a
 * "Mentors" section; a mentor can still be picked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Ticket } from '@/types';
import { AssigneeCell } from '../AssigneeCell';

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));

afterEach(cleanup);

const ticket = {
  id: 1182,
  title: 'Checkout fails',
  status: 'open',
  priority: 'high',
  categoryId: null,
  assigneeId: 7,
  assigneeName: 'Robin Example',
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T19:00:00Z',
} as unknown as Ticket;

const openMenu = (assignees: Array<{ id: number; name: string; isMentor?: boolean }>) => {
  const onAssign = vi.fn();
  render(
    <AssigneeCell ticket={ticket} canManage assignees={assignees} currentUserId={9} onAssign={onAssign} />
  );
  fireEvent.click(screen.getByRole('button', { name: /^Re-assign/ }));
  return onAssign;
};
const items = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'));
// The avatar's initials come first in the item's text; the name is the rest.
const NAMES = ['Robin Example', 'Ada Agent', 'Mia Mentor', 'Unassign'];
const itemNames = () =>
  items().map((item) => NAMES.find((name) => item.textContent?.endsWith(name)) ?? item.textContent);

describe('ticket list assign menu — mentors', () => {
  it('working agents first, then Mentors; a mentor can be picked', () => {
    const onAssign = openMenu([
      { id: 3, name: 'Mia Mentor', isMentor: true },
      { id: 7, name: 'Robin Example', isMentor: false },
      { id: 8, name: 'Ada Agent' },
    ]);
    expect(itemNames()).toEqual(['Robin Example', 'Ada Agent', 'Mia Mentor', 'Unassign']);
    const heading = screen.getByText('Mentors');
    const mentor = items().find((item) => item.textContent?.includes('Mia Mentor'));
    if (!mentor) throw new Error('no mentor item');
    expect(heading.compareDocumentPosition(mentor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(mentor);
    expect(onAssign).toHaveBeenCalledWith(1182, 3);
  });

  it('control: no mentors ⇒ no Mentors heading, the list order kept', () => {
    openMenu([
      { id: 8, name: 'Ada Agent' },
      { id: 7, name: 'Robin Example' },
    ]);
    expect(itemNames()).toEqual(['Ada Agent', 'Robin Example', 'Unassign']);
    expect(screen.queryByText('Mentors')).toBeNull();
  });
});
