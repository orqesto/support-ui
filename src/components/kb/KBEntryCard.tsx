import { CheckCircle, Eye, EyeOff, Maximize2, Trash2, MessageSquare, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { KBEntry } from '@/services/kb.service';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'qa_pair':
      return <MessageSquare className="w-4 h-4 text-blue-500" />;
    case 'document':
      return <FileText className="w-4 h-4 text-green-500" />;
    default:
      return <FileText className="w-4 h-4 text-gray-500" />;
  }
};

const getQualityColor = (score: number) => {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
};

type KBEntryCardProps = {
  entry: KBEntry;
  onView: (entry: KBEntry) => void;
  onApprove: (id: number) => void;
  onHide: (id: number) => void;
  onDelete: (entry: KBEntry) => void;
};

export const KBEntryCard = ({ entry, onView, onApprove, onHide, onDelete }: KBEntryCardProps) => (
  <Card className="p-4">
    <div className="flex gap-3">
      {/* Icon */}
      <div className="shrink-0">{getTypeIcon(entry.type)}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-medium text-sm truncate">{entry.title}</h3>
          {entry.hidden ? (
            <Badge className="text-muted-foreground shrink-0">Hidden</Badge>
          ) : entry.approved ? (
            <Badge className="bg-green-600 shrink-0">Approved</Badge>
          ) : (
            <Badge className="shrink-0">Pending</Badge>
          )}
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
                className="font-mono text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
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
          {!entry.approved && !entry.hidden && (
            <Button size="sm" variant="outline" onClick={() => onApprove(entry.id)} title="Approve">
              <CheckCircle className="w-4 h-4" />
            </Button>
          )}
          {!entry.hidden ? (
            <Button size="sm" variant="outline" onClick={() => onHide(entry.id)} title="Hide">
              <EyeOff className="w-4 h-4" />
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onApprove(entry.id)} title="Unhide">
              <Eye className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onDelete(entry)}
            title="Delete"
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  </Card>
);
