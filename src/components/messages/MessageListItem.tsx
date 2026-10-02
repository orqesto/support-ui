/* eslint-disable max-lines -- two layouts of one row (comfortable card, compact line) share
   every derived value; splitting them would duplicate the derivations, which is how two list
   rows end up disagreeing about the same thread. */
import { useState } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  BookOpen,
  Check,
  Copy,
  Mail,
  MailOpen,
  MessagesSquare,
  Paperclip,
  Ticket,
} from 'lucide-react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { messageService, type MessageThread } from '@/services/message.service';
import { ticketChip } from './ticketChip';
import { ReceivedAtAddresses } from './ReceivedAtAddresses';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDepartments } from '@/hooks/useDepartments';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { getChannelIcon, formatConvId, getConvUrlId, isTriageMessage } from '@/lib/messageHelpers';
import { logger } from '@/lib/logger';
import { SPAM_LOG_CARD_COPY } from '@/lib/spamLogCardCopy';
import { previewText } from '@/lib/stripHtml';
import { cn, formatAge, formatDate, formatWhen, safeCssColor } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DepartmentBadge } from './DepartmentBadge';
import { MessageSignalBadges } from './MessageSignalBadges';
import { RowAssignee } from './RowAssignee';
import type { ListDensity } from './useListPresentation';
import { useAiDraftsOff } from '@/hooks/useAiDraftsOff';
import {
  SELECT_GROUP_CLASS,
  TOUCH_PRESS_GUARD_CLASS,
  SELECT_ID_ATTRIBUTE,
  isRangeClick,
  selectBoxRevealClass,
  type ToggleSelected,
} from './bulk/selectMode';
import { useLongPress } from './bulk/useLongPress';
import {
  SPINE_BG,
  getAiState,
  getPriorityBadge,
  getSpine,
  getRoutingBadge,
  getSuspicionBadge,
  getStatusBadge,
  hasAttachments,
} from './inboxCardHelpers';

type MessageListItemProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
  /** Refresh the list after a read/unread toggle so server truth catches up. */
  onReadChanged?: () => void;
  /** Bulk selection — same contract as the kanban card. Absent = no checkbox. */
  selected?: boolean;
  onToggleSelected?: ToggleSelected;
  /**
   * Something is selected somewhere in the list: every row shows its box, not just the hovered
   * or focused one (owner, 2026-09-28). False = boxes appear on hover / keyboard focus only.
   */
  selectMode?: boolean;
  /**
   * Messages list v2. `comfortable` is the card per thread staging always drew; `compact` is
   * one ruled line per thread — identity · subject + preview · signals · assignee · age — for
   * agents who scan a long queue. Same data, same actions, same order of precedence.
   */
  density?: ListDensity;
  /** The thread open in the split pane — the row shows it is the one being read. */
  current?: boolean;
  /** The list column is narrow (split layout): the compact line wraps to two. */
  narrow?: boolean;
};

