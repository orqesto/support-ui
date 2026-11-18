/** Reassigning on the ticket board shows the NEW owner's name and photo at once. */
import { describe, expect, it } from 'vitest';
import type { Ticket } from '@/types';
import { withNewAssignee } from '../assignOnBoard';

const ticket = {
  id: 1,
  assigneeId: 7,
  assigneeName: 'Robin Example',
  assigneePhotoKey: 'k-robin',
} as Ticket;
const assignees = [
  { id: 7, name: 'Robin Example', photoKey: 'k-robin' },
  { id: 8, name: 'Sam Sample', photoKey: 'k-sam' },
  { id: 9, name: 'No Photo', photoKey: null },
];

describe('withNewAssignee', () => {
  it('takes the new owner’s name and photo', () => {
    expect(withNewAssignee(ticket, 8, assignees)).toMatchObject({
      assigneeId: 8,
      assigneeName: 'Sam Sample',
      assigneePhotoKey: 'k-sam',
    });
  });

  it('never keeps the previous owner’s photo', () => {
    expect(withNewAssignee(ticket, 9, assignees).assigneePhotoKey).toBeNull();
    expect(withNewAssignee(ticket, null, assignees)).toMatchObject({
      assigneeId: null,
      assigneeName: null,
      assigneePhotoKey: null,
    });
  });
});
