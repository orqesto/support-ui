import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Ticket as TicketIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, getButtonClasses } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';
import { formatConvId, getConvUrlId } from '@/lib/messageHelpers';
import {
  ticketThreadsService,
  type ThreadTicket,
  type TicketThread,
} from '@/services/ticketThreads.service';
import type { Message } from '@/types';
import {
  REL_BTN,
  REL_BTN_DANGER,
  REL_GROUP,
  REL_GROUP_ROW,
  REL_HINT,
  REL_JIRA_TAG,
  REL_LEAD,
  REL_POPOVER,
  REL_SECTION,
  REL_SECTION_HEAD,
  REL_SECTION_TITLE,
  REL_TICKET_CARD,
  MOBILE_SCRIM,
  MOBILE_SHEET,
} from './relatedStyles';
import { createTicketLabel, priorityLabel, statusLabel } from './messageDetailConstants';
import { bareStatusLabel } from './inboxCardHelpers';
import { useIsPhone } from './useIsPhone';

/** The prompt a fixed incident owes THIS customer (D2) — one sentence, every owed ticket named. */
export const owesReplySentence = (ticketIds: number[]): string | null => {
  if (ticketIds.length === 0) return null;
  return ticketIds.length === 1
    ? `Ticket #${ticketIds[0]} is fixed — reply to tell this customer.`
    : `Tickets ${ticketIds.map((id) => `#${id}`).join(', ')} are fixed — reply to tell this customer.`;
};

/**
 * What the header knows about this thread's tickets. `legacy`: an older backend without the
 * thread → tickets route names one ticket by its old route (id + status, nothing else).
 */
export type HeaderTickets = {
  state: 'loading' | 'ready' | 'failed' | 'unavailable';
  rows: ThreadTicket[];
  hiddenCount: number;
  legacy: { id: number; status: string | null } | null;
};

// ─── Popover shell ────────────────────────────────────────────────────────────

type RelatedPopoverProps = {
  label: string;
  onClose: () => void;
  children: ReactNode;
};

/** Space kept between the popover and the edge that would clip it. */
const EDGE_GUTTER = 8;

/**
 * How far to move a popover sideways so it stays inside every ancestor that clips it (an
 * overflow-hidden slide-over, a scroller) and the viewport. `rect` is measured unshifted.
 */
export const popoverShift = (
  rect: Pick<DOMRect, 'left' | 'right'>,
  bounds: { left: number; right: number }
): number => {
  let shift = 0;
  if (rect.right > bounds.right - EDGE_GUTTER) shift = bounds.right - EDGE_GUTTER - rect.right;
  // Never past the LEFT edge to fix the right one: the start of the popover stays readable.
  if (rect.left + shift < bounds.left + EDGE_GUTTER) shift = bounds.left + EDGE_GUTTER - rect.left;
  return shift;
};

/** Overflow values that cut off a child sticking out sideways. */
const CLIPS = new Set(['hidden', 'clip', 'auto', 'scroll']);

const clippingBounds = (node: HTMLElement) => {
  let left = 0;
  let right = window.innerWidth || document.documentElement.clientWidth;
  for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
    if (!CLIPS.has(getComputedStyle(el).overflowX)) continue;
    const box = el.getBoundingClientRect();
    left = Math.max(left, box.left);
    right = Math.min(right, box.right);
  }
  return { left, right };
};

/**
 * v4 `.k-relpop`: 380px, under its chip. role=dialog, so the detail's single-key shortcuts stand
 * down while it is open (detailShortcuts.ts dialogIsOpen) and Esc closes THIS, not the rail.
 */
