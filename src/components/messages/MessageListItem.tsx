import {
  XCircle,
  Paperclip,
  ShieldX,
  Ticket,
  AlertTriangle,
  Folder,
  Clock,
  BookOpen,
  User,
  CircleDot,
  Target,
  MessageCircle,
  ExternalLink,
  BellRing,
  Bot,
  MailOpen,
} from 'lucide-react';
import type { Message, MessageStatus } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  getChannelIcon,
  getCategoryDisplay,
  hasMessageAttachments,
  getSpamCheck,
  getFilteredCategoryLabel,
} from '@/lib/messageHelpers';
import { formatDate, formatAge } from '@/lib/utils';
import { STAGE_COLORS } from '@/components/tickets/LeadQualificationPanel';

const STATUS_BADGE: Record<
  MessageStatus,
  {
    variant: 'default' | 'secondary' | 'success' | 'warning' | 'danger';
    label: string;
    className?: string;
  }
> = {
  new: { variant: 'secondary', label: 'Open' },
  in_progress: { variant: 'warning', label: 'In Progress' },
  pending: {
    variant: 'default',
    label: 'Pending',
    className: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  },
  resolved: { variant: 'success', label: 'Resolved' },
  closed: { variant: 'secondary', label: 'Closed', className: 'text-muted-foreground' },
  filtered: { variant: 'danger', label: 'Filtered' },
};

type MessageListItemProps = {
  message: Message;
  onOpen: (message: Message) => void;
};

