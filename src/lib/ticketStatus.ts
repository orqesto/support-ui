import type { TicketStatus } from '@/types';

/**
 * Single FE source of truth for allowed ticket status transitions.
 *
 * MUST mirror the backend authoritative map, `VALID_STATUS_TRANSITIONS` in
 * BE-service `src/modules/tickets/services/ticketService.ts` — the server enforces it
 * and 422s any transition it disallows. Keeping ONE FE copy (consumed by both the Kanban
 * board and the status dropdown) prevents the three-way drift that caused silently failed
 * drags and blocked reopen-from-resolved/closed (audit HIGH, Wave1:134).
 */
export const VALID_STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  pending: ['open', 'in_progress', 'closed'],
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['open', 'closed'],
  closed: ['open'],
};

/** True if `to` is a valid next status from `from` (per the backend contract). */
export const canTransition = (from: TicketStatus, to: TicketStatus): boolean =>
  from === to || (VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false);

/**
 * Statuses a user may select FROM `current`: the current status itself (a no-op re-select)
 * plus every valid target. Use to gate a status dropdown so it can't offer a move the
 * backend will reject.
 */
export const allowedStatusOptions = (current: TicketStatus): TicketStatus[] => [
  current,
  ...(VALID_STATUS_TRANSITIONS[current] ?? []),
];