export const RelatedPopover = ({ label, onClose, children }: RelatedPopoverProps) => {
  const ref = useRef<HTMLDivElement>(null);
  // Desktop only: phones show this as a bottom sheet pinned to the screen edges by CSS.
  const isPhone = useIsPhone();
  /*
    v4 draws the 380px popover left-aligned under its chip. In the 640px slide-over a chip that
    starts ~280px in pushes it past the panel's right edge, where overflow-hidden cuts it off — so
    it is measured when it opens and moved left just enough to fit.
  */
  const [shift, setShift] = useState(0);
  const shiftRef = useRef(0);
  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const measured = node.getBoundingClientRect();
    const unshifted = {
      left: measured.left - shiftRef.current,
      right: measured.right - shiftRef.current,
    };
    const next = popoverShift(unshifted, clippingBounds(node));
    shiftRef.current = next;
    setShift(next);
  }, []);
  useLayoutEffect(() => {
    if (isPhone) {
      shiftRef.current = 0;
      setShift(0);
      return;
    }
    measure();
  }, [isPhone, measure]);
  /*
    …and measured again while open whenever the room changes: the window resizing, or the panel
    that clips it changing width (ResizeObserver, where the browser has one). Measured once, a
    popover opened in a wide window stayed shifted — or cut off — after the window narrowed.
    Desktop only, like the shift itself.
  */
  useEffect(() => {
    const node = ref.current;
    if (isPhone || !node) return;
    window.addEventListener('resize', measure);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => measure());
      for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
        if (CLIPS.has(getComputedStyle(el).overflowX)) observer.observe(el);
      }
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [isPhone, measure]);
  /*
    A keyboard user lands IN the popover when it opens: the dialog itself takes focus (not its
    first control — that would be "Open ticket" one Enter away, and the list may still be
    loading). Once, on mount — never on a re-render, which would pull focus back from wherever
    the user has tabbed to inside it. Closing hands focus back to the chip (the header does it).
  */
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A picker dialog opened from here owns Esc while it is up.
      if (event.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      onClose();
    };
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || ref.current?.contains(target)) return;
      // The chip toggles the popover itself; a click inside a picker opened over the page (a
      // modal) is not "outside". Only MODAL dialogs: a non-modal one could be the page itself.
      if ((target as Element).closest?.('[data-related-chip], [aria-modal="true"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);
  return (
    <>
      {/* Phones: the popover is a bottom sheet over a scrim. A press on the scrim is outside the
          popover, so the listener above closes it — the scrim needs no handler of its own. */}
      <div aria-hidden data-testid="related-scrim" className={MOBILE_SCRIM} />
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        className={`${REL_POPOVER} ${MOBILE_SHEET} focus:outline-none`}
        style={shift !== 0 ? { left: `${shift}px` } : undefined}
      >
        {children}
      </div>
    </>
  );
};

// ─── Tickets ──────────────────────────────────────────────────────────────────

/**
 * Opening a ticket or a thread is NAVIGATION, so it is a link (staging's was): Cmd/Ctrl-click,
 * middle-click and "Open in new tab" work. Drawn with the design-system Button's own classes.
 */
const REL_LINK = cn(getButtonClasses('ghost'), REL_BTN);
const ticketHref = (ticketId: number) => `/tickets?id=${ticketId}`;

/** An older backend names one ticket by id and status, and cannot add or remove. */
const LegacyTicketCard = ({ legacy }: { legacy: NonNullable<HeaderTickets['legacy']> }) => (
  <article className={REL_TICKET_CARD}>
    <span className="font-mono text-[11.5px] text-muted-foreground">#{legacy.id}</span>
    {legacy.status && (
      <div className="text-[11.5px] text-muted-foreground">{statusLabel(legacy.status)}</div>
    )}
    <div className="flex flex-wrap items-center gap-1.5">
      <Link to={ticketHref(legacy.id)} className={REL_LINK}>
        Open ticket
      </Link>
    </div>
  </article>
);

type ThreadsState =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'unavailable' }
  | { state: 'ready'; rows: TicketThread[]; hiddenCount: number };

/**
 * Thread lists are read for the first few tickets only: one request per ticket, so a thread on
 * many tickets does not fan out into many requests each time the popover opens.
 */
export const THREAD_LIST_CAP = 5;

/**
 * The threads on each ticket, read when the popover opens (one request per ticket, for the
 * first THREAD_LIST_CAP tickets) — never on a header render. A ticket's list that fails says so;
 * it never reads as "only this thread".
 *
 * Kept by ticket id: taking this thread off one ticket does not re-read the others' lists. A
 * ticket's list is re-read when the ticket changes (`ticket:updated`) — the event the cards
 * refresh on — keeping the rows on screen until the new ones arrive.
 */
