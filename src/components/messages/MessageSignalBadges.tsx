import { Paperclip, ShieldX, AlertTriangle, BellRing, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import {
  hasMessageAttachments,
  getSpamCheck,
  getFilteredCategoryLabel,
  humanizeSignalFlag,
} from '@/lib/messageHelpers';
import { formatDuration } from '@/lib/utils';
import type { Message } from '@/types';
import type { ContradictionCheckMetadata, MessageAttachmentsAnalyzed } from '@/types/ai';
import {
  getRiskSignals,
  getSlaCardText,
  renderOverflowTooltip,
} from './inboxCardHelpers';

type Props = {
  message: Message;
  size?: 'sm' | 'md';
  /**
   * `card` mode: collapse to a single top-severity badge + `+N` overflow chip
   *   (used by MessageListItem + KanbanCard, where badge clutter is the enemy).
   * `full` mode (default): render every applicable badge — used in the message
   *   detail view and any other surface that needs the full signal cluster.
   */
  mode?: 'card' | 'full';
};

export const MessageSignalBadges = ({ message, size = 'md', mode = 'full' }: Props) => {
  const ic = size === 'sm' ? 'w-2.5 h-2.5' : 'w-4 h-4';
  const bc = size === 'sm' ? 'flex gap-1 items-center h-5 px-1.5' : 'flex gap-1 items-center';

  if (mode === 'card') {
    return <CardModeBadges message={message} size={size} />;
  }

  const spamCheck = getSpamCheck(message);
  const hasAttachments = hasMessageAttachments(message);
  const analysis = message.metadata?.analysis as { needsMoreInfo?: boolean } | undefined;

  const renderSla = () => {
    if (message.status === 'resolved' || !message.slaResponseMinutes) return null;
    const target = message.slaResponseMinutes;

    if (message.lastReplyFromClient && message.lastReplyAt) {
      const elapsed = Math.floor((Date.now() - new Date(message.lastReplyAt).getTime()) / 60000);
      const breached = elapsed > target;
      const atRisk = !breached && elapsed > target * 0.8;
      if (breached)
        return (
          <Tooltip
            content={`Follow-up SLA breached · target ${formatDuration(target)} · elapsed ${formatDuration(elapsed)}`}
            size="sm"
          >
            <Badge variant="danger" className={bc}>
              <AlertTriangle className={ic} />
              SLA
            </Badge>
          </Tooltip>
        );
      if (atRisk)
        return (
          <Tooltip
            content={`Follow-up SLA at risk · target ${formatDuration(target)} · ${formatDuration(target - elapsed)} remaining`}
            size="sm"
          >
            <Badge variant="warning" className={bc}>
              <AlertTriangle className={ic} />
              SLA
            </Badge>
          </Tooltip>
        );
      return null;
    }

    if (!message.firstResponseAt) {
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
          <Tooltip
            content={`SLA breached · target ${formatDuration(target)} · elapsed ${formatDuration(elapsed)}`}
            size="sm"
          >
            <Badge variant="danger" className={bc}>
              <AlertTriangle className={ic} />
              SLA
            </Badge>
          </Tooltip>
        );
      if (atRisk)
        return (
          <Tooltip
            content={`SLA at risk · target ${formatDuration(target)} · ${formatDuration(target - elapsed)} remaining`}
            size="sm"
          >
            <Badge variant="warning" className={bc}>
              <AlertTriangle className={ic} />
              SLA
            </Badge>
          </Tooltip>
        );
    }
    return null;
  };

  return (
    <>
      {message.needsHumanReview && (
        <Tooltip content="Flagged for human review" size="sm">
          <Badge variant="warning" className={bc}>
            <BellRing className={ic} />
            {size === 'sm' ? 'Review' : 'Needs Review'}
          </Badge>
        </Tooltip>
      )}
      {spamCheck?.isSpam === true && (
        <Tooltip
          content={`Spam: ${spamCheck.redFlags?.map(humanizeSignalFlag).join(', ') ?? ''}`}
          size="sm"
        >
          <Badge variant="danger" className={bc}>
            <ShieldX className={ic} />
            {getFilteredCategoryLabel(spamCheck.category)}
          </Badge>
        </Tooltip>
      )}
      {!spamCheck?.isSpam && spamCheck?.category === 'suspicious' && (
        <Tooltip
          content={`Suspicious: ${spamCheck.redFlags?.map(humanizeSignalFlag).join(', ') ?? ''}`}
          size="sm"
        >
          <Badge variant="warning" className={bc}>
            <AlertTriangle className={ic} />
            Suspicious
          </Badge>
        </Tooltip>
      )}
      {(message.metadata?.contradictionCheck as ContradictionCheckMetadata | undefined)?.result
        ?.hasContradiction && (
        <Tooltip content="Contradicts previous statement" size="sm">
          <Badge variant="warning" className={bc}>
            <AlertTriangle className={ic} />
            Contradiction
          </Badge>
        </Tooltip>
      )}
      {(message.metadata?.attachmentsAnalyzed as MessageAttachmentsAnalyzed | undefined)
        ?.hasUnusualAttachments && (
        <Tooltip
          content={`${(message.metadata?.attachmentsAnalyzed as MessageAttachmentsAnalyzed).count} attachment(s), some unusual for this organization`}
          size="sm"
        >
          <Badge variant="warning" className={bc}>
            <AlertTriangle className={ic} />
            <Paperclip className={ic} />
            Unusual
          </Badge>
        </Tooltip>
      )}
      {analysis?.needsMoreInfo && (
        <Tooltip content="AI flagged as needing more information" size="sm">
          <Badge variant="warning" className={bc}>
            <AlertTriangle className={ic} />
            Needs Info
          </Badge>
        </Tooltip>
      )}
      {renderSla()}
      {hasAttachments && (
        <Tooltip content={`${message.attachmentCount ?? 0} attachment(s)`} size="sm">
          <Badge variant="default" className={bc}>
            <Paperclip className={ic} />
            {message.attachmentCount ?? 0}
          </Badge>
        </Tooltip>
      )}
      {(message.metadata as { isFromKBSource?: boolean })?.isFromKBSource && (
        <Tooltip content="Message from Knowledge Base source" size="sm">
          <Badge
            variant="default"
            className={`text-white bg-purple-600 ${bc} hover:bg-purple-700`}
          >
            <BookOpen className={ic} />
            Knowledge Base
          </Badge>
        </Tooltip>
      )}
      {message.status === 'resolved' && (
        <Tooltip content="Message resolved" size="sm">
          <Badge className="text-white bg-green-600 hover:bg-green-700">✓ Resolved</Badge>
        </Tooltip>
      )}
    </>
  );
};

