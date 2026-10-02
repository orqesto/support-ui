import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/lib/logger';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { messageService } from '@/services/message.service';
import { ticketThreadsService, type ThreadTicket } from '@/services/ticketThreads.service';
import { THREAD_TICKETS_CHANGED } from '@/services/ticketThreadsEvents';
import { conversationMergeService, type ManualMerge } from '@/services/conversationMerge.service';
import type { HeaderTickets } from './RelatedPopover';
import { withMergeChange, type MergeChange } from './useThreadMergeContext';

const NO_TICKETS: HeaderTickets = { state: 'loading', rows: [], hiddenCount: 0, legacy: null };

/** A ticket change the server has just CONFIRMED (its request succeeded), for one thread. */
export type TicketChange =
  | { conversationId: number; removed: number }
  | { conversationId: number; added: ThreadTicket };

/**
 * The tickets with a confirmed change applied — so a re-read that then fails (and keeps what is
 * shown) never leaves a removed ticket listed beside the "Removed" toast, or an added one
 * missing. Only a list that was READ is patched: "loading" / "failed" / an older backend say
 * nothing a patch could make true. Idempotent: a re-read that already carries the change wins.
 */
export const withTicketChange = (prev: HeaderTickets, change: TicketChange): HeaderTickets => {
  if (prev.state !== 'ready') return prev;
  if ('removed' in change) {
    if (!prev.rows.some((row) => row.ticketId === change.removed)) return prev;
    return { ...prev, rows: prev.rows.filter((row) => row.ticketId !== change.removed) };
  }
  if (prev.rows.some((row) => row.ticketId === change.added.ticketId)) return prev;
  // Newest first, as the route lists them: the ticket just joined leads.
  return { ...prev, rows: [change.added, ...prev.rows] };
};

/**
 * The thread header's tickets and merges: every ticket this thread is on (a thread can be on
 * several), as the header last read it, kept fresh by the events that can change it; and what
 * an agent merged into this thread — read here unless the host owns that read.
 */
