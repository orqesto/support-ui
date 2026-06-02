import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Clock,
  Folder,
  MessagesSquare,
  Paperclip,
  Target,
  Ticket,
  User,
} from 'lucide-react';
import type { MessageThread } from '@/services/message.service';
import { Badge } from '@/components/ui/Badge';
import { getCategoryDisplay, getChannelIcon } from '@/lib/messageHelpers';
import { formatAge } from '@/lib/utils';
import { STAGE_COLORS } from '@/components/tickets/LeadQualificationPanel';
import { MessageSignalBadges } from './MessageSignalBadges';

type KanbanCardProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
  /**
   * Legacy prop kept for call-site compatibility. SLA suppression is now handled
   * internally by MessageSignalBadges via lastReplyFromClient, so this is unused.
   */
  weRepliedLast?: boolean;
};

const PRIORITY_VARIANT = {
  critical: 'danger',
  high: 'warning',
  medium: 'secondary',
  low: 'default',
} as const;

export const KanbanCard = ({ thread, onOpen }: KanbanCardProps) => {
  const msg = thread.latestMessage;
  if (!msg) return null;

  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;

  // The customer is `thread.sender` (always the requester). `msg.sender` is the latest
  // event's author — for an agent_reply that is the agent, not the customer.
  const customer = thread.sender || msg.sender;

  // For signal evaluation prefer the latest INCOMING message so we don't lose the
  // customer-side spam/contradiction/attachment signals once the agent replies.
  const signalMessage = thread.latestIncomingMessage ?? msg;

  const analysis = signalMessage.metadata?.analysis as
    | { suggestedCategory?: string }
    | undefined;
  const leadMeta = signalMessage.metadata as
    | { leadState?: { stage: string } }
    | undefined;
  const autoReplied = (signalMessage.metadata?.autoReply as { sent?: boolean } | undefined)?.sent;
  const category = analysis?.suggestedCategory
    ? getCategoryDisplay(analysis.suggestedCategory)
    : null;
  const leadStage = leadMeta?.leadState?.stage;
  const leadVariant =
    leadStage && leadStage in STAGE_COLORS ? STAGE_COLORS[leadStage] : undefined;

  // Direction indicator — tells the user "we owe a reply" vs "customer owes a reply".
  // Columns sort by status; this small marker tells the same story at card scope so
  // standalone cards (e.g. in the all-threads view) still read correctly.
  const lastReplyFromClient = thread.lastReplyFromClient;
  const directionLabel =
    lastReplyFromClient === true
      ? 'Customer replied — awaiting our response'
      : lastReplyFromClient === false
        ? 'We replied — awaiting customer'
        : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(thread)}
      aria-label={`Open message from ${customer}${msg.subject ? `: ${msg.subject}` : ''}`}
      className="w-full text-left rounded-md border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all space-y-1.5"
    >
      {/* Sender + channel + direction + age */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs shrink-0 text-muted-foreground">
          {getChannelIcon(msg.channel)}
        </span>
        <span className="flex-1 min-w-0 text-sm font-semibold truncate">{customer}</span>
        {directionLabel && (
          <span
            title={directionLabel}
            className={`shrink-0 ${
              lastReplyFromClient ? 'text-amber-500' : 'text-muted-foreground'
            }`}
          >
            {lastReplyFromClient ? (
              <ArrowLeft className="w-3 h-3" />
            ) : (
              <ArrowRight className="w-3 h-3" />
            )}
          </span>
        )}
        <span className="text-xs whitespace-nowrap text-muted-foreground shrink-0">
          <Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />
          {formatAge(receivedAt)}
        </span>
      </div>

      {/* Subject */}
      {msg.subject && (
        <p className="text-xs truncate text-muted-foreground">{msg.subject}</p>
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-1 items-center">
        {/* Shared signal badges (SLA, spam, suspicious, contradiction, attachments,
            needsMoreInfo, needsHumanReview) — kept in sync with the list view.
            Render unconditionally so the attachment paperclip and other badges still
            show in the Awaiting column; MessageSignalBadges' internal SLA logic
            already gates correctly based on lastReplyFromClient. */}
        <MessageSignalBadges message={signalMessage} size="sm" />
        {/* If only the agent's latest message carries attachments (e.g. a polled sent
            reply on a thread whose customer message has none), MessageSignalBadges —
            scoped to `latestIncomingMessage` — would miss it. Show the paperclip when
            the latest message has its own attachments and signalMessage doesn't. */}
        {(msg.attachmentCount ?? 0) > 0 && signalMessage.id !== msg.id && (
          <Badge
            variant="default"
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title={`${msg.attachmentCount} attachment(s) on the latest message`}
          >
            <Paperclip className="w-2 h-2" />
            {msg.attachmentCount}
          </Badge>
        )}

        {msg.priority && (
          <Badge
            variant={PRIORITY_VARIANT[msg.priority]}
            className="h-4 px-1 text-[10px] shrink-0"
            title={`Priority: ${msg.priority}`}
          >
            {msg.priority}
          </Badge>
        )}

        {category && (
          <Badge
            variant="secondary"
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title="AI Suggested Category"
          >
            <Folder className="w-2 h-2" />
            {category}
          </Badge>
        )}

        {thread.isLead && (
          <Badge
            variant={leadVariant ?? 'default'}
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title={leadStage ? `Lead · ${leadStage.replace(/_/g, ' ')}` : 'Qualified lead'}
          >
            <Target className="w-2 h-2" />
            {leadStage ? leadStage.replace(/_/g, ' ') : 'Lead'}
          </Badge>
        )}

        {autoReplied && (
          <Badge
            variant="secondary"
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title="Auto-reply sent by bot"
          >
            <Bot className="w-2 h-2" />
            Bot
          </Badge>
        )}

        {msg.assigneeId && (
          <Badge
            variant="secondary"
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] min-w-0 overflow-hidden"
            title={`Assigned to ${msg.assigneeName ?? 'Agent'}`}
          >
            <User className="w-2 h-2 shrink-0" />
            <span className="truncate">{msg.assigneeName ?? 'Assigned'}</span>
          </Badge>
        )}

        {thread.hasTicket && (
          <Badge
            variant={thread.linkedTicketStatus === 'in_progress' ? 'warning' : 'default'}
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title={
              thread.linkedTicketStatus
                ? `Ticket · ${thread.linkedTicketStatus.replace('_', ' ')}`
                : 'Ticket'
            }
          >
            <Ticket className="w-2 h-2" />
            Ticket
            {thread.linkedTicketStatus === 'in_progress' && (
              <span className="ml-0.5">· In progress</span>
            )}
          </Badge>
        )}

        {thread.messageCount > 1 && (
          <Badge
            variant="default"
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title={`${thread.messageCount} messages in thread`}
          >
            <MessagesSquare className="w-2 h-2" />
            {thread.messageCount}
          </Badge>
        )}

        <span className="ml-auto font-mono text-[10px] text-muted-foreground shrink-0">
          #{msg.id}
        </span>
      </div>
    </button>
  );
};
