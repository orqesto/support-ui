import { useMemo } from 'react';
import { useOpenTabs, type OpenTabNewsEvent } from '@/components/shared/openTabs';
import type { OpenTab } from '@/lib/openTabs';
import { ticketDisplayId } from '@/lib/ticketReference';
import type { Ticket } from '@/types';

/** The ticket a socket payload is about. */
const ticketKeyOf = (payload: unknown): string | null => {
  const id = (payload as { ticketId?: unknown } | null | undefined)?.ticketId;
  return typeof id === 'number' ? String(id) : null;
};

const TICKET_NEWS: OpenTabNewsEvent[] = [
  { event: 'ticket:updated', keyOf: ticketKeyOf },
  { event: 'comment:created', keyOf: ticketKeyOf },
];

/** The ticket's unsent update and comment (useUnsentTicketUpdate, TicketComments). */
const ticketDraftScopes = (key: string) => [`ticket:${key}:update`, `ticket:${key}:comment`];

/**
 * The Tickets open-tabs row. `shown` is the ticket on screen (null for none); `activate`
 * navigates to a tab's ticket; `closeShown` closes the ticket on screen.
 */
export const useTicketTabs = ({
  shown,
  orgCode,
  activate,
  closeShown,
  keyboard,
  preview,
}: {
  shown: Ticket | null;
  orgCode: string | null | undefined;
  activate: (tab: OpenTab) => void;
  closeShown: () => void;
  keyboard?: boolean;
  /** The list is live beside the ticket (split view): plain clicks open preview tabs. */
  preview?: boolean;
}) => {
  const target = useMemo(
    () =>
      shown
        ? {
            key: String(shown.id),
            urlId: String(shown.id),
            label: ticketDisplayId(shown, orgCode),
            title: shown.title ?? '',
          }
        : null,
    [shown, orgCode]
  );
  return useOpenTabs({
    kind: 'tickets',
    shown: target,
    activate,
    closeShown,
    draftScopes: ticketDraftScopes,
    noun: 'ticket',
    newsEvents: TICKET_NEWS,
    keyboard,
    preview,
  });
};
