import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/Dialog';
import { SearchInput } from '@/components/ui/SearchInput';
import {
  MG_BODY,
  MG_DIALOG,
  MG_DIM,
  MG_EMPTY,
  MG_HEAD,
  MG_NEW,
  MG_OPTION,
  MG_TITLE,
} from './relatedStyles';
import { statusLabel } from './messageDetailConstants';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { ticketService } from '@/services/ticket.service';
import { ticketThreadsService, type ThreadTicket } from '@/services/ticketThreads.service';
import type { Message } from '@/types';

type Candidate = {
  id: number;
  title: string;
  status: string;
  priority: string;
  externalId: string | null;
};

/**
 * The ticket just joined, as the header lists it — built from what the picker read, so the chip
 * and popover can show it before (or without) a re-read. What the list route does not send stays
 * unknown: no public id, and `owesReply: null` (never drawn as "owes"); joining never makes the
 * ticket's origin thread, so it is not primary.
 */
export const joinedTicket = (row: Candidate): ThreadTicket => ({
  ticketId: row.id,
  publicId: null,
  title: row.title,
  status: row.status,
  priority: row.priority,
  issueType: '',
  externalId: row.externalId,
  isPrimary: false,
  resolvedAt: null,
  owesReply: null,
});

/** The picker lists at most this many tickets; a full page says so, so "none" is never a cap. */
const PICKER_LIMIT = 20;

type AddToTicketDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Pick<Message, 'id'>;
  /** Tickets the thread is already on: not offered again. */
  excludeTicketIds: number[];
  /**
   * After a successful add. `alreadyOn`: someone added it a moment ago, so this click changed
   * nothing — the caller says so rather than closing as if it did.
   */
  onAdded: (result: {
    ticketId: number;
    alreadyOn: boolean;
    /** The ticket as the header lists it (see joinedTicket). */
    ticket: ThreadTicket;
    /** The thread that was added — the one this picker was opened for. */
    conversationId: number;
  }) => void;
  /** CREATE_TICKETS: without it the "Create a new ticket" row is not offered (the POST refuses). */
  canCreate?: boolean;
  /**
   * The host's own "new ticket from this thread" (the header's createTicket — the same action as
   * More → Create ticket), so the picker cannot go somewhere else. No handler, no row.
   */
  onCreateTicket?: () => void;
  /** A lead thread makes a lead ticket — the row says so, as More and the popover do. */
  isLead?: boolean | null;
};

/**
 * "Add this thread to a ticket" — the picker (v4 `.mg-dlg` look). A ticket is an incident many
 * customers' threads can report, and one thread can be on several (owner, 2026-09-30). Searches
 * tickets, offers each one the thread is not on yet, and the dashed "Create a new ticket from
 * this thread" row goes where staging's New ticket went. Opened from the header: the ticket
 * chip's Related popover and the More menu.
 */
export const AddToTicketDialog = ({
  open,
  onOpenChange,
  message,
  excludeTicketIds,
  onAdded,
  canCreate = true,
  onCreateTicket,
  isLead,
}: AddToTicketDialogProps) => {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Typing fires a search per keystroke; only the LATEST one may write the list.
  const searchSeq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    []
  );
  const excludeKey = excludeTicketIds.join(',');

  const search = useCallback(
    async (term: string) => {
      setError(null);
      const seq = ++searchSeq.current;
      try {
        const res = await ticketService.getAll(
          term.trim() ? { search: term.trim() } : undefined,
          1,
          PICKER_LIMIT
        );
        if (seq !== searchSeq.current) return;
        const rows = (res.data ?? []) as Array<{
          id: number;
          title: string;
          status: string;
          priority?: string | null;
          externalId?: string | null;
        }>;
        const already = new Set(excludeKey ? excludeKey.split(',').map(Number) : []);
        setCapped(rows.length >= PICKER_LIMIT);
        setCandidates(
          rows
            .filter((row) => !already.has(row.id))
            .map((row) => ({
              id: row.id,
              title: row.title,
              status: row.status,
              priority: row.priority ?? '',
              externalId: row.externalId ?? null,
            }))
        );
      } catch (err) {
        if (seq !== searchSeq.current) return;
        logger.error('Failed to search tickets', err);
        setCapped(false);
        setCandidates([]);
        setError(getApiErrorMessage(err) ?? 'Could not search tickets.');
      }
    },
    [excludeKey]
  );

  const cancelPendingSearch = () => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
    searchSeq.current += 1; // a search already in flight may no longer write
  };

  // Every opening starts from an empty query and the newest tickets.
  useEffect(() => {
    if (!open) return;
    cancelPendingSearch();
    setQuery('');
    setCandidates(null);
    setError(null);
    void search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening, not per search identity
  }, [open]);

  const close = () => {
    cancelPendingSearch();
    onOpenChange(false);
  };

  const add = async (row: Candidate) => {
    const ticketId = row.id;
    const conversationId = message.id;
    setBusy(true);
    setError(null);
    try {
      const result = await ticketThreadsService.addThreads(ticketId, [conversationId]);
      close();
      onAdded({
        ticketId,
        alreadyOn: result.added.length === 0,
        ticket: joinedTicket(row),
        conversationId,
      });
    } catch (err) {
      logger.error('Failed to add the thread to a ticket', err);
      setError(getApiErrorMessage(err) ?? 'This thread could not be added to that ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) cancelPendingSearch();
        onOpenChange(next);
      }}
      className={MG_DIALOG}
      sheetOnPhone
    >
      <DialogHeader className={MG_HEAD}>
        <DialogTitle className={MG_TITLE}>Add this thread to a ticket</DialogTitle>
        <DialogClose onClose={close} />
      </DialogHeader>
      <DialogContent className={MG_BODY}>
        <SearchInput
          value={query}
          onChange={(value: string) => {
            setQuery(value);
            // One search per pause, not per keystroke.
            if (debounce.current) clearTimeout(debounce.current);
            debounce.current = setTimeout(() => void search(value), 250);
          }}
          placeholder="Search tickets by title or number"
        />
        {error && <p className="m-0 text-[12px] text-destructive">{error}</p>}
        {candidates === null ? (
          <p className={MG_EMPTY}>Loading…</p>
        ) : candidates.length === 0 && !capped && !error ? (
          <p className={MG_EMPTY}>
            {query.trim() ? 'No ticket matches that.' : 'No other tickets to add it to.'}
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {candidates.map((row) => (
              <li key={row.id} className={MG_OPTION}>
                <span className="flex flex-col flex-1 min-w-0 leading-[1.35]">
                  <span className="font-mono text-[11.5px] text-muted-foreground">#{row.id}</span>
                  <span className="text-[13px] font-medium truncate">{row.title}</span>
                  <span className={MG_DIM}>{statusLabel(row.status)}</span>
                </span>
                <Button size="sm" className="h-8" onClick={() => void add(row)} disabled={busy}>
                  Add
                </Button>
              </li>
            ))}
            {capped && (
              <li className="text-[11px] text-muted-foreground">
                Showing the newest {PICKER_LIMIT}. Search to find another ticket.
              </li>
            )}
          </ul>
        )}
        {canCreate && onCreateTicket && (
          <Button
            variant="ghost"
            className={MG_NEW}
            onClick={() => {
              close();
              onCreateTicket();
            }}
            disabled={busy}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {isLead
              ? 'Create a new lead ticket from this thread'
              : 'Create a new ticket from this thread'}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};
