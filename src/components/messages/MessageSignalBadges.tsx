import {
  XCircle,
  Paperclip,
  ShieldX,
  Ticket,
  AlertTriangle,
  Clock,
  BellRing,
  BookOpen,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {
  hasMessageAttachments,
  getSpamCheck,
  getFilteredCategoryLabel,
} from '@/lib/messageHelpers';
import { formatDuration } from '@/lib/utils';
import type { Message } from '@/types';
import type { ContradictionCheckMetadata, MessageAttachmentsAnalyzed } from '@/types/ai';

type Props = {
  message: Message;
  size?: 'sm' | 'md';
};

export const MessageSignalBadges = ({ message, size = 'md' }: Props) => {
  const ic = size === 'sm' ? 'w-2.5 h-2.5' : 'w-4 h-4';
  const bc = size === 'sm' ? 'flex gap-1 items-center h-5 px-1.5' : 'flex gap-1 items-center';

  const spamCheck = getSpamCheck(message);
  const hasAttachments = hasMessageAttachments(message);
  const analysis = message.metadata?.analysis as
    | { needsMoreInfo?: boolean }
    | undefined;

  const renderSla = () => {
    if (message.resolved || message.isOutgoing || !message.slaResponseMinutes) return null;
    const target = message.slaResponseMinutes;

    if (message.lastReplyFromClient && message.lastReplyAt) {
      if (message.directReply) return null;
      const elapsed = Math.floor((Date.now() - new Date(message.lastReplyAt).getTime()) / 60000);
      const breached = elapsed > target;
      const atRisk = !breached && elapsed > target * 0.8;
      if (breached)
        return (
          <Badge
            variant="danger"
            className={bc}
            title={`Follow-up SLA: ${formatDuration(target)} — elapsed: ${formatDuration(elapsed)}`}
          >
            <Clock className={ic} />
            SLA Breached
          </Badge>
        );
      if (atRisk)
        return (
          <Badge
            variant="warning"
            className={bc}
            title={`Follow-up SLA: ${formatDuration(target)} — ${formatDuration(target - elapsed)} remaining`}
          >
            <Clock className={ic} />
            SLA At Risk
          </Badge>
        );
      return null;
    }

    if (!message.firstResponseAt) {
      // We already replied but firstResponseAt wasn't recorded — suppress stale badge
      if (message.lastReplyFromClient === false && message.lastReplyAt) return null;
      const slaStart =
        typeof (message.metadata as Record<string, unknown>)?.receivedAt === 'string'
          ? new Date((message.metadata as Record<string, unknown>).receivedAt as string)
          : new Date(message.createdAt);
      const elapsed = Math.floor((Date.now() - slaStart.getTime()) / 60000);
      const breached = message.slaResponseBreached === true || elapsed > target;
      const atRisk = !breached && elapsed > target * 0.8;
      if (breached)
        return (
          <Badge
            variant="danger"
            className={bc}
            title={`SLA target: ${formatDuration(target)} — elapsed: ${formatDuration(elapsed)}`}
          >
            <Clock className={ic} />
            SLA Breached
          </Badge>
        );
      if (atRisk)
        return (
          <Badge
            variant="warning"
            className={bc}
            title={`SLA target: ${formatDuration(target)} — ${formatDuration(target - elapsed)} remaining`}
          >
            <Clock className={ic} />
            SLA At Risk
          </Badge>
        );
    }
    return null;
  };

  return (
    <>
      {message.needsHumanReview && (
        <Badge variant="warning" className={bc} title="Flagged for human review">
          <BellRing className={ic} />
          {size === 'sm' ? 'Review' : 'Needs Review'}
        </Badge>
      )}
      {spamCheck?.isSpam === true && (
        <Badge
          variant="danger"
          className={bc}
          title={`Spam: ${spamCheck.redFlags?.join(', ') ?? ''}`}
        >
          <ShieldX className={ic} />
          {getFilteredCategoryLabel(spamCheck.category)}
        </Badge>
      )}
      {!spamCheck?.isSpam && spamCheck?.category === 'suspicious' && (
        <Badge
          variant="warning"
          className={bc}
          title={`Suspicious: ${spamCheck.redFlags?.join(', ') ?? ''}`}
        >
          <AlertTriangle className={ic} />
          Suspicious
        </Badge>
      )}
      {(message.metadata?.contradictionCheck as ContradictionCheckMetadata | undefined)?.result
        ?.hasContradiction && (
        <Badge variant="warning" className={bc} title="Contradicts previous statement">
          <AlertTriangle className={ic} />
          Contradiction
        </Badge>
      )}
      {(message.metadata?.attachmentsAnalyzed as MessageAttachmentsAnalyzed | undefined)
        ?.hasUnusualAttachments && (
        <Badge
          variant="warning"
          className={bc}
          title={`${(message.metadata?.attachmentsAnalyzed as MessageAttachmentsAnalyzed).count} attachment(s), some unusual for this organization`}
        >
          <AlertTriangle className={ic} />
          <Paperclip className={ic} />
          Unusual
        </Badge>
      )}
      {analysis?.needsMoreInfo && (
        <Badge variant="warning" className={bc} title="AI flagged as needing more information">
          <AlertTriangle className={ic} />
          Needs Info
        </Badge>
      )}
      {renderSla()}
      {message.ticketId && (
        <Badge variant="default" className={bc} title={`Ticket #${message.ticketId}`}>
          <Ticket className={ic} />#{message.ticketId}
        </Badge>
      )}
      {message.processingError && (
        <Badge variant="danger" className={bc} title={message.processingError}>
          <XCircle className={ic} />
          Failed
        </Badge>
      )}
      {hasAttachments && (
        <Badge
          variant="default"
          className={bc}
          title={`${message.attachmentCount ?? 0} attachment(s)`}
        >
          <Paperclip className={ic} />
          {message.attachmentCount ?? 0}
        </Badge>
      )}
      {(message.metadata as { isFromKBSource?: boolean })?.isFromKBSource && (
        <Badge
          variant="default"
          className={`${bc} text-white bg-purple-600 hover:bg-purple-700`}
          title="Message from Knowledge Base source"
        >
          <BookOpen className={ic} />
          Knowledge Base
        </Badge>
      )}
      {message.resolved && (
        <Badge className="text-white bg-green-600 hover:bg-green-700" title="Message resolved">✓ Resolved</Badge>
      )}
    </>
  );
};
