import { ShieldAlert, AlertTriangle, Sparkles } from 'lucide-react';
import type { Message } from '@/types';
import { ticketDisplayId } from '@/lib/ticketReference';
import {
  closedStatusMeta,
  getStatusBadge,
  WORKFLOW_STATUS_META,
  type WorkflowStatus,
} from '../inboxCardHelpers';
import { sentenceCase, type InboxBadge } from '../messageDetailConstants';
import { owesReplySentence, type HeaderTickets } from '../RelatedPopover';

/** The ticket chip's numbers and words, from the thread's tickets (moved out of the header). */
export function getTicketChipState(tickets: HeaderTickets, orgCode: string | undefined) {
  const headlineTicket =
    tickets.rows.find((row) => row.status !== 'resolved' && row.status !== 'closed') ??
    tickets.rows[0];
  const linkedTicketId = headlineTicket?.ticketId ?? tickets.legacy?.id ?? null;
  /** The ID the chip draws (`ACME-SUP-T-42`, `#21` without a number) — its name and tooltip say the same. */
  const linkedTicketShown =
    linkedTicketId === null
      ? null
      : ticketDisplayId({ id: linkedTicketId, reference: headlineTicket?.reference }, orgCode);
  const ticketCount = tickets.rows.length || (tickets.legacy ? 1 : 0);
  /*
    Tickets this viewer cannot open still count: 1 visible + 2 hidden is "#12 +2", named "Linked
    to 3 tickets (2 in departments you cannot open)" — never "#12" alone, which reads as one.
  */
  const hiddenTicketCount = tickets.state === 'ready' ? tickets.hiddenCount : 0;
  const totalTicketCount = ticketCount + hiddenTicketCount;
  /** D2: finished tickets whose fix this customer has not been told about yet. */
  const owedTicketIds = tickets.rows
    .filter((row) => row.owesReply === true)
    .map((row) => ticketDisplayId({ id: row.ticketId, reference: row.reference }, orgCode));
  const owedSentence = owesReplySentence(owedTicketIds);
  // The chip shows whenever there is something to say: a ticket, tickets this viewer cannot open,
  // or a read that failed (⛔ never "on no ticket" for "could not ask").
  const showTicketChip =
    ticketCount > 0 ||
    (tickets.state === 'ready' && tickets.hiddenCount > 0) ||
    tickets.state === 'failed';
  /** The chip's own words, exactly as drawn: "#12 +1", "2 hidden", "?". */
  const ticketChipText =
    linkedTicketId === null
      ? tickets.state === 'failed'
        ? '?'
        : `${tickets.hiddenCount} hidden`
      : `${linkedTicketShown}${totalTicketCount > 1 ? ` +${totalTicketCount - 1}` : ''}`;
  /** What the chip means — the tooltip. */
  const ticketChipMeaning =
    linkedTicketId === null
      ? tickets.state === 'failed'
        ? 'Could not read this thread’s tickets'
        : `On ${tickets.hiddenCount} ${tickets.hiddenCount === 1 ? 'ticket' : 'tickets'} in teams you cannot open`
      : totalTicketCount > 1
        ? `Linked to ${totalTicketCount} tickets${
            hiddenTicketCount > 0 ? ` (${hiddenTicketCount} in teams you cannot open)` : ''
          }`
        : `Linked to ticket ${linkedTicketShown}`;
  /*
    WCAG 2.5.3 label in name: the accessible name STARTS with the visible words ("#12 +1 —
    linked to 2 tickets"), so a voice-control user saying what they see reaches the chip.
  */
  const ticketChipName = [
    `${ticketChipText} — ${ticketChipMeaning.charAt(0).toLowerCase()}${ticketChipMeaning.slice(1)}`,
    owedSentence,
  ]
    .filter(Boolean)
    .join('. ');
  return {
    headlineTicket,
    linkedTicketId,
    totalTicketCount,
    owedSentence,
    showTicketChip,
    ticketChipText,
    ticketChipMeaning,
    ticketChipName,
  };
}

