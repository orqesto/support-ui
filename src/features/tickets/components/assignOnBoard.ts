import type { Ticket } from '@/types';

/**
 * The ticket as the board shows it right after a reassign: the NEW owner's name and photo (never
 * the previous owner's photo beside the new name), until the next fetch brings the server's copy.
 */
export const withNewAssignee = <T extends Ticket>(
  ticket: T,
  userId: number | null,
  assignees: Array<{ id: number; name: string; photoKey?: string | null }>
): T => {
  const owner = userId === null ? undefined : assignees.find((user) => user.id === userId);
  return {
    ...ticket,
    assigneeId: userId,
    assigneeName: owner?.name ?? null,
    assigneePhotoKey: owner?.photoKey ?? null,
  };
};
