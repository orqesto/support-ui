import { AlertTriangle, BellRing, Clock, ShieldAlert, User, Ticket } from 'lucide-react';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';
import { Badge } from '@/components/ui/Badge';
import { getChannelIcon } from '@/lib/messageHelpers';
import { formatAge } from '@/lib/utils';

type KanbanCardProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
  /** Suppresses SLA badge — used for the Awaiting column */
  weRepliedLast?: boolean;
};

const PRIORITY_VARIANT = {
  critical: 'danger',
  high: 'warning',
  medium: 'secondary',
  low: 'default',
} as const;

function computeSlaState(message: Message): 'breached' | 'at_risk' | 'ok' {
  if (!message.slaResponseMinutes || message.firstResponseAt) return 'ok';
  const receivedAt = (message.metadata as { receivedAt?: string })?.receivedAt ?? message.createdAt;
  const elapsedMinutes = (Date.now() - new Date(receivedAt).getTime()) / 60000;
  const pct = elapsedMinutes / message.slaResponseMinutes;
  if (message.slaResponseBreached === true || pct >= 1) return 'breached';
  if (pct >= 0.8) return 'at_risk';
  return 'ok';
}

export const KanbanCard = ({ thread, onOpen, weRepliedLast = false }: KanbanCardProps) => {
  const msg = thread.latestMessage;
  if (!msg) return null;

  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;
  const slaState = weRepliedLast ? 'ok' : computeSlaState(msg);
  const slaBreached = slaState === 'breached';
  const slaAtRisk = slaState === 'at_risk';

  return (
    <button
      type="button"
      onClick={() => onOpen(thread)}
      aria-label={`Open message from ${msg.sender}${msg.subject ? `: ${msg.subject}` : ''}`}
      className="w-full text-left rounded-md border bg-card p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all space-y-1.5"
    >
      {/* Sender + channel + age */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs shrink-0 text-muted-foreground">
          {getChannelIcon(msg.channel)}
        </span>
        <span className="flex-1 min-w-0 text-sm font-semibold truncate">{msg.sender}</span>
        {msg.needsHumanReview && (
          <span title="Flagged for human review" className="shrink-0">
            <BellRing className="w-3 h-3 text-amber-500" />
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
      <div className="flex overflow-hidden gap-1 items-center">
        {slaBreached && (
          <Badge
            variant="danger"
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title="SLA response time breached"
          >
            <AlertTriangle className="w-2 h-2" />
            SLA
          </Badge>
        )}
        {slaAtRisk && (
          <Badge
            variant="warning"
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title="SLA response time at risk"
          >
            <ShieldAlert className="w-2 h-2" />
            At risk
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
        {msg.ticketId && (
          <Badge
            variant={thread.linkedTicketStatus === 'in_progress' ? 'warning' : 'default'}
            className="flex gap-0.5 items-center h-4 px-1 text-[10px] shrink-0"
            title={thread.linkedTicketStatus ? `Ticket #${msg.ticketId} · ${thread.linkedTicketStatus.replace('_', ' ')}` : `Ticket #${msg.ticketId}`}
          >
            <Ticket className="w-2 h-2" />
            #{msg.ticketId}
            {thread.linkedTicketStatus === 'in_progress' && <span className="ml-0.5">· In progress</span>}
          </Badge>
        )}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground shrink-0">
          #{msg.id}
        </span>
      </div>
    </button>
  );
};