const useThreadsOfTickets = (ticketIds: number[]) => {
  const [byTicket, setByTicket] = useState<Record<number, ThreadsState>>({});
  const requested = useRef(new Set<number>());
  // Per ticket, only the latest read may write (a refresh can overtake the first read).
  const seq = useRef(new Map<number, number>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback((id: number) => {
    const mine = (seq.current.get(id) ?? 0) + 1;
    seq.current.set(id, mine);
    const current = () => alive.current && seq.current.get(id) === mine;
    // A refresh keeps the rows on screen; only a first read says "Loading".
    setByTicket((prev) =>
      prev[id]?.state === 'ready' ? prev : { ...prev, [id]: { state: 'loading' } }
    );
    ticketThreadsService
      .threadsOfTicket(id)
      .then((result) => {
        if (!current()) return;
        setByTicket((prev) => ({
          ...prev,
          [id]: result.unavailable
            ? { state: 'unavailable' }
            : { state: 'ready', rows: result.rows, hiddenCount: result.hiddenCount },
        }));
      })
      .catch((err: unknown) => {
        if (!current()) return;
        logger.error('Failed to read a ticket’s threads', err);
        // A refresh that fails keeps what is on screen; a first read that fails says it failed.
        setByTicket((prev) =>
          prev[id]?.state === 'ready' ? prev : { ...prev, [id]: { state: 'failed' } }
        );
      });
  }, []);

  const key = ticketIds.slice(0, THREAD_LIST_CAP).join(',');
  useEffect(() => {
    const ids = key ? key.split(',').map(Number) : [];
    /*
      A ticket this thread left is forgotten: if the thread is added back, its list is read anew.
      ⛔ Its rows go too, and any read still in flight for it is disowned: kept, a rejoin showed
      the pre-leave list as current — and a failed re-read kept it there, since a refresh that
      fails keeps what is on screen.
    */
    const left: number[] = [];
    for (const id of requested.current) {
      if (ids.includes(id)) continue;
      requested.current.delete(id);
      seq.current.set(id, (seq.current.get(id) ?? 0) + 1);
      left.push(id);
    }
    if (left.length > 0) {
      setByTicket((prev) => {
        const next = { ...prev };
        for (const id of left) delete next[id];
        return next;
      });
    }
    for (const id of ids) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      load(id);
    }
  }, [key, load]);

  useEffect(() => {
    const ids = key ? key.split(',').map(Number) : [];
    if (ids.length === 0) return;
    const onUpdated = (data: unknown) => {
      const ticketId = (data as { ticketId?: number } | null)?.ticketId;
      if (typeof ticketId === 'number' && ids.includes(ticketId)) load(ticketId);
    };
    subscribeToEvent('ticket:updated', onUpdated);
    return () => unsubscribeFromEvent('ticket:updated', onUpdated);
  }, [key, load]);

  return byTicket;
};

type TicketsSectionProps = {
  message: Pick<Message, 'id' | 'publicId' | 'subject' | 'isLead'>;
  tickets: HeaderTickets;
  /** MANAGE_TICKETS — the backend refuses add and remove without it. */
  canManage: boolean;
  /** CREATE_TICKETS — `POST /api/tickets` refuses without it. */
  canCreate: boolean;
  onAddToTicket: () => void;
  /** A new ticket from this thread (staging's "New ticket"). */
  onCreateTicket: () => void;
  onRetry: () => void;
  /**
   * After the server CONFIRMED this thread is off `ticketId` — the header shows it at once (a
   * re-read that fails must not leave the ticket listed), and the board's card chip reads the
   * thread list.
   */
  onRemoved?: (change: { ticketId: number; conversationId: number }) => void;
};

/**
 * v4 `linkedHTML`, for SEVERAL tickets — one customer thread can report more than one problem,
 * so it can sit on several tickets: a `.k-tkt` card per ticket the thread is on, each with the threads on it, Open ticket and Remove; then Add to ticket….
 */
