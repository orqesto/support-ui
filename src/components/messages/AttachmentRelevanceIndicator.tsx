import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import type { AttachmentRelevanceMetadata } from '@/types/ai';

type AttachmentRelevanceIndicatorProps = {
  relevance: AttachmentRelevanceMetadata;
};

export const AttachmentRelevanceIndicator = ({ relevance }: AttachmentRelevanceIndicatorProps) => {
  if (!relevance.flaggedAsUnusual) {
    return null;
  }

  const relevancePercentage = Math.round(relevance.scores.overallRelevance * 100);

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="font-semibold">Unusual attachment for this organization</div>
          <div className="text-xs">Relevance score: {relevancePercentage}%</div>
          {relevance.scores.descriptionMatch > 0 && (
            <div className="text-xs">
              Description match: {Math.round(relevance.scores.descriptionMatch * 100)}%
            </div>
          )}
          {relevance.scores.kbMatch > 0 && (
            <div className="text-xs">
              Knowledge base match: {Math.round(relevance.scores.kbMatch * 100)}%
            </div>
          )}
          {relevance.reason && <div className="pt-1 mt-1 text-xs border-t">{relevance.reason}</div>}
        </div>
      }
    >
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        Unusual
      </Badge>
    </Tooltip>
  );
};

type MessageAttachmentWarningProps = {
  hasUnusualAttachments: boolean;
  count: number;
};

export const MessageAttachmentWarning = ({
  hasUnusualAttachments,
  count,
}: MessageAttachmentWarningProps) => {
  if (!hasUnusualAttachments) {
    return null;
  }

  return (
    <Tooltip
      content={`${count} attachment${count > 1 ? 's' : ''}, some unusual for this organization`}
    >
      <Badge variant="warning" size="sm" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        {count}
      </Badge>
    </Tooltip>
  );
};
