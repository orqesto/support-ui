/**
 * A ticket's shown id (owner 2026-10-22): the workspace code, the CURRENT team when the ticket has
 * moved out of the team it was born in, and its own number — `ACME-SUP-T-42`, after a move to
 * Billing `ACME-BIL-SUP-T-42`. The backend sends `reference` without the workspace code (that is
 * what customers are sent, as threads' `[SUP-42]`); the app adds the code, as `getConvUrlId`
 * does for threads.
 *
 * ⚠️ `reference` only, never `publicId`: a backend older than ticket numbers has no `reference`,
 * and its ticket `publicId` is a COPY of the thread's number — showing it would present the
 * thread's id as the ticket's. Without `reference` the ticket reads `#21`, as before.
 */
export const ticketDisplayId = (
  ticket: { id: number; reference?: string | null },
  orgCode?: string | null
): string => {
  if (!ticket.reference) return `#${ticket.id}`;
  return orgCode ? `${orgCode}-${ticket.reference}` : ticket.reference;
};