/**
 * Card-mode rendering: at most one severity badge (SLA when applicable, then
 * the top risk signal) plus a `+N` overflow chip when other risk signals are
 * hidden. Category, bot, labels, KB, resolved are explicitly excluded — they
 * either fold into other tier-2 surfaces on the card (KB, labels) or live in
 * the detail view (category, bot).
 */
const CardModeBadges = ({ message, size }: { message: Message; size: 'sm' | 'md' }) => {
  const ic = size === 'sm' ? 'w-2.5 h-2.5' : 'w-4 h-4';
  const slaPad = size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs';

  const sla = getSlaCardText(message);
  const risks = getRiskSignals(message);

  // Determine the single top alert + overflow. SLA wins when present
  // (it's the most actionable single fact on the card).
  let top: { kind: 'sla'; sla: NonNullable<typeof sla> } | { kind: 'risk'; risk: (typeof risks)[number] } | null =
    null;
  let overflow: typeof risks = [];
  if (sla) {
    top = { kind: 'sla', sla };
    overflow = risks;
  } else if (risks[0]) {
    top = { kind: 'risk', risk: risks[0] };
    overflow = risks.slice(1);
  }

  if (!top) return null;

  return (
    <>
      {top.kind === 'sla' && (
        <Tooltip
          content={`SLA ${top.sla.label.toLowerCase()} · ${top.sla.detail}`}
          size="sm"
        >
          <Badge
            variant={top.sla.variant === 'breach' ? 'danger' : 'warning'}
            className={`inline-flex gap-1 items-center ${slaPad}`}
          >
            <AlertTriangle className={ic} />
            <span className="font-semibold">{top.sla.label}</span>
            <span className="opacity-80">· {top.sla.detail}</span>
          </Badge>
        </Tooltip>
      )}
      {top.kind === 'risk' && (
        <Tooltip content={top.risk.tooltip} size="sm">
          <Badge
            variant={top.risk.tone === 'breach' ? 'danger' : 'warning'}
            className={`inline-flex gap-1 items-center ${slaPad}`}
          >
            <AlertTriangle className={ic} />
            {top.risk.label}
          </Badge>
        </Tooltip>
      )}
      {overflow.length > 0 && (
        <Tooltip content={renderOverflowTooltip(overflow)} size="sm">
          <Badge
            variant="secondary"
            className={`inline-flex items-center ${slaPad} font-semibold`}
          >
            +{overflow.length}
          </Badge>
        </Tooltip>
      )}
    </>
  );
};
