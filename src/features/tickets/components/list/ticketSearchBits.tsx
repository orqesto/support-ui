import { Highlight } from '@/components/ui/Highlight';
import type { Ticket } from '@/types';

/**
 * A searched ticket's title and the line saying where else it matched. Ticket fields, notes and
 * the passages are matched anywhere (backend ticketSearch.ts — substring, short words whole),
 * so the words are marked anywhere too.
 */
export const TicketTitle = ({ ticket, terms }: { ticket: Ticket; terms?: string[] }) => (
  <Highlight text={ticket.title} terms={terms} mode="anywhere" />
);

const LABEL: Partial<Record<NonNullable<Ticket['searchMatch']>['field'], string>> = {
  note: 'Note: ',
  thread: 'Thread: ',
};

/**
 * Where a searched ticket matched, when it is not its title or number: the sender, or the
 * passage of its description, its note or its thread. null otherwise.
 */
export const ticketMatchLine = (ticket: Ticket, terms?: string[]) => {
  const match = ticket.searchMatch;
  if (!match) return null;
  if (match.field === 'people') {
    return (
      <>
        <span className="font-medium text-foreground/80">Sender: </span>
        <Highlight text={ticket.sender} terms={terms} mode="anywhere" />
      </>
    );
  }
  if (!match.snippet) return null;
  const label = LABEL[match.field];
  return (
    <>
      {label && <span className="font-medium text-foreground/80">{label}</span>}
      <Highlight text={match.snippet} terms={terms} mode="anywhere" />
    </>
  );
};
