import { TicketAddThreadsDialog } from './TicketAddThreadsDialog';
import { TicketReachStrip } from './TicketReachStrip';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ExternalLink as ExternalLinkIcon, Mail, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Tooltip } from '@/components/ui/Tooltip';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { getConvUrlId } from '@/lib/messageHelpers';
import { formatDate } from '@/lib/utils';
import { isInFlight } from '@/services/ticketReplies.service';
import { ticketThreadsService, type TicketThread } from '@/services/ticketThreads.service';
import { Permission } from '@/types/roles';
import { searchThreadCandidates, type ThreadCandidate } from '@/services/threadCandidates.service';
import { TicketReplyComposer, useTicketReplies } from './TicketReplyComposer';

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
  /**
   * What the tab badge may say: a count once the list is read; `unavailable` on a backend without
   * the route (the tab then counts the fallback list); `null` while loading or after a failed
   * read — a number then would describe a list the tab is not showing.
   */
  onCountChange?: (count: number | 'unavailable' | null) => void;
  /** Shown instead when the backend predates these routes (version skew). */
  fallback: ReactNode;
  /**
   * The ticket's status, for which threads a reply ticks by default (owner Q2, 2026-10-09): on a
   * resolved/closed ticket only those still owed a reply, otherwise all of them.
   */
  ticketStatus?: string;
  /** The ticket page draws the reach strip above the description, so it needs the list too. */
  onThreadsChange?: (threads: TicketThread[]) => void;
  /** Off where the page shows the strip itself. */
  showReachStrip?: boolean;
};

const words = (status: string) => status.replace('_', ' ');
const isDone = (status: string) => status === 'resolved' || status === 'closed';
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** The last send or resolve the page can undo — reopen only, never unsend. */
type Undoable = { ids: number[]; outcome: 'resolved' | 'on_hold' };

