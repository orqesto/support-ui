import {
  Bot,
  CheckCircle,
  Eye,
  EyeOff,
  Maximize2,
  Trash2,
  MessageSquare,
  FileText,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { KBStatusBadge } from './KBStatusBadge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { REJECTED_RETENTION_DAYS } from '@/lib/kbRejection';
import type { KBEntry } from '@/services/kb.service';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'qa_pair':
      return <MessageSquare className="w-4 h-4 text-muted-foreground" />;
    case 'document':
      return <FileText className="w-4 h-4 text-success" />;
    default:
      return <FileText className="w-4 h-4 text-muted-foreground" />;
  }
};

const getQualityColor = (score: number) => {
  if (score >= 0.8) return 'text-success';
  if (score >= 0.6) return 'text-warning';
  return 'text-destructive';
};

type KBEntryCardProps = {
  entry: KBEntry;
  onView: (entry: KBEntry) => void;
  onApprove: (id: number) => void;
  onHide: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (entry: KBEntry) => void;
  /** May approve / reject / hide (manage_knowledge_base). Without it the server answers 403. */
  canReview: boolean;
};

export const KBEntryCard = ({
  entry,
  onView,
  onApprove,
  onHide,
  onReject,
  onDelete,
  canReview,
}: KBEntryCardProps) => (
  <Card className="p-4">
    <div className="flex gap-3">
      {/* Icon */}
      <div className="shrink-0">{getTypeIcon(entry.type)}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-display font-medium text-sm truncate">{entry.title}</h3>
          {/* Approving an entry makes it retrievable ground truth for future AI
              answers, so a reviewer must be told when the "expert answer" they
              are about to bless was written by the model rather than a colleague. */}
          {entry.metadata?.authorProvenance === 'ai_drafted' && (
            <Badge
              variant="secondary"
              className="shrink-0 gap-1"
              title="This answer was drafted by AI and sent by an agent — review it before approving."
            >
              <Bot className="w-3 h-3" />
              AI-drafted
            </Badge>
          )}
          <KBStatusBadge entry={entry} className="shrink-0" />
        </div>

        {/* Preview */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{entry.content}</p>

        {/* Metadata */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <span className={`font-medium ${getQualityColor(entry.qualityScore)}`}>
              {(entry.qualityScore * 100).toFixed(0)}%
            </span>
          </div>
          <span>•</span>
          <Badge variant="secondary" className="text-xs">
            {entry.category}
          </Badge>
          {entry.metadata && typeof entry.metadata.sourceMessageId === 'number' && (
            <>
              <span>•</span>
              <a
                href={`/messages?id=${entry.metadata.sourceMessageId}`}
                className="font-mono text-primary hover:text-primary hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                #{entry.metadata.sourceMessageId}
              </a>
            </>
          )}
          <span>•</span>
          <span>{entry.usageCount} uses</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onView(entry)} className="flex-1">
            <Maximize2 className="w-4 h-4 mr-1" />
            View
          </Button>
          {canReview && !entry.approved && !entry.hidden && (
            <>
              <Button size="sm" variant="outline" onClick={() => onApprove(entry.id)} title="Approve"
  aria-label="Approve">
                <CheckCircle className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(entry.id)}
                title={`Reject — hidden now, deleted after ${REJECTED_RETENTION_DAYS} days`}
                aria-label="Reject"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </>
          )}
          {canReview &&
            (!entry.hidden ? (
              <Button size="sm" variant="outline" onClick={() => onHide(entry.id)} title="Hide"
  aria-label="Hide">
                <EyeOff className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onApprove(entry.id)}
                title={entry.rejectedAt ? 'Approve — restores the rejected entry' : 'Unhide'}
                aria-label={entry.rejectedAt ? 'Restore' : 'Unhide'}
              >
                <Eye className="w-4 h-4" />
              </Button>
            ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(entry)}
            title="Delete"
            aria-label="Delete"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  </Card>
);
