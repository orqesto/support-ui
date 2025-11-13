import { useState, useEffect } from 'react';
import { Search, Check, TrendingUp, Clock, User, BookOpen, MessageCircle, ExternalLink, FileText, ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';

type SimilarMessage = {
  messageId?: number;
  content: string;
  subject?: string | null;
  sender?: string;
  directReply: string;
  similarity: number;
  repliedAt?: string | null;
  repliedBy?: number | null;
  source: 'documentation' | 'message';
  documentationId?: number;
  documentTitle?: string;
  chunkId?: number;
  chunkIndex?: number;
  chunkMetadata?: { extractedText?: string; page?: number };
  references?: Array<{
    chunkId: number;
    chunkIndex: number;
    metadata: unknown;
  }>;
};

type SimilarMessagesDialogProps = {
  messageId: number;
  open: boolean;
  onClose: () => void;
  onSelectAnswer: (answer: string) => void;
};

export const SimilarMessagesDialog = ({
  messageId,
  open,
  onClose,
  onSelectAnswer,
}: SimilarMessagesDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [similarMessages, setSimilarMessages] = useState<SimilarMessage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedQuotes, setExpandedQuotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open && messageId) {
      const fetchSimilarMessages = async () => {
        setLoading(true);
        try {
          const response = await messageService.getSimilarResolvedMessages(messageId, 5, 0.7);
          setSimilarMessages(response.data ?? []);
        } catch (error) {
          console.error('Failed to fetch similar messages:', error);
          setSimilarMessages([]);
        } finally {
          setLoading(false);
        }
      };

      void fetchSimilarMessages();
    }
  }, [open, messageId]);

  const handleUseAnswer = () => {
    if (selectedIndex !== null && similarMessages[selectedIndex]) {
      onSelectAnswer(similarMessages[selectedIndex].directReply);
      onClose();
    }
  };

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.9) {
      return 'text-green-600 dark:text-green-400';
    }
    if (similarity >= 0.8) {
      return 'text-blue-600 dark:text-blue-400';
    }
    return 'text-amber-600 dark:text-amber-400';
  };

  const getSimilarityBadge = (similarity: number): string => {
    if (similarity >= 0.9) {
      return 'Very Similar';
    }
    if (similarity >= 0.8) {
      return 'Similar';
    }
    return 'Somewhat Similar';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center">
            <Search className="w-5 h-5" />
            AI Knowledge Search
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Searching documentation, resolved tickets, and previous messages
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="w-8 h-8 rounded-full border-2 animate-spin border-primary border-t-transparent" />
            </div>
          )}

          {!loading && similarMessages.length === 0 && (
            <div className="py-12 text-center rounded-lg border border-dashed">
              <Search className="mx-auto mb-3 w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No similar content found
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                No matching documentation, tickets, or messages found in the knowledge base
              </p>
            </div>
          )}

          {!loading && similarMessages.length > 0 && (
            <div className="space-y-4">
              {similarMessages.map((msg, index) => (
                <div
                  key={msg.source === 'documentation' ? `doc-${msg.documentationId}` : `msg-${msg.messageId}`}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedIndex(index);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    selectedIndex === index
                      ? 'ring-2 ring-primary bg-accent/50'
                      : 'hover:border-primary hover:bg-accent/20'
                  }`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex gap-2 items-center mb-1">
                        <h3 className="font-semibold text-sm flex items-center gap-2">
                          {msg.source === 'documentation' ? (
                            <>
                              <BookOpen className="w-4 h-4 text-blue-500" />
                              {msg.documentTitle ?? 'Documentation'}
                            </>
                          ) : (
                            <>
                              <MessageCircle className="w-4 h-4 text-green-500" />
                              {msg.subject ?? 'No Subject'}
                            </>
                          )}
                        </h3>
                        <Badge 
                          variant={msg.source === 'documentation' ? 'default' : 'secondary'} 
                          className="text-xs"
                        >
                          {msg.source === 'documentation' ? 'Doc' : `ID: ${msg.messageId}`}
                        </Badge>
                      </div>
                      <div className="flex gap-3 items-center text-xs text-muted-foreground">
                        {msg.source === 'message' && msg.sender && (
                          <span className="flex gap-1 items-center">
                            <User className="w-3 h-3" />
                            {msg.sender}
                          </span>
                        )}
                        {msg.repliedAt && (
                          <span className="flex gap-1 items-center">
                            <Clock className="w-3 h-3" />
                            {formatDate(new Date(msg.repliedAt))}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <div className={`flex gap-1 items-center text-sm font-semibold ${getSimilarityColor(msg.similarity)}`}>
                        <TrendingUp className="w-4 h-4" />
                        {Math.round(msg.similarity * 100)}%
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getSimilarityBadge(msg.similarity)}
                      </span>
                    </div>
                  </div>

                  {/* Original Text (Expandable for Documentation) */}
                  {msg.source === 'documentation' ? (
                    <div className="mb-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedQuotes(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(index)) {
                              newSet.delete(index);
                            } else {
                              newSet.add(index);
                            }
                            return newSet;
                          });
                        }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        {expandedQuotes.has(index) ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            Hide Original Text
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            Show Original Text
                          </>
                        )}
                      </button>
                      {expandedQuotes.has(index) && (
                        <div className="mt-2 p-3 rounded bg-muted/30 border border-muted">
                          <div className="flex items-center gap-1 mb-2 text-xs font-medium text-muted-foreground">
                            <Quote className="w-3 h-3" />
                            Original Documentation Quotes:
                          </div>
                          <p className="text-sm whitespace-pre-wrap text-muted-foreground italic">
                            {msg.content}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mb-3 p-3 rounded bg-muted/30">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Customer Request:
                      </p>
                      <p className="text-sm whitespace-pre-wrap line-clamp-3">
                        {msg.content}
                      </p>
                    </div>
                  )}

                  {/* Answer */}
                  <div className={`p-3 rounded border ${
                    msg.source === 'documentation'
                      ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
                      : 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                  }`}>
                    <p className={`mb-1 text-xs font-medium ${
                      msg.source === 'documentation'
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-green-700 dark:text-green-300'
                    }`}>
                      {msg.source === 'documentation' ? 'From Documentation:' : 'Support Answer:'}
                    </p>
                    <p className={`text-sm whitespace-pre-wrap ${
                      msg.source === 'documentation'
                        ? 'text-blue-900 dark:text-blue-50'
                        : 'text-green-900 dark:text-green-50'
                    }`}>
                      {msg.directReply}
                    </p>
                  </div>

                  {/* Reference/Citation */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {msg.source === 'documentation' ? (
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-3 h-3" />
                          <span className="font-medium">{msg.documentTitle}</span>
                        </div>
                        {msg.references && msg.references.length > 0 ? (
                          <div className="ml-5 space-y-0.5">
                            {msg.references.map((ref) => {
                              const metadata = ref.metadata as { page?: number } | null;
                              const sectionNum = ref.chunkIndex !== undefined && ref.chunkIndex !== null 
                                ? ref.chunkIndex + 1 
                                : '?';
                              return (
                                <div key={ref.chunkId}>
                                  • Section {sectionNum}
                                  {metadata?.page && ` (Page ${metadata.page})`}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          msg.chunkIndex !== undefined && msg.chunkIndex !== null && (
                            <div className="ml-5">
                              • Section {msg.chunkIndex + 1}
                              {msg.chunkMetadata?.page && ` (Page ${msg.chunkMetadata.page})`}
                            </div>
                          )
                        )}
                      </>
                    ) : (
                      msg.messageId && (
                        <Link
                          to={`/messages?id=${msg.messageId}`}
                          className="flex items-center gap-1 hover:text-primary transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="underline">
                            View Original Message #{msg.messageId}
                          </span>
                        </Link>
                      )
                    )}
                  </div>

                  {selectedIndex === index && (
                    <div className="flex justify-center items-center mt-3">
                      <Badge variant="success" className="text-xs">
                        <Check className="mr-1 w-3 h-3" />
                        Selected
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleUseAnswer} disabled={selectedIndex === null}>
            <Check className="mr-2 w-4 h-4" />
            Use This Answer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