export const TicketThreads = ({
  ticketId,
  onCountChange,
  fallback,
  ticketStatus,
  onThreadsChange,
  showReachStrip = true,
}: Props) => {
  const orgCode = useCurrentOrgCode();
  // Adding, removing, sending and resolving are support and above (MANAGE_TICKETS); viewing is not.
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(Permission.MANAGE_TICKETS);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [threads, setThreads] = useState<TicketThread[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  useEffect(() => {
    onThreadsChange?.(threads);
  }, [threads, onThreadsChange]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'unavailable'>('loading');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ThreadCandidate[] | null>(null);
  const [capped, setCapped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const replies = useTicketReplies(ticketId);
  const replyData = replies.data && !replies.data.unavailable ? replies.data : null;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Once the agent ticks or unticks, the defaults stop applying until the ticket changes.
  const selectionTouched = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    []
  );

  /*
    The ticket page re-uses this component for the next ticket (no key), so a response for the
    PREVIOUS ticket can arrive after the switch — only the latest load may write.
  */
  const loadSeq = useRef(0);
  // `quiet`: a refresh nobody asked for (a socket event) keeps the list and its count on screen.
  const load = useCallback(
    async (quiet = false) => {
      const seq = ++loadSeq.current;
      if (!quiet) {
        setState('loading');
        onCountChange?.(null);
      }
      try {
        const result = await ticketThreadsService.threadsOfTicket(ticketId);
        if (seq !== loadSeq.current) return;
        if (result.unavailable) {
          setState('unavailable');
          onCountChange?.('unavailable');
          return;
        }
        setThreads(result.rows);
        setHiddenCount(result.hiddenCount);
        onCountChange?.(result.rows.length);
        setState('ready');
      } catch (err) {
        if (seq !== loadSeq.current) return;
        // ⛔ A failed READ is not "no threads" — that would say nobody reported this.
        logger.error('Failed to read the ticket’s threads', err);
        // A quiet refresh keeps what is on screen — unless nothing is: it may have replaced a
        // normal load still showing "Loading…", which would otherwise stay up for good.
        if (quiet) setState((prev) => (prev === 'loading' ? 'failed' : prev));
        else setState('failed');
      }
    },
    [ticketId, onCountChange]
  );

  /*
    The LATEST ticket id, list and loader, for work that finishes after a render: an add/remove
    started on ticket A must not reload A's list into ticket B's page (the seq guard alone cannot
    tell — the stale reload would be the newest load), and a debounced search must filter against
    the list as it is now, not as it was when the keystroke happened.
  */
  const currentTicket = useRef(ticketId);
  const threadsNow = useRef(threads);
  const loadNow = useRef(load);
  currentTicket.current = ticketId;
  threadsNow.current = threads;
  loadNow.current = load;

  const cancelPendingSearch = () => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
    searchSeq.current += 1; // any search already in flight may no longer write
  };

  // A different ticket: nothing of the previous one may show while this one loads.
  useEffect(() => {
    setSelected(new Set());
    selectionTouched.current = false;
    setThreads([]);
    setHiddenCount(0);
    setError(null);
    setUndoable(null);
    setStatusNotice(null);
    // The picker was filtered against the previous ticket's list: close it, drop its results.
    cancelPendingSearch();
    setPickerOpen(false);
    setCandidates(null);
    setQuery('');
  }, [ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    Each delivery that finishes changes its thread: "updated", On-hold until …, Remove refused.
    The socket's message:replied fires when the mail leaves — BEFORE the thread is put on hold and
    the delivery marked sent — so the last thread of a send stayed as it was (staging 2026-10-19).
    The replies poll runs until every delivery is done; reload whenever one more has finished.
  */
  const finishedDeliveries = replyData
    ? replyData.replies.reduce(
        (sum, reply) => sum + reply.deliveries.filter((row) => !isInFlight(row.outcome)).length,
        0
      )
    : null;
  const seenFinished = useRef<number | null>(null);
  useEffect(() => {
    if (finishedDeliveries === null) return;
    const before = seenFinished.current;
    seenFinished.current = finishedDeliveries;
    if (before !== null && finishedDeliveries > before) void load(true);
  }, [finishedDeliveries, load]);
  useEffect(() => {
    seenFinished.current = null;
  }, [ticketId]);

  // Who is still owed a reply changes without this list doing anything: the ticket is resolved or
  // reopened (the ticket page updates its status in place), or an agent's reply on one of these
  // threads is sent — or fails to send.
  const threadIdsKey = threads.map((row) => row.conversationId).join(',');
  useEffect(() => {
    const ids = threadIdsKey ? threadIdsKey.split(',').map(Number) : [];
    const onTicket = (data: unknown) => {
      if ((data as { ticketId: number }).ticketId === ticketId) void load(true);
    };
    const onReply = (data: unknown) => {
      if (ids.includes((data as { messageId: number }).messageId)) void load(true);
    };
    subscribeToEvent('ticket:updated', onTicket);
    subscribeToEvent('message:replied', onReply);
    subscribeToEvent('send-failed', onReply);
    return () => {
      unsubscribeFromEvent('ticket:updated', onTicket);
      unsubscribeFromEvent('message:replied', onReply);
      unsubscribeFromEvent('send-failed', onReply);
    };
  }, [threadIdsKey, ticketId, load]);

  const search = useCallback(async (term: string) => {
    setError(null);
    const seq = ++searchSeq.current;
    try {
      const { candidates: found, capped: full } = await searchThreadCandidates(term);
      if (seq !== searchSeq.current) return;
      const already = new Set(threadsNow.current.map((row) => row.conversationId));
      setCapped(full);
      setCandidates(found.filter((row) => !already.has(row.id)));
    } catch (err) {
      if (seq !== searchSeq.current) return;
      logger.error('Failed to search threads', err);
      setCapped(false);
      setCandidates([]);
      setError(getApiErrorMessage(err) ?? 'Could not search threads.');
    }
  }, []);

  const openPicker = () => {
    cancelPendingSearch();
    setPickerOpen(true);
    setQuery('');
    setCandidates(null);
    void search('');
  };

  const add = async (conversationId: number) => {
    setBusy(true);
    setError(null);
    const startedOn = ticketId;
    try {
      await ticketThreadsService.addThreads(startedOn, [conversationId]);
      if (currentTicket.current !== startedOn) return; // the page moved on to another ticket
      await loadNow.current();
      // Stay open: an incident is usually several reports, added one after another.
      setCandidates((prev) => prev?.filter((row) => row.id !== conversationId) ?? null);
    } catch (err) {
      logger.error('Failed to add a thread to the ticket', err);
      // Said about ticket A, it is false on ticket B's page.
      if (currentTicket.current !== startedOn) return;
      setError(getApiErrorMessage(err) ?? 'That thread could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (conversationId: number) => {
    setBusy(true);
    setError(null);
    const startedOn = ticketId;
    try {
      await ticketThreadsService.removeThread(startedOn, conversationId);
      if (currentTicket.current !== startedOn) return; // the page moved on to another ticket
      await loadNow.current();
    } catch (err) {
      logger.error('Failed to take a thread off the ticket', err);
      if (currentTicket.current !== startedOn) return;
      setError(getApiErrorMessage(err) ?? 'That thread could not be taken off this ticket.');
    } finally {
      setBusy(false);
    }
  };

  const unreachable = new Map(
    (replyData?.unreachable ?? []).map((row) => [row.conversationId, row.reason])
  );
  const unreachableKey = [...unreachable.keys()].join(',');
  const ticketDone = ticketStatus === 'resolved' || ticketStatus === 'closed';
  /*
    Default ticks: every thread a reply can reach; on a resolved ticket only the customers not yet
    told (Q2). Recomputed while the agent has not touched a box — the list, the unreachable set
    and the status all arrive separately.
  */
  useEffect(() => {
    if (selectionTouched.current || state !== 'ready') return;
    const blocked = new Set(unreachableKey ? unreachableKey.split(',').map(Number) : []);
    setSelected(
      new Set(
        threads
          .filter((row) => !blocked.has(row.conversationId))
          // An update goes to the OPEN threads (contingency page, 2026-10-19); on a resolved
          // ticket, to the customers not yet told it is fixed (Q2).
          .filter((row) => (ticketDone ? row.owesReply === true : !isDone(row.status)))
          .map((row) => row.conversationId)
      )
    );
  }, [threads, unreachableKey, ticketDone, state]);

  const toggle = (conversationId: number, on: boolean) => {
    selectionTouched.current = true;
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(conversationId);
      else next.delete(conversationId);
      return next;
    });
  };

  /** Resolve the ticked threads without sending anything, or reopen (the undo). */
  const setThreadsStatus = async (action: 'resolve' | 'reopen', ids: number[]) => {
    setBusy(true);
    setError(null);
    setStatusNotice(null);
    const startedOn = ticketId;
    try {
      const result =
        action === 'resolve'
          ? await ticketThreadsService.resolveThreads(startedOn, ids)
          : await ticketThreadsService.reopenThreads(startedOn, ids);
      if (currentTicket.current !== startedOn) return;
      setUndoable(
        action === 'resolve' && result.done.length > 0
          ? { ids: result.done, outcome: 'resolved' }
          : null
      );
      const done = result.done.length;
      setStatusNotice(
        [
          action === 'resolve'
            ? `${done} ${plural(done, 'thread', 'threads')} resolved — nothing was sent.`
            : `${done} ${plural(done, 'thread', 'threads')} reopened. Emails already sent stay sent.`,
          result.skipped.length > 0
            ? `${result.skipped.length} ${plural(result.skipped.length, 'was', 'were')} already ${action === 'resolve' ? 'resolved' : 'open'}.`
            : '',
          result.failed.length > 0
            ? `${result.failed.length} could not be ${action === 'resolve' ? 'resolved' : 'reopened'}: ${result.failed.map((row) => row.error).join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      await loadNow.current(true);
    } catch (err) {
      logger.error(`Failed to ${action} the ticket’s threads`, err);
      if (currentTicket.current !== startedOn) return;
      setError(
        getApiErrorMessage(err) ??
          `The threads could not be ${action === 'resolve' ? 'resolved' : 'reopened'}.`
      );
    } finally {
      setBusy(false);
    }
  };

  if (state === 'unavailable') return <>{fallback}</>;

  // Only from a list that was actually read — never a count left over from before a failed reload.
  const owing = state === 'ready' ? threads.filter((row) => row.owesReply === true).length : 0;
  const nameOf = new Map(
    (replyData?.names ?? []).map((row) => [row.conversationId, row.customerName])
  );
  const selectedIds = threads.map((row) => row.conversationId).filter((id) => selected.has(id));
  const resolvable = selectedIds.filter(
    (id) => !isDone(threads.find((row) => row.conversationId === id)?.status ?? '')
  );
  // Nothing open to update: every thread is finished and no customer is still owed the fix.
  const allDone =
    state === 'ready' &&
    threads.length > 0 &&
    threads.every((row) => isDone(row.status)) &&
    owing === 0;

  return (
    <div className="space-y-2">
      {showReachStrip && <TicketReachStrip threads={threads} ticketDone={ticketDone} />}
      <div className="flex items-center justify-between gap-2">
        {/* On the ticket page the reach strip above already says how many are owed. */}
        {owing > 0 && showReachStrip ? (
          <Badge variant="warning" size="sm">
            {owing === 1
              ? '1 thread still needs a reply about this fix'
              : `${owing} threads still need a reply about this fix`}
            {/* Threads the caller cannot open are not counted — say so rather than imply a total. */}
            {hiddenCount > 0 && ' (among the threads you can open)'}
          </Badge>
        ) : (
          <span />
        )}
        {canManage && (
          <div className="flex gap-2 items-center whitespace-nowrap">
            {replyData && (
              <Tooltip content="Resolve the ticked open threads — nothing is sent" size="sm">
                <span className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmResolve(true)}
                    disabled={busy || resolvable.length === 0}
                  >
                    <Check className="mr-1 w-3 h-3" aria-hidden />
                    Resolve {resolvable.length} {plural(resolvable.length, 'thread', 'threads')}
                  </Button>
                </span>
              </Tooltip>
            )}
            <Button variant="outline" size="sm" onClick={openPicker} disabled={busy}>
              <Plus className="h-3 w-3 mr-1" aria-hidden />
              Add threads
            </Button>
          </div>
        )}
      </div>
      {undoable && canManage && (
        <Alert variant="info" className="flex flex-wrap gap-2 justify-between items-center">
          <span className="text-sm">
            {undoable.ids.length} {plural(undoable.ids.length, 'thread was', 'threads were')}{' '}
            {undoable.outcome === 'resolved' ? 'resolved' : 'put on hold'}.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void setThreadsStatus('reopen', undoable.ids)}
            disabled={busy}
          >
            Undo — reopen only (emails already sent stay sent)
          </Button>
        </Alert>
      )}
      {statusNotice && <p className="text-sm text-muted-foreground">{statusNotice}</p>}

      {state === 'loading' ? (
        <p className="py-4 text-sm text-center text-muted-foreground">Loading threads…</p>
      ) : state === 'failed' ? (
        <p className="py-4 text-sm text-center text-muted-foreground">
          We could not read this ticket’s threads just now, so this list is not complete.
        </p>
      ) : threads.length === 0 && hiddenCount === 0 ? (
        <p className="py-4 text-sm text-center text-muted-foreground">
          No linked threads
          {canManage ? ' yet — Add threads to link the reports this ticket explains.' : '.'}
        </p>
      ) : (
        // One list with hairlines (Tickets v3): who · what · when and where it stands.
        <ul
          aria-label="Threads on this ticket"
          className="overflow-hidden rounded-[10px] border border-border bg-card"
        >
          {threads.map((row) => {
            const threadUrl = `/threads?id=${getConvUrlId({ id: row.conversationId, publicId: row.publicId }, orgCode)}`;
            const name = nameOf.get(row.conversationId);
            return (
              <li
                key={row.conversationId}
                className="grid grid-cols-[20px_18px_minmax(0,1fr)_auto] gap-2.5 items-start py-[11px] pr-2.5 pl-3 border-t border-border/60 first:border-t-0 transition-colors hover:bg-muted/40"
              >
                {/* A backend without ticket replies offers no reply box, so no boxes to tick. */}
                {replyData && canManage ? (
                  <Checkbox
                    className="pt-0.5"
                    checked={selected.has(row.conversationId)}
                    onChange={(event) => toggle(row.conversationId, event.target.checked)}
                    disabled={unreachable.has(row.conversationId)}
                    aria-label={`Reply to ${row.requesterEmail}`}
                  />
                ) : (
                  <span />
                )}
                <Tooltip content={row.channel} size="sm">
                  <span className="grid mt-0.5 text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" aria-hidden />
                    <span className="sr-only">{row.channel}</span>
                  </span>
                </Tooltip>
                <div className="grid gap-[3px] min-w-0">
                  <Link to={threadUrl} className="grid gap-[3px] min-w-0 group">
                    <span className="flex gap-2 items-baseline min-w-0">
                      <span className="text-[13.5px] font-semibold truncate">
                        {name ?? row.requesterEmail}
                      </span>
                      {name && (
                        <span className="flex-1 min-w-0 text-[12.5px] truncate text-muted-foreground">
                          {row.requesterEmail}
                        </span>
                      )}
                    </span>
                    {row.subject && (
                      <span className="text-[13px] truncate text-muted-foreground group-hover:text-primary transition-colors">
                        {row.subject}
                      </span>
                    )}
                  </Link>
                  <div className="flex flex-wrap gap-[5px] items-center mt-[3px]">
                    <span
                      className="font-mono text-[11px] text-muted-foreground"
                      aria-label="Case number"
                    >
                      {row.publicId ?? `#${row.conversationId}`}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </span>
                    <Badge
                      variant={
                        isDone(row.status)
                          ? 'success'
                          : row.status === 'pending'
                            ? 'secondary'
                            : 'info'
                      }
                      size="sm"
                    >
                      {words(row.status)}
                    </Badge>
                    {row.parkedAt && (
                      <Tooltip
                        content={row.parkedReason ? `On hold: ${row.parkedReason}` : 'On hold'}
                        size="sm"
                      >
                        <Badge variant="warning" size="sm">
                          on hold
                          {row.parkedUntil &&
                            ` until ${new Date(row.parkedUntil).toLocaleDateString()}`}
                        </Badge>
                      </Tooltip>
                    )}
                    {row.receivedUpdate && (
                      <Tooltip content="Already received an update from this ticket" size="sm">
                        <Badge variant="secondary" size="sm">
                          updated
                        </Badge>
                      </Tooltip>
                    )}
                    {/* D2 — nothing is sent for the agent. Only a TRUE owes: null means the ticket was
                      closed without a resolve — not a fix, nothing to tell the customer. */}
                    {row.owesReply === true && (
                      <Badge variant="attention" size="sm">
                        Fixed — reply to tell this customer
                      </Badge>
                    )}
                    {row.isPrimary && (
                      <Badge variant="outline" size="sm">
                        ticket created from this
                      </Badge>
                    )}
                  </div>
                  {replyData && unreachable.has(row.conversationId) && (
                    <p className="text-xs text-muted-foreground">
                      A reply cannot reach this thread: {unreachable.get(row.conversationId)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  {canManage && !row.isPrimary && !row.receivedUpdate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(row.conversationId)}
                      disabled={busy}
                      aria-label={`Remove ${row.requesterEmail}’s thread from this ticket`}
                    >
                      Remove
                    </Button>
                  )}
                  {canManage && !row.isPrimary && row.receivedUpdate && (
                    <Tooltip
                      content="This customer already received an update from this ticket, so the thread stays on it."
                      size="sm"
                    >
                      <span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          aria-label={`${row.requesterEmail}’s thread received an update and cannot be removed`}
                        >
                          Remove
                        </Button>
                      </span>
                    </Tooltip>
                  )}
                  {/* The icon opens the thread too, as the whole card did in the old list. */}
                  <Tooltip content="Open thread" size="sm">
                    <Link
                      to={threadUrl}
                      // A second way to the same thread for the mouse; keyboard and screen readers
                      // already have the name/subject link beside it.
                      tabIndex={-1}
                      aria-hidden
                      className="grid place-items-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLinkIcon className="w-3.5 h-3.5" aria-hidden />
                    </Link>
                  </Tooltip>
                </div>
              </li>
            );
          })}
          {hiddenCount > 0 && (
            <li className="py-[9px] px-3.5 text-xs border-t border-border/60 text-muted-foreground">
              + {hiddenCount} {hiddenCount === 1 ? 'thread' : 'threads'} in teams you cannot
              open.
            </li>
          )}
        </ul>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {state === 'ready' && threads.length > 0 && replyData && canManage && (
        <TicketReplyComposer
          ticketId={ticketId}
          threads={threads}
          selected={selectedIds}
          replies={replyData}
          unreachable={unreachable}
          onSent={() => void replies.refresh()}
          onQueued={(ids, outcome) => setUndoable(outcome === 'pending' ? null : { ids, outcome })}
          disabledReason={
            allDone
              ? 'Every linked thread is resolved, so there is nobody to update. Add an open thread (Add threads) or reopen one to send an update.'
              : null
          }
        />
      )}
      {state === 'ready' && threads.length > 0 && replies.failed && (
        <p className="text-sm text-muted-foreground">
          We could not read the replies sent from this ticket just now, so replying is unavailable.
        </p>
      )}

      <ConfirmDialog
        open={confirmResolve}
        onOpenChange={setConfirmResolve}
        onConfirm={() => {
          setConfirmResolve(false);
          void setThreadsStatus('resolve', resolvable);
        }}
        variant="info"
        title={`Resolve ${resolvable.length} ${plural(resolvable.length, 'thread', 'threads')}?`}
        description="Each ticked open thread is resolved. Nothing is sent to anyone — write an update first if the customers should hear about it."
        confirmText="Resolve"
      />

      <TicketAddThreadsDialog
        open={pickerOpen}
        onClose={() => {
          cancelPendingSearch();
          setPickerOpen(false);
        }}
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          // One search per pause, not per keystroke.
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => void search(value), 250);
        }}
        error={error}
        candidates={candidates}
        capped={capped}
        busy={busy}
        onAdd={(id) => void add(id)}
      />
    </div>
  );
};