export const TicketsSection = ({
  message,
  tickets,
  canManage,
  canCreate,
  onAddToTicket,
  onCreateTicket,
  onRetry,
  onRemoved,
}: TicketsSectionProps) => {
  const orgCode = useCurrentOrgCode();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threadsByTicket = useThreadsOfTickets(
    tickets.state === 'ready' ? tickets.rows.map((row) => row.ticketId) : []
  );

  /*
    Focus after a Remove. The pressed button is disabled for the request (a browser drops focus
    from a disabled control) and then its card goes — while the popover stays open, so focus fell
    to <body> and the next Tab started from the top of the page. It goes to the NEXT card's Remove
    (else its Open ticket), else to the popover itself; after a failure, back to the same Remove.
    ⛔ Only when focus is LOST — a user who tabbed on during the request keeps their place.
  */
  const sectionRef = useRef<HTMLElement>(null);
  const [focusAfter, setFocusAfter] = useState<{
    ticketId: number;
    index: number;
    removed: boolean;
  } | null>(null);

  const remove = async (ticketId: number, index: number) => {
    const conversationId = message.id;
    setBusyId(ticketId);
    setError(null);
    try {
      // The service announces the change: the header reloads its tickets from that.
      await ticketThreadsService.removeThread(ticketId, conversationId);
      // Said out loud: "Remove" could read as deleting the ticket, or this thread.
      toast.success(`Removed from ticket #${ticketId} — the ticket and this thread are both kept`);
      setFocusAfter({ ticketId, index, removed: true });
      onRemoved?.({ ticketId, conversationId });
    } catch (err) {
      logger.error('Failed to take the thread off a ticket', err);
      setError(getApiErrorMessage(err) ?? 'This thread could not be taken off that ticket.');
      setFocusAfter({ ticketId, index, removed: false });
    } finally {
      setBusyId(null);
    }
  };

  // Memoised: the focus effect below depends on it, and a fresh [] every render would re-run it.
  const rows = useMemo(() => (tickets.state === 'ready' ? tickets.rows : []), [tickets]);
  // With a visible ticket, the hidden ones count too: 1 visible + 2 hidden is "On 3 tickets".
  const ticketTotal = rows.length > 0 ? rows.length + tickets.hiddenCount : 0;
  // Only when the backend is KNOWN to have ticket links: a failed first read may be an older
  // backend, where the picker would post to a route that does not exist (Retry is offered).
  const canAdd = canManage && tickets.state === 'ready';

  useEffect(() => {
    const section = sectionRef.current;
    if (!focusAfter || !section || busyId !== null) return;
    const focusLost = () => {
      const active = document.activeElement;
      return (
        !active ||
        active === document.body ||
        !active.isConnected ||
        (active instanceof HTMLButtonElement && active.disabled)
      );
    };
    if (!focusAfter.removed) {
      setFocusAfter(null);
      if (focusLost()) {
        section
          .querySelector<HTMLElement>(`[data-remove-ticket="${focusAfter.ticketId}"]`)
          ?.focus({ preventScroll: true });
      }
      return;
    }
    // Wait for the reloaded list without that ticket (a reload in flight is not "gone").
    if (tickets.state !== 'ready' || rows.some((row) => row.ticketId === focusAfter.ticketId)) {
      return;
    }
    setFocusAfter(null);
    if (!focusLost()) return;
    const next = rows[focusAfter.index];
    const card = next
      ? section.querySelector(`[data-testid="related-ticket-${next.ticketId}"]`)
      : null;
    const target =
      card?.querySelector<HTMLElement>('[data-remove-ticket]') ??
      card?.querySelector<HTMLElement>('[data-open-ticket]') ??
      section.closest<HTMLElement>('[role="dialog"]');
    target?.focus({ preventScroll: true });
  }, [focusAfter, busyId, tickets.state, rows]);

  return (
    <section ref={sectionRef} className={REL_SECTION} aria-label="Tickets">
      <div className={REL_SECTION_HEAD}>
        <h5 className={REL_SECTION_TITLE}>
          <TicketIcon className="h-[13px] w-[13px] text-muted-foreground flex-none" aria-hidden />
          {/* Only what is known: "Tickets" while loading, after a failed read, or when every
              ticket is in a department this viewer cannot open. */}
          {ticketTotal > 1
            ? `On ${ticketTotal} tickets`
            : rows.length === 1 || tickets.legacy
              ? 'Linked to ticket'
              : 'Tickets'}
        </h5>
      </div>

      {tickets.state === 'loading' && <p className={REL_LEAD}>Loading…</p>}
      {tickets.state === 'failed' && (
        <div className="grid gap-1.5">
          {/* ⛔ A failed READ is not "on no ticket". */}
          <p className={REL_LEAD}>
            We could not read this thread’s tickets just now, so this list is not complete.
          </p>
          <div>
            <Button variant="ghost" className={REL_BTN} onClick={onRetry}>
              Try again
            </Button>
          </div>
        </div>
      )}
      {tickets.state === 'unavailable' && tickets.legacy && (
        <LegacyTicketCard legacy={tickets.legacy} />
      )}

      {rows.map((row, index) => {
        const threads = threadsByTicket[row.ticketId];
        const listed = index < THREAD_LIST_CAP;
        const owes = owesReplySentence(row.owesReply === true ? [row.ticketId] : []);
        // Status · priority. The route sends no assignee, so the card names none (v4 drew one).
        const facts = [
          { key: 'status', text: row.status ? statusLabel(row.status) : '' },
          { key: 'priority', text: row.priority ? priorityLabel(row.priority) : '' },
        ].filter((fact) => fact.text);
        return (
          <div
            key={row.ticketId}
            className="grid gap-2"
            data-testid={`related-ticket-${row.ticketId}`}
          >
            <article className={REL_TICKET_CARD}>
              <div className="flex items-center gap-2">
                {/* #id — the same number the ticket page and the list show. */}
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  #{row.ticketId}
                </span>
                {row.externalId && <span className={REL_JIRA_TAG}>Jira {row.externalId}</span>}
              </div>
              <b className="text-[13px] font-semibold leading-[1.35]">{row.title}</b>
              {facts.length > 0 && (
                <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11.5px] text-muted-foreground">
                  {facts.map((fact, index) => (
                    <span key={fact.key}>
                      {index > 0 && <span className="mr-2.5 text-muted-foreground/60">·</span>}
                      {fact.text}
                    </span>
                  ))}
                </div>
              )}
              {/* D2 — nothing is sent for the agent: the incident is fixed, THIS customer has not
                  been told yet. Only a TRUE owes; null = closed without a resolve (not a fix). */}
              {owes && <p className="m-0 text-[11.5px] font-medium text-warning">{owes}</p>}
            </article>

            {!listed && <p className={REL_HINT}>Open the ticket to see the threads on it.</p>}
            {threads?.state === 'loading' && (
              <p className={REL_HINT}>Loading the threads on this ticket…</p>
            )}
            {threads?.state === 'failed' && (
              <p className={REL_HINT}>We could not list the threads on this ticket just now.</p>
            )}
            {threads?.state === 'ready' && (
              <>
                <p className={REL_LEAD}>
                  {threads.rows.length + threads.hiddenCount}{' '}
                  {threads.rows.length + threads.hiddenCount === 1 ? 'thread' : 'threads'} on this
                  ticket
                </p>
                <ul className={REL_GROUP}>
                  {threads.rows.map((thread) => {
                    const self = thread.conversationId === message.id;
                    const id = formatConvId(
                      { id: thread.conversationId, publicId: thread.publicId },
                      orgCode
                    );
                    return (
                      <li
                        key={thread.conversationId}
                        className={`${REL_GROUP_ROW} ${self ? 'bg-muted' : ''}`}
                      >
                        <span className="flex-1 min-w-0 truncate">
                          <span className="font-mono text-[11px] text-muted-foreground mr-1">
                            {id}
                          </span>
                          {thread.subject?.trim() ? thread.subject : '(no subject)'}
                          <span className="block text-[10.5px] text-muted-foreground">
                            {self
                              ? 'This thread'
                              : thread.status
                                ? bareStatusLabel(thread.status)
                                : ''}
                          </span>
                        </span>
                        {!self && (
                          <Link
                            to={`/messages?id=${getConvUrlId({ id: thread.conversationId, publicId: thread.publicId }, orgCode)}`}
                            className={REL_LINK}
                            aria-label={`Open ${id}`}
                          >
                            Open
                          </Link>
                        )}
                      </li>
                    );
                  })}
                  {threads.hiddenCount > 0 && (
                    <li className={`${REL_GROUP_ROW} text-muted-foreground`}>
                      + {threads.hiddenCount} in departments you cannot open
                    </li>
                  )}
                </ul>
              </>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <Link to={ticketHref(row.ticketId)} className={REL_LINK} data-open-ticket>
                Open ticket
              </Link>
              {row.isPrimary ? (
                <span className="text-[11px] text-muted-foreground">created from this thread</span>
              ) : (
                canManage && (
                  <Button
                    variant="ghost"
                    className={REL_BTN_DANGER}
                    onClick={() => void remove(row.ticketId, index)}
                    data-remove-ticket={row.ticketId}
                    disabled={busyId !== null}
                    aria-label={`Remove from ticket #${row.ticketId}: ${row.title}`}
                  >
                    {busyId === row.ticketId ? 'Removing…' : 'Remove'}
                  </Button>
                )
              )}
            </div>
          </div>
        );
      })}

      {tickets.state === 'ready' && tickets.hiddenCount > 0 && (
        <p className={REL_HINT}>
          + {tickets.hiddenCount} {tickets.hiddenCount === 1 ? 'ticket' : 'tickets'} in departments
          you cannot open.
        </p>
      )}
      {error && <p className="m-0 text-[12px] text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {canAdd && (
          <Button variant="ghost" className={REL_BTN} onClick={onAddToTicket}>
            Add to ticket…
          </Button>
        )}
        {/* In every state, as staging's "New ticket" was — an older backend and a viewer who
            may create but not manage tickets included. */}
        {canCreate && (
          <Button variant="ghost" className={REL_BTN} onClick={onCreateTicket}>
            {createTicketLabel(message.isLead)}
          </Button>
        )}
      </div>
    </section>
  );
};
