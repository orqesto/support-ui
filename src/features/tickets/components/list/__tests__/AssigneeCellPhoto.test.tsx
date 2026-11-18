/**
 * Ticket rows show the assignee's profile photo in the avatar circle, from the key the ticket
 * list sends beside the name; with none, the same coloured initials as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Ticket } from '@/types';
import { userPhotoUrl } from '@/components/ui/UserPhoto';
import { AssigneeCell } from '../AssigneeCell';
import { Avatar } from '../ticketRowBits';

vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'TES' }));

afterEach(cleanup);

const ticket = (over: Partial<Ticket>): Ticket =>
  ({
    id: 1182,
    title: 'Checkout fails',
    status: 'open',
    priority: 'high',
    categoryId: null,
    assigneeId: 7,
    assigneeName: 'Robin Example',
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T19:00:00Z',
    ...over,
  }) as Ticket;

const cell = (item: Ticket, listKey: string | null = 'k-robin') =>
  render(
    <AssigneeCell
      ticket={item}
      canManage
      assignees={[{ id: 7, name: 'Robin Example', photoKey: listKey }]}
      currentUserId={9}
      onAssign={vi.fn()}
    />
  );

describe('ticket assignee photo', () => {
  it('shows the assignee photo from the ticket row key', () => {
    cell(ticket({ assigneePhotoKey: 'k-robin' }));
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('k-robin'));
  });

  it('an older backend without the row key: the assignee list key is used', () => {
    // An older API leaves the field out entirely.
    const older = ticket({});
    delete (older as { assigneePhotoKey?: unknown }).assigneePhotoKey;
    cell(older);
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('k-robin'));
  });

  it('the server saying null (no visible photo) wins over a list key (F6)', () => {
    cell(ticket({ assigneePhotoKey: null }), 'k-robin');
    expect(document.querySelector('img')).toBeNull();
  });

  it('control: no key anywhere, the coloured initials as before', () => {
    cell(ticket({ assigneePhotoKey: null }), null);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getAllByText('RE').length).toBeGreaterThan(0);
  });

  it('the picker avatar takes a key too', () => {
    render(<Avatar id={7} name="Robin Example" photoKey="k-robin" />);
    expect(document.querySelector('img')?.getAttribute('src')).toBe(userPhotoUrl('k-robin'));
  });

  it('the avatar circle is clipped so the photo stays round', () => {
    render(<Avatar id={7} name="Robin Example" photoKey="k-robin" />);
    expect(document.querySelector('img')?.parentElement?.className).toMatch(/overflow-hidden/);
  });
});
