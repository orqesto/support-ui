import {
  Folder,
  Clock,
  User,
  Target,
  ExternalLink,
  Bot,
  AlertTriangle,
  Ticket,
} from 'lucide-react';
import type { MessageThread } from '@/services/message.service';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { getChannelIcon, getCategoryDisplay } from '@/lib/messageHelpers';
import { formatDate, formatAge } from '@/lib/utils';
import { STAGE_COLORS } from '@/components/tickets/LeadQualificationPanel';
import { MessageSignalBadges } from './MessageSignalBadges';

type MessageListItemProps = {
  thread: MessageThread;
  onOpen: (thread: MessageThread) => void;
};

export const MessageListItem = ({ thread, onOpen }: MessageListItemProps) => {
  const msg = thread.latestMessage;
  if (!msg) return null;

  const analysis = msg.metadata?.analysis as { suggestedCategory?: string } | undefined;

  const receivedAt = (msg.metadata as { receivedAt?: string })?.receivedAt ?? msg.createdAt;

  const leadMeta = msg.metadata as
    | { leadQualifiedAt?: string; leadCategory?: string; leadState?: { stage: string } }
    | undefined;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-sm">
      <CardContent className="p-3">
        {/* Row 1: channel icon + sender + time + Open */}
        <div className="flex gap-2 items-center min-w-0">
          <span className="shrink-0 text-muted-foreground">{getChannelIcon(msg.channel)}</span>
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">{msg.sender}</span>
          <span
            className="text-xs whitespace-nowrap text-muted-foreground shrink-0"
            title={`Received: ${formatDate(receivedAt)}`}
          >
            <Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />
            {formatAge(receivedAt)}
          </span>
          <Button variant="outline" onClick={() => onOpen(thread)} className="gap-1.5 shrink-0">
            <ExternalLink className="w-4 h-4" />
            Open
          </Button>
        </div>

        {/* Row 2: subject */}
        {msg.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 pl-5">{msg.subject}</p>
        )}

        {/* Row 3: content preview */}
        <p className="pl-5 mt-1 text-sm break-words text-muted-foreground line-clamp-2">
          {msg.content}
        </p>

        {/* Row 4: Assignee + linked ticket */}
        <div className="flex gap-2 items-center pl-5 mt-2">
          {msg.assigneeId && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Assigned to ${msg.assigneeName ?? 'User'}`}
            >
              <User className="w-2.5 h-2.5" />
              {msg.assigneeName ?? 'User'}
            </Badge>
          )}
          {msg.ticketId && (
            <Badge
              variant={thread.linkedTicketStatus === 'in_progress' ? 'warning' : 'default'}
              className="flex gap-1 items-center h-5 px-1.5"
              title={
                thread.linkedTicketStatus
                  ? `Ticket #${msg.ticketId} · ${thread.linkedTicketStatus.replace('_', ' ')}`
                  : `Ticket #${msg.ticketId}`
              }
            >
              <Ticket className="w-2.5 h-2.5" />#{msg.ticketId}
              {thread.linkedTicketStatus === 'in_progress' && <span>· In progress</span>}
            </Badge>
          )}
        </div>

        {/* Row 5: Signal badges + list-only badges + ID */}
        <div className="flex flex-wrap gap-1.5 items-center mt-1.5 pl-5">
          <MessageSignalBadges message={thread.latestIncomingMessage ?? msg} size="sm" />

          {/* Category */}
          {analysis?.suggestedCategory && getCategoryDisplay(analysis.suggestedCategory) && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center h-5 px-1.5"
              title="AI Suggested Category"
            >
              <Folder className="w-2.5 h-2.5" />
              {getCategoryDisplay(analysis.suggestedCategory)}
            </Badge>
          )}

          {/* Lead — single badge showing stage or fallback */}
          {thread.isLead &&
            (() => {
              const stage = leadMeta?.leadState?.stage;
              if (stage !== undefined && stage in STAGE_COLORS) {
                return (
                  <Badge
                    variant={STAGE_COLORS[stage]}
                    className="flex gap-1 items-center h-5 px-1.5"
                    title={`Lead · ${stage.replace(/_/g, ' ')}`}
                  >
                    <Target className="w-2.5 h-2.5" />
                    {STAGE_COLORS[stage] === 'danger' && <AlertTriangle className="w-2.5 h-2.5" />}
                    {stage.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}
                  </Badge>
                );
              }
              return (
                <Badge
                  variant="default"
                  className="flex gap-1 items-center h-5 px-1.5"
                  title="Qualified lead"
                >
                  <Target className="w-2.5 h-2.5" />
                  Lead
                </Badge>
              );
            })()}

          {/* Bot replied */}
          {(msg.metadata?.autoReply as { sent?: boolean } | undefined)?.sent && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center h-5 px-1.5"
              title="Auto-reply sent by bot"
            >
              <Bot className="w-2.5 h-2.5" />
              Bot Replied
            </Badge>
          )}

          {/* Labels */}
          {(msg.labels as { id: number; name: string; color: string }[] | undefined)?.map(
            (label) => (
              <Badge
                key={label.id}
                variant="secondary"
                className="flex gap-1 items-center h-5 px-1.5"
                title={label.name}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                {label.name}
              </Badge>
            )
          )}

          {/* ID */}
          <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
            #{msg.id}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
