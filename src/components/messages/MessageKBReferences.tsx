import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle, ExternalLink } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import { logger } from '@/lib/logger';

type KBReference = {
  id: number;
  type: 'qa_pair' | 'document' | 'manual_entry';
  title: string;
  content: string;
  qualityScore: number | null;
  approved: boolean;
  timesReferenced: number;
  lastReferencedAt: string | null;
  topics: string[] | null;
  category: string | null;
  typeData: unknown;
  createdAt: string;
};

type MessageKBReferencesProps = {
  messageId: number;
};

export const MessageKBReferences = ({ messageId }: MessageKBReferencesProps) => {
  const [references, setReferences] = useState<KBReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReferences = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await messageService.getKBReferences(messageId);
        if (response.success && response.data) {
          setReferences(response.data);
        }
      } catch (err) {
        logger.error('Failed to load KB references:', err);
        setError('Failed to load KB references');
      } finally {
        setLoading(false);
      }
    };

    void fetchReferences();
  }, [messageId]);

  if (loading) {
    return (
      <div className="flex items-center px-1 py-1">
        <Spinner />
      </div>
    );
  }

  if (error !== null || references.length === 0) {
    return null; // No references or error - don't display anything
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'qa_pair':
        return 'Q&A';
      case 'document':
        return 'Document';
      case 'manual_entry':
        return 'Manual Entry';
      default:
        return type;
    }
  };

  return (
    <div className="p-4 mb-4 bg-purple-50 rounded-lg border-2 border-purple-200 dark:bg-purple-950/20 dark:border-purple-800">
      <div className="flex gap-2 items-center mb-3">
        <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        <h3 className="font-semibold text-purple-900 dark:text-purple-100">
          Knowledge Base References
        </h3>
        <span className="text-xs text-purple-600 dark:text-purple-400">
          {references.length} {references.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <p className="mb-3 text-xs text-purple-700 dark:text-purple-300">
        This message was used to create the following knowledge base entries:
      </p>

      <div className="space-y-2">
        {references.map((ref) => (
          <div
            key={ref.id}
            className="p-3 bg-white rounded border border-purple-200 dark:bg-purple-950/40 dark:border-purple-700"
          >
            <div className="flex gap-2 items-start justify-between mb-2">
              <div className="flex-1">
                <div className="flex gap-2 items-center mb-1">
                  <span className="px-2 py-0.5 text-xs font-medium text-purple-700 bg-purple-100 rounded dark:text-purple-300 dark:bg-purple-900">
                    {getTypeLabel(ref.type)}
                  </span>
                  {ref.approved && (
                    <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                  )}
                  {ref.topics && ref.topics.length > 0 && (
                    <span className="text-xs text-purple-600 dark:text-purple-400">
                      {ref.topics.slice(0, 2).join(', ')}
                      {ref.topics.length > 2 && '...'}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                  {ref.title}
                </h4>
                <p className="mt-1 text-xs text-purple-700 line-clamp-2 dark:text-purple-300">
                  {ref.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/knowledge-base?id=${ref.id}`, '_blank', 'noopener,noreferrer')}
                title="View in Knowledge Base"
                className="flex-shrink-0"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-3 items-center text-xs text-purple-600 dark:text-purple-400">
              {ref.qualityScore && <span>Quality: {Math.round(ref.qualityScore * 100)}%</span>}
              <span>Referenced: {ref.timesReferenced}×</span>
              <span>Created: {formatDate(ref.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
