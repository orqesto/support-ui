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
import type { Department } from '@/types';
import type { MessageThread } from '@/services/message.service';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { useDepartments } from '@/hooks/useDepartments';
import { getCategoryDisplay, getChannelIcon } from '@/lib/messageHelpers';
import { formatAge } from '@/lib/utils';
import { STAGE_COLORS } from '@/components/tickets/LeadQualificationPanel';
import { DepartmentBadge } from './DepartmentBadge';
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
  const { data: allDepts = [] } = useDepartments();
  if (!msg) return null;

  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;

  const primaryDept = msg.departmentId
    ? allDepts.find((dept) => dept.id === msg.departmentId)
    : undefined;
  const needsRouting = msg.status === 'needs_routing';
  const nearMissDepts = (msg.nearMissDepts ?? [])
    .map((deptId) => allDepts.find((dept) => dept.id === deptId))
    .filter((dept): dept is Department => Boolean(dept));

  // The customer is `thread.sender` (always the requester). `msg.sender` is the latest
  // event's author — for an agent_reply that is the agent, not the customer.
  const customer = thread.sender || msg.sender;

  // For signal evaluation prefer the latest INCOMING message so we don't lose the
  // customer-side spam/contradiction/attachment signals once the agent replies.
  const signalMessage = thread.latestIncomingMessage ?? msg;

  const analysis = signalMessage.metadata?.analysis as { suggestedCategory?: string } | undefined;
  const leadMeta = signalMessage.metadata as { leadState?: { stage: string } } | undefined;
  const autoReplied = (signalMessage.metadata?.autoReply as { sent?: boolean } | undefined)?.sent;
  const category = analysis?.suggestedCategory
    ? getCategoryDisplay(analysis.suggestedCategory)
    : null;
  const leadStage = leadMeta?.leadState?.stage;
  const leadVariant = leadStage && leadStage in STAGE_COLORS ? STAGE_COLORS[leadStage] : undefined;

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
          <Tooltip content={directionLabel} size="sm">
            <span
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
          </Tooltip>
        )}
        <span className="text-xs whitespace-nowrap text-muted-foreground shrink-0">
          <Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />
          {formatAge(receivedAt)}
        </span>
      </div>

      {/* Subject */}
      {msg.subject && <p className="text-xs truncate text-muted-foreground">{msg.subject}</p>}

      {/* Dept badge row — primary routed dept (or needs-routing warning) +
          near-miss runner-ups so other depts can still discover the message. */}
      {((primaryDept ?? needsRouting) || nearMissDepts.length > 0) && (
        <div className="flex flex-wrap gap-1 items-center">
          {needsRouting ? (
            <DepartmentBadge variant="needs" />
          ) : (
            primaryDept && <DepartmentBadge variant="primary" dept={primaryDept} />
          )}
          {nearMissDepts.map((dept) => (
            <DepartmentBadge key={dept.id} variant="near-miss" dept={dept} />
          ))}
        </div>
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
          <Tooltip
            content={`${msg.attachmentCount} attachment(s) on the latest message`}
            size="sm"
          >
            <Badge
              variant="default"
              className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            >
              <Paperclip className="w-2 h-2" />
              {msg.attachmentCount}
            </Badge>
          </Tooltip>
        )}

        {msg.priority && (
          <Tooltip content={`Priority: ${msg.priority}`} size="sm">
            <Badge
              variant={PRIORITY_VARIANT[msg.priority]}
              className="h-4 px-1 text-[10px] shrink-0"
            >
              {msg.priority}
            </Badge>
          </Tooltip>
        )}

        {category && (
          <Tooltip content="AI Suggested Category" size="sm">
            <Badge
              variant="secondary"
              className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            >
              <Folder className="w-2 h-2" />
              {category}
            </Badge>
          </Tooltip>
        )}

        {thread.isLead && (
          <Tooltip
            content={leadStage ? `Lead · ${leadStage.replace(/_/g, ' ')}` : 'Qualified lead'}
            size="sm"
          >
            <Badge
              variant={leadVariant ?? 'default'}
              className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            >
              <Target className="w-2 h-2" />
              {leadStage ? leadStage.replace(/_/g, ' ') : 'Lead'}
            </Badge>
          </Tooltip>
        )}

        {autoReplied && (
          <Tooltip content="Auto-reply sent by bot" size="sm">
            <Badge
              variant="secondary"
              className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            >
              <Bot className="w-2 h-2" />
              Bot
            </Badge>
          </Tooltip>
        )}

        {msg.assigneeId && (
          <Tooltip content={`Assigned to ${msg.assigneeName ?? 'Agent'}`} size="sm">
            <Badge
              variant="secondary"
              className="flex gap-0.5 items-center h-4 px-1 text-[10px] min-w-0 overflow-hidden"
            >
              <User className="w-2 h-2 shrink-0" />
              <span className="truncate">{msg.assigneeName ?? 'Assigned'}</span>
            </Badge>
          </Tooltip>
        )}

        {thread.hasTicket && (
          <Tooltip
            content={
              thread.linkedTicketStatus
                ? `Ticket · ${thread.linkedTicketStatus.replace('_', ' ')}`
                : 'Ticket'
            }
            size="sm"
          >
            <Badge
              variant={thread.linkedTicketStatus === 'in_progress' ? 'warning' : 'default'}
              className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            >
              <Ticket className="w-2 h-2" />
              Ticket
              {thread.linkedTicketStatus === 'in_progress' && (
                <span className="ml-0.5">· In progress</span>
              )}
            </Badge>
          </Tooltip>
        )}

        {thread.messageCount > 1 && (
          <Tooltip content={`${thread.messageCount} messages in thread`} size="sm">
            <Badge
              variant="default"
              className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            >
              <MessagesSquare className="w-2 h-2" />
              {thread.messageCount}
            </Badge>
          </Tooltip>
        )}

        <span className="ml-auto font-mono text-[10px] text-muted-foreground shrink-0">
          #{msg.id}
        </span>
      </div>
    </button>
  );
};
