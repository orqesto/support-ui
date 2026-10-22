import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { cn } from '@/lib/utils';
import { ticketDisplayId } from '@/lib/ticketReference';

type RefTicket = { id: number; reference?: string | null };

/** With a number: the workspace code in front (`ACME-SUP-T-42`). Reads the code only then. */
const WithCode = ({ ticket, className }: { ticket: RefTicket; className?: string }) => {
  const orgCode = useCurrentOrgCode();
  return <span className={cn('font-mono', className)}>{ticketDisplayId(ticket, orgCode)}</span>;
};

/**
 * A ticket's shown id (`ACME-SUP-T-42`, or `#21` before it has a number), in the mono face. The
 * workspace code is read only for a ticket that has a reference, so `#21` costs no query.
 */
export const TicketRef = ({ ticket, className }: { ticket: RefTicket; className?: string }) =>
  ticket.reference ? (
    <WithCode ticket={ticket} className={className} />
  ) : (
    <span className={cn('font-mono', className)}>#{ticket.id}</span>
  );

/** The shown id as text — for a ticket that HAS a reference (the caller checks). */
export const useTicketDisplayId = (ticket: RefTicket): string => {
  const orgCode = useCurrentOrgCode();
  return ticketDisplayId(ticket, orgCode);
};
