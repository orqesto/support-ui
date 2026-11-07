import type { MessageThread } from '@/services/message.service';

const DONE = new Set(['resolved', 'closed']);
const words = (status: string) => status.replace('_', ' ');

/**
 * The list/kanban ticket chip. A thread may be on several tickets (2026-09-30), and the backend
 * sends the count plus ONE status: the newest ticket that is not done, else the newest.
 *
 * ⛔ Every sentence here must stay true in each state that pair can describe. With one status for
 * several tickets, "Ticket · resolved" would claim ALL are resolved when only the headline is —
 * so for several tickets the headline is named for what it is ("newest open"), and a DONE
 * headline means every ticket is done (the backend prefers a live one whenever there is one).
 */
export const ticketChip = (
  thread: Pick<MessageThread, 'hasTicket' | 'linkedTicketStatus' | 'ticketCount'>,
  externalKey: string | null
): { label: string; tooltip: string } | null => {
  // An older backend sends no count: one ticket if it says there is one.
  const count = thread.ticketCount ?? (thread.hasTicket ? 1 : 0);
  if (count <= 0 && !thread.hasTicket) return null;
  const status = thread.linkedTicketStatus;

  if (count <= 1) {
    return {
      label: externalKey ?? 'Ticket',
      tooltip: status ? `Ticket · ${words(status)}` : 'Linked ticket',
    };
  }
  let tooltip = `${count} tickets`;
  if (status && DONE.has(status)) tooltip = `${count} tickets · all resolved or closed`;
  else if (status) tooltip = `${count} tickets · newest open one: ${words(status)}`;
  return { label: `${count} tickets`, tooltip };
};
