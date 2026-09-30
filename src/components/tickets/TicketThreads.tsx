import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink as ExternalLinkIcon, Mail, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { getConvUrlId } from '@/lib/messageHelpers';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import { ticketThreadsService, type TicketThread } from '@/services/ticketThreads.service';
import type { Message } from '@/types';

/**
 * The threads a ticket covers — every customer who reported this incident (owner, 2026-09-30).
 *
 * Replaces the Messages tab's list, which read the INBOX (`/api/messages?ticketId=`) and so hid
 * every resolved thread: exactly the ones a fixed incident is made of. It keeps what that list
 * said about each thread (channel, date, sender, subject, link), and adds the thread's status,
 * which one the ticket was created from, and D2 — whether that customer still needs telling.
 */
type Props = {
  ticketId: number;
  /** How many threads the caller can see — the tab's badge. */
  onCountChange?: (count: number) => void;
  /** Shown instead when the backend predates these routes (version skew). */
  fallback: ReactNode;
};

type Candidate = { id: number; publicId: string | null; subject: string | null; sender: string };

/** The picker lists at most this many threads; a full page says so, so "none" is never a cap. */
const PICKER_LIMIT = 25;

const words = (status: string) => status.replace('_', ' ');

export const TicketThreads = ({ ticketId, onCountChange, fallback }: Props) => {
  const orgCode = useCurrentOrgCode();
  const [threads, setThreads] = useState<TicketThread[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'unavailable'>('loading');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const result = await ticketThreadsService.threadsOfTicket(ticketId);
      if (result.unavailable) {
        setState('unavailable');
        return;
      }
      setThreads(result.rows);
      setHiddenCount(result.hiddenCount);
      onCountChange?.(result.rows.length);
      setState('ready');
    } catch (err) {
      // ⛔ A failed READ is not "no threads" — that would say nobody reported this.
      logger.error('Failed to read the ticket’s threads', err);
      setState('failed');
    }
  }, [ticketId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const search = useCallback(
    async (term: string) => {
      setError(null);
      const seq = ++searchSeq.current;
      try {
        /*
          ANY customer's threads — an incident is reported by many. Every lifecycle: a thread the
          agent already answered and resolved still belongs on the incident it reported.
        */
        const res = await messageService.getThreads(
          { ...(term.trim() ? { search: term.trim() } : {}), lifecycle: 'all' },
          1,
          PICKER_LIMIT
        );
        if (seq !== searchSeq.current) return;
        const rows = (res.data ?? []) as unknown as Array<{ latestMessage?: Message }>;
        const already = new Set(threads.map((row) => row.conversationId));
        setCapped(rows.length >= PICKER_LIMIT);
        setCandidates(
          rows
            .map((row) => row.latestMessage)
            .filter((row): row is Message => !!row && !already.has(row.id))
            .map((row) => ({
              id: row.id,
              publicId: row.publicId ?? null,
              subject: row.subject ?? null,
              sender: row.sender ?? '',
            }))
        );
      } catch (err) {
        if (seq !== searchSeq.current) return;
        logger.error('Failed to search threads', err);
        setCapped(false);
        setCandidates([]);
        setError(getApiErrorMessage(err) ?? 'Could not search threads.');
      }
    },
    [threads]
  );

  const openPicker = () => {
    setPickerOpen(true);
    setQuery('');
    setCandidates(null);
    void search('');
  };

  const add = async (conversationId: number) => {
    setBusy(true);
    setError(null);
    try {
      await ticketThreadsService.addThreads(ticketId, [conversationId]);
      await load();
      // Stay open: an incident is usually several reports, added one after another.
      setCandidates((prev) => prev?.filter((row) => row.id !== conversationId) ?? null);
    } catch (err) {
      logger.error('Failed to add a thread to the ticket', err);
      setError(getApiErrorMessage(err) ?? 'That thread could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (conversationId: number) => {
    setBusy(true);
    setError(null);
    try {
      await ticketThreadsService.removeThread(ticketId, conversationId);
      await load();
    } catch (err) {
      logger.error('Failed to take a thread off the ticket', err);
      setError(getApiErrorMessage(err) ?? 'That thread could not be taken off this ticket.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'unavailable') return <>{fallback}</>;

  const owing = threads.filter((row) => row.owesReply === true).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        {owing > 0 ? (
          <Badge variant="warning" size="sm">
            {owing === 1
              ? '1 customer still needs a reply about this fix'
              : `${owing} customers still need a reply about this fix`}
          </Badge>
        ) : (
          <span />
        )}
        <Button variant="outline" size="sm" onClick={openPicker} disabled={busy}>
          <Plus className="h-3 w-3 mr-1" aria-hidden />
          Add threads
        </Button>
      </div>

      {state === 'loading' ? (
        <p className="py-4 text-sm text-center text-muted-foreground">Loading messages…</p>
      ) : state === 'failed' ? (
        <p className="py-4 text-sm text-center text-muted-foreground">
          We could not read this ticket’s threads just now, so this list is not complete.
        </p>
      ) : threads.length === 0 && hiddenCount === 0 ? (
        <p className="py-4 text-sm text-center text-muted-foreground">No linked messages.</p>
      ) : (
        <ul className="space-y-2">
          {threads.map((row) => (
            <li
              key={row.conversationId}
              className="flex gap-3 items-start p-3 rounded-lg border bg-muted border-border"
            >
              <div className="p-2 rounded bg-muted flex-shrink-0">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex gap-2 items-center flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {row.channel}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDate(row.createdAt)}
                  </span>
                  <Badge variant="secondary" size="sm">
                    {words(row.status)}
                  </Badge>
                  {row.isPrimary && (
                    <span className="text-xs text-muted-foreground">ticket created from this</span>
                  )}
                </div>
                <Link
                  to={`/messages?id=${getConvUrlId({ id: row.conversationId, publicId: row.publicId }, orgCode)}`}
                  className="block group"
                >
                  <p className="text-sm font-medium truncate">{row.requesterEmail}</p>
                  {row.subject && (
                    <p className="text-sm truncate text-muted-foreground group-hover:text-primary transition-colors">
                      {row.subject}
                    </p>
                  )}
                </Link>
                {/* D2 — nothing is sent for the agent. Only a TRUE owes: null means the ticket was
                    closed without a recorded resolution time, and saying "owes" would be a guess. */}
                {row.owesReply === true && (
                  <Badge variant="warning" size="sm">
                    Fixed — reply to tell this customer
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!row.isPrimary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void remove(row.conversationId)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                )}
                <ExternalLinkIcon
                  className="w-3.5 h-3.5 text-muted-foreground mt-0.5"
                  aria-hidden
                />
              </div>
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="text-xs text-muted-foreground">
              + {hiddenCount} {hiddenCount === 1 ? 'thread' : 'threads'} in departments you cannot
              open.
            </li>
          )}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add threads to this ticket</DialogTitle>
            <DialogClose onClose={() => setPickerOpen(false)} />
          </DialogHeader>
          <div className="space-y-3">
            <SearchInput
              value={query}
              onChange={(value: string) => {
                setQuery(value);
                void search(value);
              }}
              placeholder="Search any customer’s threads — name, address, subject"
            />
            {candidates === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : candidates.length === 0 && !capped ? (
              <p className="text-sm text-muted-foreground">
                {query.trim() ? 'No thread matches that.' : 'No other threads to add.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {candidates.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {row.sender}
                      {row.subject && (
                        <span className="text-muted-foreground"> · {row.subject}</span>
                      )}
                    </span>
                    <Button size="sm" onClick={() => void add(row.id)} disabled={busy}>
                      Add
                    </Button>
                  </li>
                ))}
                {capped && (
                  <li className="text-xs text-muted-foreground">
                    Showing the newest {PICKER_LIMIT}. Search to find another thread.
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
