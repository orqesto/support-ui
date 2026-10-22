import type { ReactNode } from 'react';
import type { Ticket } from '@/types';

export type TicketRowProps = {
  ticket: Ticket;
  canManage: boolean;
  assignees: Array<{ id: number; name: string }>;
  currentUserId: number | null;
  /** The ticket open in the panel. */
  current: boolean;
  onOpen: (ticket: Ticket) => void;
  onAssign: (ticketId: number, userId: number | null) => void;
  /** The row's ⋯ menu items. */
  onRowMenu: (ticket: Ticket) => ReactNode;
};

/**
 * Table grid: priority · ticket · threads · owed · status · assignee · updated · menu. No category
 * column (the v3 design drops it at every width; category stays a filter and is on the card).
 */
export const TICKET_GRID =
  'grid items-center gap-x-3.5 pl-3.5 pr-1.5 grid-cols-[18px_minmax(0,1fr)_58px_78px_30px] md:grid-cols-[18px_minmax(0,1fr)_58px_78px_112px_120px_56px_30px] xl:grid-cols-[18px_minmax(0,1fr)_58px_78px_112px_140px_56px_30px]';

/** Columns shown from these widths up (the grid above has the matching track count). */
export const HIDE_BELOW_MD = 'hidden md:flex';