export const useThreadTicketsState = ({
  messageId,
  hostMerges,
  onReloadMerges,
  onMergeChange,
  onThreadChange,
}: {
  messageId: number;
  /** The host's read of the merges (see MessageDetailHeaderProps.merges). */
  hostMerges?: ManualMerge[] | null;
  /** Present when the host owns the merges read. */
  onReloadMerges?: () => void;
  /** The host applies a confirmed merge change to its list (see MessageDetailHeaderProps). */
  onMergeChange?: (change: MergeChange) => void;
  /** Called when the thread changes, before its tickets are read again. Must be stable. */
  onThreadChange: () => void;
}) => {
  const [tickets, setTickets] = useState<HeaderTickets>(NO_TICKETS);
  // The thread shown NOW — a change confirmed after a switch belongs to the thread it was made on.
  const shownThread = useRef(messageId);

  // Loads can overlap (a socket event, an add/remove announcing this thread's tickets changed):
  // only the latest may write.
  const ticketsSeq = useRef(0);
  const loadTickets = useCallback(() => {
    const seq = ++ticketsSeq.current;
    ticketThreadsService
      .ticketsOfThread(messageId)
      .then(async (result) => {
        if (seq !== ticketsSeq.current) return;
        if (result.unavailable) {
          // An older backend: the one ticket it can name.
          const res = await messageService.getLinkedTicket(messageId);
          if (seq !== ticketsSeq.current) return;
          setTickets({
            state: 'unavailable',
            rows: [],
            hiddenCount: 0,
            legacy: res?.data ? { id: res.data.id, status: res.data.status ?? null } : null,
          });
          return;
        }
        setTickets({
          state: 'ready',
          rows: result.rows,
          hiddenCount: result.hiddenCount,
          legacy: null,
        });
      })
      .catch((err: unknown) => {
        if (seq !== ticketsSeq.current) return;
        logger.error('Failed to read the thread’s tickets', err);
        // ⛔ A failed READ is not "on no ticket". A refresh that fails keeps what is on screen;
        // a first read that fails says it failed.
        setTickets((prev) => (prev.state === 'loading' ? { ...prev, state: 'failed' } : prev));
      });
  }, [messageId]);

  useEffect(() => {
    shownThread.current = messageId;
    setTickets(NO_TICKETS);
    onThreadChange();
    loadTickets();
  }, [loadTickets, onThreadChange, messageId]);

  /**
   * After an add/remove the server CONFIRMED: show it now. The service has already announced it,
   * so a re-read is in flight; when it succeeds it replaces this with the server's list, and when
   * it fails it keeps what is shown — which must not be the state the server just contradicted.
   * ⛔ The read in flight is NOT disowned: it started after the change and is the server's truth.
   */
  const applyTicketChange = useCallback((change: TicketChange) => {
    if (change.conversationId !== shownThread.current) return;
    setTickets((prev) => withTicketChange(prev, change));
  }, []);

  const ticketIds = useMemo(
    () => (tickets.legacy ? [tickets.legacy.id] : tickets.rows.map((row) => row.ticketId)),
    [tickets]
  );

  // What an agent merged into this thread. null = the backend could not say (older backend, or
  // the thread's first read failed) — then nothing merge-related is offered (a merge route that
  // 404s is worse than none).
  // The host reads it (one request per open) when it passes `onReloadMerges`; else it is read here.
  const hostOwnsMerges = onReloadMerges !== undefined;
  const [ownMerges, setOwnMerges] = useState<ManualMerge[] | null>(null);
  const mergesSeq = useRef(0);
  const loadOwnMerges = useCallback(() => {
    const seq = ++mergesSeq.current;
    void conversationMergeService.listMerges(messageId).then((rows) => {
      // A refresh that fails keeps what is on screen; only a first read can leave it null.
      if (seq === mergesSeq.current) setOwnMerges((prev) => rows ?? prev);
    });
  }, [messageId]);
  useEffect(() => {
    setOwnMerges(null);
    if (hostOwnsMerges) {
      mergesSeq.current += 1; // disown a read still in flight
      return;
    }
    loadOwnMerges();
  }, [loadOwnMerges, hostOwnsMerges]);
  const merges = hostOwnsMerges ? (hostMerges ?? null) : ownMerges;
  const loadMerges = onReloadMerges ?? loadOwnMerges;
  /**
   * After a merge/unmerge the server CONFIRMED: show it now, before the re-read — a re-read that
   * fails keeps what is shown, and that must not be the state the server just contradicted.
   */
  const applyMergeChange = useCallback(
    (change: MergeChange) => {
      if (hostOwnsMerges) {
        onMergeChange?.(change);
        return;
      }
      mergesSeq.current += 1; // a read from before the change must not write over it
      setOwnMerges((prev) => withMergeChange(prev, change));
    },
    [hostOwnsMerges, onMergeChange]
  );

  useEffect(() => {
    if (ticketIds.length === 0) return;
    // Any of this thread's tickets changing can change the headline or the reply prompt.
    const handler = (data: unknown) => {
      const ev = data as { ticketId: number; status?: string };
      if (ticketIds.includes(ev.ticketId)) loadTickets();
    };
    subscribeToEvent('ticket:updated', handler);
    return () => unsubscribeFromEvent('ticket:updated', handler);
  }, [ticketIds, loadTickets]);

  useEffect(() => {
    // This thread was added to a ticket or taken off one — from this header's picker or Remove,
    // or anywhere else in the app (ticketThreadsService announces every add and remove).
    const onChanged = (event: Event) => {
      const ids =
        (event as CustomEvent<{ conversationIds: number[] }>).detail?.conversationIds ?? [];
      if (ids.includes(messageId)) loadTickets();
    };
    window.addEventListener(THREAD_TICKETS_CHANGED, onChanged);
    return () => window.removeEventListener(THREAD_TICKETS_CHANGED, onChanged);
  }, [messageId, loadTickets]);

  useEffect(() => {
    // D2: a reply on this thread is what tells the customer — the "fixed, reply to tell this
    // customer" prompt must go once it is sent, or it invites a second reply.
    const onReplied = (data: unknown) => {
      if ((data as { messageId: number }).messageId === messageId) loadTickets();
    };
    subscribeToEvent('message:replied', onReplied);
    // A reply that failed to send told nobody: the prompt comes back.
    subscribeToEvent('send-failed', onReplied);
    return () => {
      unsubscribeFromEvent('message:replied', onReplied);
      unsubscribeFromEvent('send-failed', onReplied);
    };
  }, [messageId, loadTickets]);

  return {
    tickets,
    loadTickets,
    applyTicketChange,
    ticketIds,
    merges,
    loadMerges,
    applyMergeChange,
    hostOwnsMerges,
  };
};
