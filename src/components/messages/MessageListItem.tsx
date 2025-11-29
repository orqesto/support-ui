import {
  ExternalLink,
  XCircle,
  Paperclip,
  ShieldX,
  Ticket,
  AlertTriangle,
  Folder,
  Clock,
  BookOpen,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard } from '@/components/ui/ListCard';
import {
  getChannelIcon,
  getCategoryDisplay,
  hasMessageAttachments,
  getSpamCheck,
  getFilteredCategoryLabel,
} from '@/lib/messageHelpers';
import { formatDate } from '@/lib/utils';
import type { Message } from '@/types';

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

  return (
    <ListCard
      header={
        <>
          {getChannelIcon(message.channel)}
          <Badge variant="secondary">{message.channel}</Badge>
          {message.processed && <Badge variant="success">Processed</Badge>}
          {message.ticketId && (
            <Badge
              variant="default"
              className="flex gap-1 items-center"
              title={`Linked to ticket #${message.ticketId}`}
            >
              <Ticket className="w-3 h-3" />
              Has Ticket
            </Badge>
          )}
          {message.awaitingCustomerResponse && (
            <Badge
              variant="warning"
              className="flex gap-1 items-center"
              title="Waiting for customer to respond"
            >
              <Clock className="w-3 h-3" />
              Awaiting Response
            </Badge>
          )}
          {message.processingError && (
            <Badge
              variant="danger"
              title={message.processingError}
              className="flex gap-1 items-center"
            >
              <XCircle className="w-3 h-3" />
              Failed
            </Badge>
          )}
          {hasAttachments && (
            <Badge
              variant="default"
              title={`${message.attachmentCount ?? 0} attachment(s)`}
              className="flex gap-1 items-center"
            >
              <Paperclip className="w-3 h-3" />
              {message.attachmentCount ?? 0}
            </Badge>
          )}

          {/* Message Classification Badge */}
          {spamCheck?.isSpam === true && (
            <Badge
              variant="danger"
              title={`Spam (${getFilteredCategoryLabel(spamCheck.category)}): ${spamCheck.redFlags?.join(', ') ?? 'Classified as spam'}`}
              className="flex gap-1 items-center cursor-pointer"
            >
              <ShieldX className="w-3 h-3" />
              {getFilteredCategoryLabel(spamCheck.category)}
            </Badge>
          )}
          {spamCheck?.isSpam === false && spamCheck?.category === 'suspicious' && (
            <Badge
              variant="warning"
              title={`Suspicious: ${spamCheck.redFlags?.join(', ') ?? 'May contain spam indicators'}`}
              className="flex gap-1 items-center cursor-pointer"
            >
              <AlertTriangle className="w-3 h-3" />
              Suspicious
            </Badge>
          )}
          {!spamCheck?.isSpam && analysis?.isTicketWorthy && (
            <Badge
              variant="default"
              title={`Confidence: ${Math.round((analysis.confidence ?? 0) * 100)}%`}
              className="flex gap-1 items-center"
            >
              <Ticket className="w-3 h-3" />
              Ticket Worthy
            </Badge>
          )}
          {analysis?.needsMoreInfo && (
            <Badge variant="warning" className="flex gap-1 items-center">
              <AlertTriangle className="w-3 h-3" />
              Needs Info
            </Badge>
          )}
          {analysis?.suggestedPriority && (
            <Badge
              variant={
                analysis.suggestedPriority === 'critical'
                  ? 'danger'
                  : analysis.suggestedPriority === 'high'
                    ? 'warning'
                    : 'default'
              }
              title="AI Suggested Priority"
            >
              Priority: {analysis.suggestedPriority}
            </Badge>
          )}
          {analysis?.suggestedCategory && getCategoryDisplay(analysis.suggestedCategory) && (
            <Badge
              variant="secondary"
              title="AI Suggested Category"
              className="flex gap-1 items-center"
            >
              <Folder className="w-3 h-3" />
              {getCategoryDisplay(analysis.suggestedCategory)}
            </Badge>
          )}

          {/* KB Source Badge */}
          {(message.metadata as { isFromKBSource?: boolean })?.isFromKBSource && (
            <Badge
              variant="default"
              className="flex gap-1 items-center text-white bg-purple-600"
              title="Message from Knowledge Base source"
            >
              <BookOpen className="w-3 h-3" />
              KB
            </Badge>
          )}

          {/* Assignee Badge */}
          {message.assigneeName && (
            <Badge
              variant="secondary"
              className="flex gap-1 items-center"
              title={`Assigned to ${message.assigneeName}`}
            >
              <User className="w-3 h-3" />
              {message.assigneeName}
            </Badge>
          )}
        </>
      }
      content={
        <>
          <div className="space-y-1">
            <p className="text-sm font-semibold break-all">{message.sender}</p>
            {message.subject && (
              <p className="text-xs break-all text-muted-foreground">Subject: {message.subject}</p>
            )}
          </div>
          <p className="text-sm break-all text-muted-foreground line-clamp-2">{message.content}</p>
        </>
      }
      metadata={
        <>
          <span className="font-mono text-xs">ID: {message.id}</span>
          <span className="break-all">• From: {message.sender}</span>
          {message.channel && <span>• {message.channel}</span>}
          {hasAttachments && (
            <span className="flex gap-1 items-center">
              • <Paperclip className="w-3 h-3" />
              {message.attachmentCount ?? 0} file(s)
            </span>
          )}
          {message.ticketId && (
            <span
              className="flex gap-1 items-center"
              title={`Linked to ticket #${message.ticketId}`}
            >
              • <Ticket className="w-3 h-3" />
              Ticket #{message.ticketId}
            </span>
          )}
          {message.assigneeName && (
            <span className="flex gap-1 items-center" title={`Assigned to ${message.assigneeName}`}>
              • <User className="w-3 h-3" />
              {message.assigneeName}
            </span>
          )}
          {message.processingError && (
            <span className="font-medium text-red-600 dark:text-red-400" title="Processing Error">
              • Error: {message.processingError}
            </span>
          )}
          <span className="whitespace-nowrap" title={`Imported: ${formatDate(message.createdAt)}`}>
            •{' '}
            {formatDate(
              (message.metadata as { receivedAt?: string })?.receivedAt ?? message.createdAt
            )}
          </span>
        </>
      }
      actions={
        <>
          {/* All messages: Just Open to see details */}
          <Button size="sm" variant="outline" onClick={() => onOpen(message)}>
            <ExternalLink className="mr-1 w-3 h-3" />
            Open
          </Button>
        </>
      }
    />
  );
};