export const MessageListItem = ({ message, onOpen }: MessageListItemProps) => {
  const analysis = message.metadata?.analysis as
    | {
        isTicketWorthy?: boolean;
        needsMoreInfo?: boolean;
        suggestedPriority?: string;
        suggestedCategory?: string;
        confidence?: number;
      }
    | undefined;

  const spamCheck = getSpamCheck(message);
  const hasAttachments = hasMessageAttachments(message);

  const threadInfo = message.metadata as {
    isThreadView?: boolean;
    threadMessageCount?: number;
    threadId?: string;
    threadHasUnread?: boolean;
    threadHasTicket?: boolean;
    threadIsResolved?: boolean;
    lastReplyFromClient?: boolean;
  };

  const receivedAt = (message.metadata as { receivedAt?: string })?.receivedAt ?? message.createdAt;

  const leadMeta = message.metadata as
    | { leadQualifiedAt?: string; leadCategory?: string; leadState?: { stage: string } }
    | undefined;

  const displayPriority = message.priority ?? null;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-sm">
      <CardContent className="p-3">
        {/* Row 1: channel icon + sender + time + Open */}
        <div className="flex gap-2 items-center min-w-0">
          <span className="shrink-0 text-muted-foreground">{getChannelIcon(message.channel)}</span>
          <span className="flex-1 min-w-0 text-sm font-semibold truncate">{message.sender}</span>
          <span
            className="text-xs whitespace-nowrap text-muted-foreground shrink-0"
            title={`Received: ${formatDate(receivedAt)}`}
          >
            <Clock className="inline w-3 h-3 mr-0.5 -mt-0.5" />
            {formatAge(receivedAt)}
          </span>
          <Button
            variant="outline"
            onClick={() => onOpen(message)}
            className="gap-1.5 shrink-0"
          >
            <ExternalLink className="w-4 h-4" />
            Open
          </Button>
        </div>

        {/* Row 2: subject */}
        {message.subject && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 pl-5">{message.subject}</p>
        )}

        {/* Row 3: content preview */}
        <p className="pl-5 mt-1 text-sm break-words text-muted-foreground line-clamp-2">
          {message.content}
        </p>

        {/* Row 4: Status & Assignee (prominent) */}
        <div className="flex gap-2 items-center pl-5 mt-2">
          {/* Status */}
          {message.status &&
            message.status !== 'filtered' &&
            (() => {
              const cfg = STATUS_BADGE[message.status as MessageStatus];
              return cfg ? (
                <Badge
                  variant={cfg.variant}
                  className={`flex gap-1 items-center h-5 px-1.5 ${cfg.className ?? ''}`}
                >
                  <CircleDot className="w-2.5 h-2.5" />
                  {cfg.label}
                </Badge>
              ) : null;
            })()}

          {/* Assignee */}
          {message.assigneeId && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Assigned to ${message.assigneeName ?? 'User'}`}
            >
              <User className="w-2.5 h-2.5" />
              {message.assigneeName ?? 'User'}
            </Badge>
          )}
        </div>

        {/* Row 5: Other badges + ID */}
        <div className="flex flex-wrap gap-1.5 items-center mt-1.5 pl-5">
          {/* Thread msg count */}
          {threadInfo?.isThreadView && threadInfo.threadMessageCount && (
            <Badge variant="default" className="text-xs font-semibold h-5 px-1.5">
              {threadInfo.threadMessageCount} {threadInfo.threadMessageCount === 1 ? 'msg' : 'msgs'}
            </Badge>
          )}

          {/* Ticket */}
          {message.ticketId && (
            <Badge
              variant="default"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Ticket #${message.ticketId}`}
            >
              <Ticket className="w-2.5 h-2.5" />#{message.ticketId}
            </Badge>
          )}

          {/* Priority */}
          {displayPriority && (
            <Badge
              variant={
                displayPriority === 'critical'
                  ? 'danger'
                  : displayPriority === 'high'
                    ? 'warning'
                    : displayPriority === 'medium'
                      ? 'secondary'
                      : 'default'
              }
              className="h-5 px-1.5"
              title={`Priority: ${displayPriority}`}
            >
              {displayPriority}
            </Badge>
          )}

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

          {/* Lead */}
          {message.isLead &&
            (leadMeta?.leadQualifiedAt ? (
              <Badge
                variant="success"
                className="flex gap-1 items-center h-5 px-1.5"
                title={`Qualified${leadMeta.leadCategory ? ` · ${leadMeta.leadCategory}` : ''}`}
              >
                <Target className="w-2.5 h-2.5" />
                {leadMeta.leadCategory ? leadMeta.leadCategory.toUpperCase() : 'Qualified'}
              </Badge>
            ) : (
              <Badge variant="default" className="flex gap-1 items-center h-5 px-1.5">
                <Target className="w-2.5 h-2.5" />
                Lead
              </Badge>
            ))}

          {/* Lead — client replied */}
          {message.isLead &&
            threadInfo?.lastReplyFromClient &&
            (threadInfo.threadMessageCount ?? 0) > 1 && (
              <Badge
                variant="warning"
                className="flex gap-1 items-center h-5 px-1.5"
                title="Lead replied — needs agent attention"
              >
                <MessageCircle className="w-2.5 h-2.5" />
                Replied
              </Badge>
            )}

          {/* Lead — stage badge */}
          {message.isLead &&
            leadMeta?.leadState?.stage !== undefined &&
            leadMeta.leadState.stage in STAGE_COLORS && (
            <Badge
              variant={STAGE_COLORS[leadMeta.leadState.stage]}
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Lead stage: ${leadMeta.leadState.stage.replace(/_/g, ' ')}`}
            >
              {STAGE_COLORS[leadMeta.leadState.stage] === 'danger' && (
                <AlertTriangle className="w-2.5 h-2.5" />
              )}
              {leadMeta.leadState.stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
          )}

          {/* Lead — awaiting reply */}
          {message.isLead &&
            threadInfo?.lastReplyFromClient === false &&
            (threadInfo.threadMessageCount ?? 0) > 1 && (
              <Badge
                variant="secondary"
                className="flex gap-1 items-center h-5 px-1.5"
                title="Waiting for lead to respond"
              >
                <Clock className="w-2.5 h-2.5" />
                Awaiting
              </Badge>
            )}

          {/* Spam / suspicious */}
          {spamCheck?.isSpam === true && (
            <Badge
              variant="danger"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Spam: ${spamCheck.redFlags?.join(', ') ?? ''}`}
            >
              <ShieldX className="w-2.5 h-2.5" />
              {getFilteredCategoryLabel(spamCheck.category)}
            </Badge>
          )}
          {!spamCheck?.isSpam && spamCheck?.category === 'suspicious' && (
            <Badge
              variant="warning"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Suspicious: ${spamCheck.redFlags?.join(', ') ?? ''}`}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              Suspicious
            </Badge>
          )}

          {/* Ticket worthy */}
          {!spamCheck?.isSpam && !message.ticketId && analysis?.isTicketWorthy && (
            <Badge
              variant="default"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`Confidence: ${Math.round((analysis.confidence ?? 0) * 100)}%`}
            >
              <Ticket className="w-2.5 h-2.5" />
              Ticket Worthy
            </Badge>
          )}

          {/* Needs info */}
          {analysis?.needsMoreInfo && (
            <Badge variant="warning" className="flex gap-1 items-center h-5 px-1.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              Needs Info
            </Badge>
          )}

          {/* Awaiting customer response */}
          {message.awaitingCustomerResponse && (
            <Badge
              variant="warning"
              className="flex gap-1 items-center h-5 px-1.5"
              title="Waiting for customer to respond"
            >
              <Clock className="w-2.5 h-2.5" />
              Awaiting Response
            </Badge>
          )}

          {/* Failed */}
          {message.processingError && (
            <Badge
              variant="danger"
              className="flex gap-1 items-center h-5 px-1.5"
              title={message.processingError}
            >
              <XCircle className="w-2.5 h-2.5" />
              Failed
            </Badge>
          )}

          {/* Attachments */}
          {hasAttachments && (
            <Badge
              variant="default"
              className="flex gap-1 items-center h-5 px-1.5"
              title={`${message.attachmentCount ?? 0} attachment(s)`}
            >
              <Paperclip className="w-2.5 h-2.5" />
              {message.attachmentCount ?? 0}
            </Badge>
          )}

          {/* KB source */}
          {(message.metadata as { isFromKBSource?: boolean })?.isFromKBSource && (
            <Badge
              variant="default"
              className="flex gap-1 items-center h-5 px-1.5 text-white bg-purple-600"
              title="Knowledge Base source"
            >
              <BookOpen className="w-2.5 h-2.5" />
              KB
            </Badge>
          )}

          {/* Thread unread */}
          {threadInfo?.isThreadView && threadInfo.threadHasUnread && (
            <Badge
              variant="default"
              className="flex gap-1 items-center h-5 px-1.5 text-blue-700 bg-blue-500/10 border-blue-500/20"
              title="Thread has unread messages"
            >
              <MailOpen className="w-2.5 h-2.5" />
              Unread
            </Badge>
          )}

          {/* Needs human review */}
          {message.needsHumanReview && (
            <Badge
              variant="warning"
              className="flex gap-1 items-center h-5 px-1.5"
              title="Flagged for human review"
            >
              <BellRing className="w-2.5 h-2.5" />
              Review
            </Badge>
          )}

          {/* Bot replied */}
          {(message.metadata?.autoReply as { sent?: boolean } | undefined)?.sent && (
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
          {(message.labels as { id: number; name: string; color: string }[] | undefined)?.map((label) => (
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
          ))}

          {/* ID */}
          <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
            #{message.id}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
