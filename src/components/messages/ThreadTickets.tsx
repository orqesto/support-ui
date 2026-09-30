import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Ticket as TicketIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/Dialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { ticketService } from '@/services/ticket.service';
import { ticketThreadsService, type ThreadTicket } from '@/services/ticketThreads.service';
import type { Message } from '@/types';

/**
 * "Which incidents is this thread part of?" — a ticket is an escalation that many customers'
 * threads can report, and one thread can be on several (owner, 2026-09-30).
 *
 * Replaces "Same piece of work" (thread links, retired). The case that served — one customer's
 * request split across two Gmail threads — is a MERGE, beside this panel.
 */
type Props = {
  message: Message;
  /** Refresh the surrounding surfaces — adding a thread changes its ticket chip. */
  onChanged?: () => void;
};

type Candidate = { id: number; title: string; status: string };

/** The picker lists at most this many tickets; a full page says so, so "none" is never a cap. */
const PICKER_LIMIT = 20;

const words = (status: string) => status.replace('_', ' ');

export const ThreadTickets = ({ message, onChanged }: Props) => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<ThreadTicket[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'unavailable'>('loading');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [capped, setCapped] = useState(false);
  // Typing fires a search per keystroke; only the LATEST one may write the list.
  const searchSeq = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    []
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const result = await ticketThreadsService.ticketsOfThread(message.id);
      if (result.unavailable) {
        setState('unavailable');
        return;
      }
      setTickets(result.rows);
      setHiddenCount(result.hiddenCount);
      setState('ready');
    } catch (err) {
      // ⛔ A failed READ is not "on no ticket" — saying so would state something false.
      logger.error('Failed to read the thread’s tickets', err);
      setState('failed');
    }
  }, [message.id]);

  useEffect(() => {
    void load();
  }, [load]);

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
        const rows = (res.data ?? []) as Array<{ id: number; title: string; status: string }>;
        const already = new Set(tickets.map((row) => row.ticketId));
        setCapped(rows.length >= PICKER_LIMIT);
        setCandidates(
          rows
            .filter((row) => !already.has(row.id))
            .map((row) => ({ id: row.id, title: row.title, status: row.status }))
        );
      } catch (err) {
        if (seq !== searchSeq.current) return;
        logger.error('Failed to search tickets', err);
        setCapped(false);
        setCandidates([]);
        setError(getApiErrorMessage(err) ?? 'Could not search tickets.');
      }
    },
    [tickets]
  );

  const cancelPendingSearch = () => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
    searchSeq.current += 1; // a search already in flight may no longer write
  };

  const openPicker = () => {
    cancelPendingSearch();
    setPickerOpen(true);
    setQuery('');
    setCandidates(null);
    void search('');
  };

  const add = async (ticketId: number) => {
    setBusy(true);
    setError(null);
    try {
      const result = await ticketThreadsService.addThreads(ticketId, [message.id]);
      if (result.added.length === 0) {
        // Someone added it a moment ago — say so rather than closing as if this click did it.
        setError('This thread is already on that ticket.');
      }
      setPickerOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      logger.error('Failed to add the thread to a ticket', err);
      setError(getApiErrorMessage(err) ?? 'This thread could not be added to that ticket.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ticketId: number) => {
    setBusy(true);
    setError(null);
    try {
      await ticketThreadsService.removeThread(ticketId, message.id);
      await load();
      onChanged?.();
    } catch (err) {
      logger.error('Failed to take the thread off a ticket', err);
      setError(getApiErrorMessage(err) ?? 'This thread could not be taken off that ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-medium flex items-center gap-1.5">
          <TicketIcon className="h-3.5 w-3.5" aria-hidden />
          Tickets
        </h4>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={openPicker}
            disabled={busy || state === 'unavailable'}
          >
            <Plus className="h-3 w-3 mr-1" aria-hidden />
            Add to ticket
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/tickets/create?messageId=${message.id}`)}
            disabled={busy}
          >
            New ticket
          </Button>
        </div>
      </div>

      {state === 'loading' ? (
        <p className="text-[12px] text-muted-foreground">Loading…</p>
      ) : state === 'failed' ? (
        <p className="text-[12px] text-muted-foreground">
          We could not read this thread’s tickets just now, so this list is not complete.
        </p>
      ) : state === 'unavailable' ? (
        <p className="text-[12px] text-muted-foreground">
          This server does not list a thread’s tickets yet.
        </p>
      ) : tickets.length === 0 && hiddenCount === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Not on any ticket. Add it to an incident other customers reported, or open a new ticket
          from it.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {tickets.map((row) => (
            <li key={row.ticketId} className="text-[12px] space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/tickets?id=${row.ticketId}`} className="truncate hover:underline">
                  {/* #id — the same number the ticket page and the ticket bar show. */}
                  <span className="font-mono text-muted-foreground mr-1">#{row.ticketId}</span>
                  {row.title}
                </Link>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" size="sm">
                    {words(row.status)}
                  </Badge>
                  {row.isPrimary ? (
                    <span className="text-[11px] text-muted-foreground">
                      created from this thread
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(row.ticketId)}
                      disabled={busy}
                      aria-label={`Take this thread off ticket #${row.ticketId}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              {/* D2 — nothing is sent for the agent: the incident is fixed, THIS customer has not
                  been told yet. Only a TRUE owes; null = closed without a resolve (not a fix). */}
              {row.owesReply === true && (
                <Badge variant="warning" size="sm">
                  Fixed — reply to tell this customer
                </Badge>
              )}
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="text-[11px] text-muted-foreground">
              + {hiddenCount} {hiddenCount === 1 ? 'ticket' : 'tickets'} in departments you cannot
              open.
            </li>
          )}
        </ul>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) cancelPendingSearch();
          setPickerOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add this thread to a ticket</DialogTitle>
            <DialogClose
              onClose={() => {
                cancelPendingSearch();
                setPickerOpen(false);
              }}
            />
          </DialogHeader>
          <div className="space-y-3">
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
            {candidates === null ? (
              <p className="text-[12px] text-muted-foreground">Loading…</p>
            ) : candidates.length === 0 && !capped ? (
              <p className="text-[12px] text-muted-foreground">
                {query.trim() ? 'No ticket matches that.' : 'No other tickets to add it to.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {candidates.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate">
                      <span className="font-mono text-muted-foreground mr-1">#{row.id}</span>
                      {row.title}
                      <span className="text-muted-foreground"> · {words(row.status)}</span>
                    </span>
                    <Button size="sm" onClick={() => void add(row.id)} disabled={busy}>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