export const MessageListItem = ({
  thread,
  onOpen,
  onReadChanged,
  selected,
  onToggleSelected,
  selectMode = false,
  density = 'comfortable',
  current = false,
  narrow = false,
}: MessageListItemProps) => {
  // Before any early return — hooks must run in the same order on every render.
  const { off: aiDraftsOff } = useAiDraftsOff();
  const msg = thread.latestMessage;
  // A spam-rule record (`spamlog_NN`, negative id) has no conversation behind it and
  // every bulk action refuses it: no box, no long-press, no `x`.
  const selectableId =
    onToggleSelected && msg && msg.id > 0 && !thread.threadId.startsWith('spamlog_')
      ? msg.id
      : null;
  // Touch long-press selects (never deselects — the box is on screen by then to untick it).
  const longPress = useLongPress(
    selectableId !== null && onToggleSelected
      ? () => {
          if (!selected) onToggleSelected(selectableId);
        }
      : undefined
  );
  const { data: allDepts = [] } = useDepartments();
  const orgCode = useCurrentOrgCode();
  const [copied, setCopied] = useState(false);
  // Optimistic read/unread shadow so the row flips instantly; cleared once the server value
  // catches up on the next fetch.
  const [optimisticRead, setOptimisticRead] = useState<boolean | null>(null);

  if (!msg) return null;

  const primaryDept = msg.departmentId
    ? allDepts.find((dept) => dept.id === msg.departmentId)
    : undefined;
  const needsRouting = msg.status === 'needs_routing';
  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;
  // What the row is sorted by, so the timestamp shown and the ordering agree: when the
  // LAST message in the thread was sent. `lastMessageAt` used to be the conversation's
  // own created/received time (its FIRST message) despite the name — fixed server-side.
  const activityAt = thread.lastMessageAt ?? receivedAt;

  const signalMessage = thread.latestIncomingMessage ?? msg;
  const spine = getSpine(signalMessage, thread);
  const aiState = getAiState(signalMessage, thread, aiDraftsOff);
  const statusBadge = getStatusBadge(msg);
  /** Synthetic spam_log row (`spamlog_NN`, negative id) — see the chip below. */
  const isBlockedSpamLog = thread.threadId.startsWith('spamlog_');
  // Separate axis from the work status: a thread can be awaiting routing AND open.
  const routingBadge = getRoutingBadge(msg);
  const suspicionBadge = getSuspicionBadge(msg);
  const priorityBadge = getPriorityBadge(msg.priority);

  // Shared org-wide read/unread (triage queues only): unread = dot + bold; read =
  // muted. Another agent reading the thread mutes it here too, on the next fetch.
  const isTriage = isTriageMessage(msg);
  const serverIsRead = thread.isRead ?? false;
  const effectiveIsRead =
    optimisticRead !== null && optimisticRead !== serverIsRead ? optimisticRead : serverIsRead;
  const showUnread = isTriage && !effectiveIsRead;
  const senderClass = showUnread
    ? 'font-bold text-foreground'
    : isTriage && effectiveIsRead
      ? 'font-semibold text-muted-foreground'
      : 'font-semibold';

  const handleToggleRead = async (event: ReactMouseEvent) => {
    event.stopPropagation();
    const next = !effectiveIsRead;
    setOptimisticRead(next);
    try {
      if (next) await messageService.markRead(msg.id);
      else await messageService.markUnread(msg.id);
      onReadChanged?.();
    } catch (err) {
      setOptimisticRead(!next);
      logger.error('Failed to toggle read state:', err);
    }
  };

  const labels =
    (msg.labels as
      | {
          id: number;
          name: string;
          color: string;
          source?: 'conversation' | 'ticket' | 'contact';
        }[]
      | undefined) ?? [];
  const visibleLabels = labels.slice(0, 2);
  const overflowLabels = labels.slice(2);

  const isFromKBSource = (msg.metadata as { isFromKBSource?: boolean })?.isFromKBSource;
  const linkedTicketKey =
    (msg.metadata as { linkedTicketExternalId?: string })?.linkedTicketExternalId ?? null;
  // One ticket or several (2026-09-30) — the words for each state live in `ticketChip`.
  const chip = ticketChip(thread, linkedTicketKey);
  // Orphan outbound: a sent message that couldn't be paired with an inbound
  // parent during Gmail backfill. Marked status='filtered' + this flag so
  // it stays out of the active inbox; surfacing the badge here so the row
  // is self-explanatory instead of looking like an unanalyzed inbound.
  const isOrphanOutgoing = Boolean((msg.metadata as { orphanOutgoing?: boolean })?.orphanOutgoing);
  // One-sided outbound: same shape as the echo above — our own sent mail with no inbound —
  // but this row is NOT hidden. It kept its status, assignee and SLA and sits in the queue,
  // because hiding these is what let a chargeback negotiation and a delivery claim go unowned
  // for two days. It needs a badge for the opposite reason the echo does: without one it looks
  // like an ordinary thread and nothing says the customer never actually wrote in.
  const isOneSidedOutbound = Boolean(
    (msg.metadata as { oneSidedOutbound?: boolean })?.oneSidedOutbound
  );

  // Don't open the conversation if the click was the end of a text selection
  // — agents need to be able to copy IDs, sender emails, subject text.
  const handleCardClick = () => {
    const sel = window.getSelection?.();
    if (sel && sel.toString().length > 0) return;
    onOpen(thread);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(thread);
    }
  };

  const compact = density === 'compact';

  // Top-right in the card, vertically centred on the compact line — the same corner as the
  // kanban card so the gesture is the same in every view. stopPropagation: the whole row opens
  // the thread on click, and an agent selecting rows is doing so precisely to avoid opening them.
  const selectBox = selectableId !== null && onToggleSelected && (
    <div
      // Hidden (opacity only — still tabbable and announced) until the row is hovered or
      // focused, or anything is selected; see bulk/selectMode.ts.
      className={cn(
        'absolute right-3 z-20',
        compact ? 'top-1/2 -translate-y-1/2' : 'top-2.5',
        selectBoxRevealClass(selectMode || selected === true)
      )}
      onClick={(event) => event.stopPropagation()}
      // Shift-click would otherwise also drag a text selection across every row between.
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      // Only the keys the ROW acts on (Enter/Space open it). Everything else bubbles, so the
      // page's `x` / Esc shortcuts still hear a key pressed on a focused box.
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      role="presentation"
    >
      <Checkbox
        checked={selected === true}
        // The address is on the THREAD row (what the row shows); latestMessage has no sender.
        aria-label={`Select message from ${thread.sender || msg.sender}`}
        onChange={(event) =>
          isRangeClick(event.nativeEvent)
            ? onToggleSelected(selectableId, { range: true })
            : onToggleSelected(selectableId)
        }
      />
    </div>
  );

  const spineBar = (
    <span
      aria-hidden="true"
      className={`absolute left-0 top-0 bottom-0 w-[3px] ${SPINE_BG[spine]}`}
    />
  );

  const readToggle = isTriage && (
    <Tooltip content={effectiveIsRead ? 'Mark as unread' : 'Mark as read'} size="sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={effectiveIsRead ? 'Mark as unread' : 'Mark as read'}
        onClick={handleToggleRead}
        className="shrink-0 p-0.5 w-auto h-auto rounded opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground"
      >
        {effectiveIsRead ? (
          <MailOpen className="w-3.5 h-3.5" />
        ) : (
          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </Button>
    </Tooltip>
  );

  // Unread dot · channel · sender · read toggle. The department leads it in the card and is a
  // coloured square of its own in the compact line, where a chip would eat the sender.
  const identity = (
    <>
      {showUnread && (
        <span aria-hidden="true" className="w-2 h-2 rounded-full bg-primary shrink-0" />
      )}
      <span className="text-muted-foreground shrink-0">{getChannelIcon(msg.channel)}</span>
      <p
        className={cn(
          'flex-1 min-w-0 truncate',
          compact ? 'text-[13.5px]' : 'text-sm',
          senderClass
        )}
      >
        {thread.sender}
      </p>
      {readToggle}
    </>
  );

  const chipClass =
    'inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold shrink-0';

  /*
    The signal chips. The compact line keeps the ones that change what you do next — risk,
    blocked, routing, suspicion, priority, AI, outbound — and drops the lifecycle status (the
    lens chips above already say it) and the labels (decoration at that height). Precedence is
    the card's, so the two at most that fit are the same two the card leads with.
  */
  const signals = (
    <>
      <MessageSignalBadges message={signalMessage} size="sm" mode="card" />

      {/*
        A spam-log row is NOT a conversation. A spam-rule record whose conversation is no
        longer here is listed so it is not invisible — that silence is what let a real
        customer's mail go missing — but it has no events, notes or activity, so opening
        it shows a read-only dialog instead of the detail pane.

        Without this chip the row is indistinguishable from its neighbours and the dialog
        reads as a bug: you click expecting a thread and get a modal. Say so first.
      */}
      {isBlockedSpamLog && (
        <span
          className={`${chipClass} bg-warning-muted text-warning`}
          title={SPAM_LOG_CARD_COPY.chipTitle}
        >
          {SPAM_LOG_CARD_COPY.chip}
        </span>
      )}

      {!compact && statusBadge && (
        <span className={`${chipClass} ${statusBadge.className}`}>{statusBadge.label}</span>
      )}

      {/* Says why an otherwise ordinary thread is asking for attention. Without it these
          rejoin the board looking like any other thread, with nothing indicating that
          opening one is what assigns its department. */}
      {routingBadge && (
        <span
          className={`${chipClass} ${routingBadge.className}`}
          title="Open this thread to choose its department"
        >
          {routingBadge.label}
        </span>
      )}

      {/* ⛔ The thread is SHOWN now instead of hidden, so it must be MARKED. Unbadged
          suspicion renders possible phishing as ordinary mail — worse than hiding it. */}
      {suspicionBadge && (
        <span
          className={`${chipClass} ${suspicionBadge.className}`}
          title="Flagged suspicious — open it to approve or mark as spam"
        >
          {suspicionBadge.label}
        </span>
      )}

      {priorityBadge && (
        <span className={`${chipClass} ${priorityBadge.className}`}>{priorityBadge.label}</span>
      )}

      {aiState && (
        <Tooltip content={aiState.tooltip} size="sm">
          <span className={`${chipClass} bg-ai-muted text-ai`}>{aiState.label}</span>
        </Tooltip>
      )}

      {!compact &&
        visibleLabels.map((label) => (
          <Tooltip
            key={label.id}
            content={
              label.source === 'contact'
                ? `${label.name} — inherited from contact`
                : label.source === 'ticket'
                  ? `${label.name} — via linked ticket`
                  : label.name
            }
            size="sm"
          >
            <span className="inline-flex items-center gap-1 h-5 px-[7px] rounded-full text-[11px] font-medium bg-muted text-muted-foreground shrink-0">
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ backgroundColor: safeCssColor(label.color) }}
              />
              {label.name}
            </span>
          </Tooltip>
        ))}
      {!compact && overflowLabels.length > 0 && (
        <Tooltip
          content={
            <ul className="space-y-0.5 text-left">
              {overflowLabels.map((label) => (
                <li key={label.id}>{label.name}</li>
              ))}
            </ul>
          }
          size="sm"
        >
          <span className="inline-flex items-center h-5 px-[7px] rounded-full text-[11px] font-semibold bg-muted text-muted-foreground shrink-0">
            +{overflowLabels.length}
          </span>
        </Tooltip>
      )}

      {isOneSidedOutbound && !isOrphanOutgoing && (
        <Tooltip
          content="No customer message in this thread — we sent, nobody replied, and no one has picked it up in the app. It may be deliberate outreach; it is here so it does not go unnoticed."
          size="sm"
        >
          <span className={`${chipClass} bg-warning/15 text-warning`}>Awaiting customer</span>
        </Tooltip>
      )}

      {isOrphanOutgoing && (
        <Tooltip
          content="Outbound echo — a sent message we couldn't pair with an inbound parent. No analysis runs on it because there's nothing to ask."
          size="sm"
        >
          <span className={`${chipClass} bg-muted text-muted-foreground`}>Outbound echo</span>
        </Tooltip>
      )}

      {/* Resolved is shown by the canonical getStatusBadge chip above — no
          separate chip here (it would double-badge the same card). */}
    </>
  );

  // Conversation id — a muted reference beside the ticket, thread and attachment icons
  // rather than a header line of its own.
  const copyRef = (
    <Button
      type="button"
      variant="ghost"
      className="font-mono shrink-0 inline-flex items-center gap-1 p-0 h-auto text-[11px] text-muted-foreground/70 cursor-pointer hover:text-foreground hover:bg-transparent"
      title={copied ? 'Copied!' : 'Copy link to this conversation'}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard
          .writeText(`${window.location.origin}/messages?id=${getConvUrlId(msg, orgCode)}`)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
      }}
    >
      {formatConvId(msg, orgCode)}
      {copied ? (
        <Check className="w-3 h-3 text-success" />
      ) : (
        <Copy className="w-3 h-3 opacity-50" />
      )}
    </Button>
  );

  const refs: ReactNode = (
    <>
      {copyRef}
      {isFromKBSource && (
        <Tooltip content="From Knowledge Base source" size="sm">
          <span className="inline-flex items-center text-muted-foreground/70">
            <BookOpen className="w-3 h-3" />
          </span>
        </Tooltip>
      )}
      {chip && (
        <Tooltip content={chip.tooltip} size="sm">
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
            <Ticket className="w-3 h-3" />
            {chip.label}
          </span>
        </Tooltip>
      )}
      {thread.messageCount > 1 && (
        <Tooltip content={`${thread.messageCount} messages in thread`} size="sm">
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
            <MessagesSquare className="w-3 h-3" />
            {thread.messageCount}
          </span>
        </Tooltip>
      )}
      {hasAttachments(signalMessage) && (
        <Tooltip
          content={`${msg.attachmentCount ?? signalMessage.attachmentCount ?? 0} attachment(s)`}
          size="sm"
        >
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/70">
            <Paperclip className="w-3 h-3" />
            {msg.attachmentCount ?? signalMessage.attachmentCount ?? 0}
          </span>
        </Tooltip>
      )}
    </>
  );

  const preview = previewText(thread.latestIncomingMessage?.content ?? msg.content);

  const rowProps = {
    role: 'button' as const,
    tabIndex: 0,
    onClick: handleCardClick,
    onKeyDown: handleKeyDown,
    'aria-current': current ? ('true' as const) : undefined,
    ...longPress,
    ...(selectableId !== null ? { [SELECT_ID_ATTRIBUTE]: selectableId } : {}),
  };

  if (compact) {
    return (
      <div
        {...rowProps}
        className={cn(
          'relative grid items-center gap-x-3 py-2 pl-4 pr-11 border-t border-hair first:border-t-0 cursor-pointer outline-none group transition-colors',
          'hover:bg-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          narrow
            ? 'grid-cols-[minmax(0,1fr)_auto_36px] gap-y-[3px]'
            : 'grid-cols-[160px_minmax(0,1fr)_minmax(0,170px)_auto_36px] min-[1100px]:grid-cols-[190px_minmax(0,1fr)_minmax(0,230px)_auto_36px]',
          (selected === true || current) && 'bg-primary-muted hover:bg-primary-muted',
          current && 'shadow-[inset_3px_0_0_hsl(var(--primary))]',
          SELECT_GROUP_CLASS,
          selectableId !== null && TOUCH_PRESS_GUARD_CLASS
        )}
      >
        {spineBar}
        {selectBox}
        <div className="flex items-center gap-[7px] min-w-0">
          {/* The department as a square in its own colour; a dashed amber outline while it
              still needs routing. The chip's words are in the tooltip. */}
          {needsRouting ? (
            <Tooltip content="Needs routing" size="sm">
              <span className="w-2 h-2 rounded-[2px] border-[1.5px] border-dashed border-warning shrink-0" />
            </Tooltip>
          ) : primaryDept ? (
            <Tooltip content={primaryDept.name} size="sm">
              <span
                className="w-2 h-2 rounded-[2px] shrink-0"
                style={{ backgroundColor: safeCssColor(primaryDept.color ?? '') }}
              />
            </Tooltip>
          ) : (
            <span className="w-2 h-2 shrink-0" aria-hidden="true" />
          )}
          {identity}
        </div>
        <div
          className={cn(
            'flex items-baseline gap-2 min-w-0 overflow-hidden whitespace-nowrap',
            narrow && 'col-span-full row-start-2'
          )}
        >
          {msg.subject && (
            <span className="max-w-[55%] text-[13px] font-medium truncate shrink-0">
              {msg.subject}
            </span>
          )}
          <span className="text-[13px] text-muted-foreground truncate">{preview}</span>
        </div>
        {!narrow && (
          <div className="flex items-center gap-[5px] min-w-0 overflow-hidden [&>*:nth-child(n+3)]:hidden">
            {signals}
          </div>
        )}
        <div className="flex justify-end">
          <RowAssignee thread={thread} />
        </div>
        <span
          className="font-mono text-right whitespace-nowrap text-[11px] text-muted-foreground"
          title={formatDate(activityAt)}
        >
          {formatAge(activityAt)}
        </span>
      </div>
    );
  }

  return (
    <Card
      {...rowProps}
      className={cn(
        'relative p-0 overflow-hidden transition-shadow hover:shadow-md cursor-pointer group',
        (selected === true || current) && 'bg-primary-muted border-primary-line',
        SELECT_GROUP_CLASS,
        selectableId !== null && TOUCH_PRESS_GUARD_CLASS
      )}
    >
      {spineBar}
      {selectBox}
      {/* pr-11 when a checkbox is drawn: the row's top-right already holds the timestamp, and
          an absolutely-placed box would sit on top of it. */}
      <CardContent className={cn('py-2.5 pl-4 pr-4 space-y-1', onToggleSelected && 'pr-11')}>
        {/* Identity line — dept + channel + sender + read toggle + age on ONE row.
            The conversation id moved down to the reference footer: it is looked
            up, not scanned, and a header row of its own cost every row a full
            line of height with the board showing barely three cards. */}
        <div className="flex items-center gap-[7px] min-w-0">
          {(primaryDept ?? needsRouting) && (
            <div className="flex items-center gap-1 shrink-0">
              {needsRouting ? (
                <DepartmentBadge variant="needs" />
              ) : (
                primaryDept && <DepartmentBadge variant="primary" dept={primaryDept} />
              )}
            </div>
          )}
          {identity}
          <span
            className="font-mono whitespace-nowrap shrink-0 text-[11px] text-muted-foreground"
            title={formatDate(activityAt)}
          >
            {formatWhen(activityAt)}
          </span>
        </div>

        {/* Which of our addresses this arrived at. A mailbox answers to several
            aliases, so the source's name doesn't answer it. Renders nothing at
            all for mail ingested before the BE recorded it. */}
        <ReceivedAtAddresses recipients={msg.recipients} />

        {/* Subject (muted) */}
        {msg.subject && (
          <p className="text-[12.5px] text-muted-foreground truncate">{msg.subject}</p>
        )}

        {/* Preview — 1 line of the latest incoming message content */}
        <p className="text-[13.5px] text-muted-foreground line-clamp-1">{preview}</p>

        {/* Sig row — signals, then the reference footer, then the assignee.
            Separator above marks the boundary between content (title/subject/preview)
            and the metadata block (chips + reference footer). */}
        <div className="flex flex-wrap gap-[5px] items-center mt-[3px] pt-[7px] border-t border-hair">
          {signals}
          {refs}
          <span className="flex-1" />
          <RowAssignee thread={thread} />
        </div>
      </CardContent>
    </Card>
  );
};