/** The header's inbox badge: spam, suspicious, re-analysing or "Not analysed" — or none. */
export function getInboxBadge(
  message: Message,
  {
    isSpam,
    isFiltered,
    isSuspicious,
    aiReanalysisInFlight,
  }: {
    /**
     * The thread's spam verdict: the NEWEST inbound mail's (`newestSpamVerdict`), not the first
     * mail's frozen `metadata.spamCheck`.
     */
    isSpam: boolean;
    isFiltered: boolean;
    isSuspicious: boolean;
    aiReanalysisInFlight: boolean;
  }
): InboxBadge | null {
  if (isSpam || isFiltered)
    return {
      label: message.spamConfirmedAt ? 'Spam · confirmed' : 'Spam',
      icon: <ShieldAlert className="w-2.5 h-2.5" />,
      cls: 'text-destructive bg-destructive-muted border-destructive-line',
    };
  if (isSuspicious)
    return {
      label: 'Suspicious',
      icon: <AlertTriangle className="w-2.5 h-2.5" />,
      cls: 'text-warning bg-warning-muted border-warning-line',
    };
  // Customer just followed up via the tracking page and the BE is re-running
  // analysis on the fresh thread. Shows until the processor emits 'complete'
  // (≤ a few seconds under the 10/min limiter) so agents see why suggestions
  // are about to shift instead of having stale ones briefly contradict the
  // new reply.
  if (aiReanalysisInFlight)
    return {
      label: 'Reanalysing',
      icon: <Sparkles className="w-2.5 h-2.5 animate-pulse" />,
      cls: 'text-ai border-ai-line bg-ai-muted',
    };
  // The WORK status (Open/In Progress/Pending/On-hold/Resolved, or Closed / Not customer work for
  // a closed thread) is shown by the
  // status SELECT next to this badge — don't duplicate it here. This badge only
  // surfaces Queue-axis overlays the select doesn't: spam/suspicious/re-analysing
  // (above) and "Not analysed" (a brand-new inbound with no AI analysis yet).
  const wf = getStatusBadge(message);
  if (!wf) return null; // filtered/needs_routing — Queue axis
  const hasAnalysis = !!(message.metadata as Record<string, unknown> | undefined)?.analysis;
  if (wf.label === 'Open' && !hasAnalysis)
    return {
      label: 'Not analysed',
      icon: null,
      cls: 'text-muted-foreground border-border bg-muted/60',
    };
  return null; // plain work status → shown by the select, not duplicated here
}

// Header status control: shows the current (possibly automatic) work status and
// offers only the MANUAL actions. Automatic statuses (open/in_progress/pending)
// appear disabled — they're derived from replies, not settable. 'On-hold' and
// 'Resolved' are always selectable; 'Open' is selectable only to return a parked
// or resolved conversation to the live flow (reopen / un-hold).
// Only the actionable transitions from the current state (keeps the menu clean —
// the automatic statuses aren't shown as greyed dead options). The current status
// is included once, disabled, so the chip displays it.
export function buildStatusDisplayOptions(message: Message, currentWorkflowStatus: WorkflowStatus) {
  const actionableStatuses: WorkflowStatus[] =
    currentWorkflowStatus === 'resolved'
      ? ['open'] // reopen
      : currentWorkflowStatus === 'on_hold'
        ? ['open', 'resolved'] // take off hold · resolve
        : ['on_hold', 'resolved']; // active (open/in_progress/pending): park · resolve
  const menuLabelFor = (ws: WorkflowStatus): string =>
    ws === 'open'
      ? currentWorkflowStatus === 'resolved'
        ? 'Reopen'
        : 'Take off hold'
      : sentenceCase(WORKFLOW_STATUS_META[ws].label);
  // A closed thread is not a resolution — the same chip the list shows (`closedStatusMeta`).
  const currentStatusMeta =
    closedStatusMeta(message) ?? WORKFLOW_STATUS_META[currentWorkflowStatus];
  return [
    {
      value: currentWorkflowStatus,
      label: sentenceCase(currentStatusMeta.label),
      // Sentence case like the chip above it and every other row ("In progress", not "In
      // Progress" under an "In progress" chip).
      menuLabel: sentenceCase(currentStatusMeta.label),
      chipClassName: currentStatusMeta.className,
      isDisabled: true,
    },
    ...actionableStatuses
      .filter((ws) => ws !== currentWorkflowStatus)
      .map((ws) => ({
        value: ws,
        label: sentenceCase(WORKFLOW_STATUS_META[ws].label),
        menuLabel: menuLabelFor(ws),
        chipClassName: WORKFLOW_STATUS_META[ws].className,
        isDisabled: false,
      })),
  ];
}
