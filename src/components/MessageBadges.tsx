import {
  Mail,
  MessageSquare,
  Send,
  Clock,
  XCircle,
  Paperclip,
  ShieldX,
  Ticket,
  AlertTriangle,
  Folder,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { getCategoryDisplay, hasMessageAttachments } from '@/lib/messageHelpers';
import type { Message } from '@/types';

type MessageBadgesProps = {
  message: Message;
};

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case 'email':
      return <Mail className="w-5 h-5" />;
    case 'slack':
    case 'telegram':
      return <MessageSquare className="w-5 h-5" />;
    default:
      return <Send className="w-5 h-5" />;
  }
};

export const MessageBadges = ({ message }: MessageBadgesProps) => (
  <div className="flex gap-3 items-center">
    <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/10">
      {getChannelIcon(message.channel)}
    </div>
    <div className="flex-1">
      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant="secondary">{message.channel}</Badge>
        {message.processed && <Badge variant="success">Processed</Badge>}
        {message.awaitingCustomerResponse && (
          <Badge
            variant="warning"
            className="flex gap-1 items-center"
            title="Waiting for customer to respond"
          >
            <Clock className="w-4 h-4" />
            Awaiting Response
          </Badge>
        )}
        {message.processingError && (
          <Badge
            variant="danger"
            title={message.processingError}
            className="flex gap-1 items-center"
          >
            <XCircle className="w-4 h-4" />
            Failed
          </Badge>
        )}
        {hasMessageAttachments(message) && (
          <Badge
            variant="default"
            title={`${message.attachmentCount ?? 0} attachment(s)`}
            className="flex gap-1 items-center"
          >
            <Paperclip className="w-4 h-4" />
            {message.attachmentCount ?? 0}
          </Badge>
        )}

        {/* AI Analysis Badges */}
        {(message.metadata?.spamCheck as { isSpam?: boolean })?.isSpam === true && (
          <Badge
            variant="danger"
            title={(message.metadata?.spamCheck as { category?: string })?.category}
            className="flex gap-1 items-center"
          >
            <ShieldX className="w-4 h-4" />
            Spam
          </Badge>
        )}
        {!(message.metadata?.spamCheck as { isSpam?: boolean })?.isSpam &&
          (message.metadata?.analysis as { isTicketWorthy?: boolean; confidence?: number })
            ?.isTicketWorthy && (
            <Badge
              variant="default"
              title={`Confidence: ${Math.round(((message.metadata?.analysis as { confidence?: number })?.confidence ?? 0) * 100)}%`}
              className="flex gap-1 items-center"
            >
              <Ticket className="w-4 h-4" />
              Ticket Worthy
            </Badge>
          )}
        {(message.metadata?.analysis as { needsMoreInfo?: boolean })?.needsMoreInfo && (
          <Badge variant="warning" className="flex gap-1 items-center">
            <AlertTriangle className="w-4 h-4" />
            Needs Info
          </Badge>
        )}
        {(message.metadata?.analysis as { suggestedPriority?: string })?.suggestedPriority && (
          <Badge
            variant={
              (message.metadata?.analysis as { suggestedPriority?: string })?.suggestedPriority ===
              'critical'
                ? 'danger'
                : (message.metadata?.analysis as { suggestedPriority?: string })
                      ?.suggestedPriority === 'high'
                  ? 'warning'
                  : 'default'
            }
            title="AI Suggested Priority"
          >
            Priority:{' '}
            {(message.metadata?.analysis as { suggestedPriority?: string })?.suggestedPriority}
          </Badge>
        )}
        {(message.metadata?.analysis as { suggestedCategory?: string })?.suggestedCategory &&
          getCategoryDisplay(
            (message.metadata?.analysis as { suggestedCategory?: string })?.suggestedCategory ?? ''
          ) && (
            <Badge
              variant="secondary"
              title="AI Suggested Category"
              className="flex gap-1 items-center"
            >
              <Folder className="w-4 h-4" />
              {getCategoryDisplay(
                (message.metadata?.analysis as { suggestedCategory?: string })?.suggestedCategory ??
                  ''
              )}
            </Badge>
          )}

        {message.ticketId && <Badge variant="default">Has Ticket</Badge>}
        {message.resolved && (
          <Badge className="text-white bg-green-600 hover:bg-green-700">✓ Resolved</Badge>
        )}
      </div>
    </div>
  </div>
);
