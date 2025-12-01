import { useState, useEffect } from 'react';
import {
  Search,
  Check,
  TrendingUp,
  Clock,
  User,
  BookOpen,
  MessageCircle,
  ExternalLink,
  FileText,
  ChevronDown,
  ChevronUp,
  Quote,
  Globe,
  Sparkles,
  Languages,
  Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import { useSupportedLanguages } from '@/hooks/useTranslation';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { apiClient } from '@/lib/api-client';

type SimilarMessage = {
  messageId?: number;
  content: string;
  subject?: string | null;
  sender?: string;
  directReply: string;
  directReplyEnglish?: string;
  detectedLanguage?: string;
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
  const [showEnglish, setShowEnglish] = useState<Record<number, boolean>>({});
  const [aiMode, setAiMode] = useState<'ai-generated' | 'search-results' | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<number>(0);
  const [useAiResponse, setUseAiResponse] = useState(false);
  const [translatedAiResponse, setTranslatedAiResponse] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const { languages, fetchLanguages } = useSupportedLanguages();

  useEffect(() => {
    if (open) {
      void fetchLanguages();
    }
  }, [open, fetchLanguages]);

  useEffect(() => {
    if (open && messageId) {
      const fetchSuggestedAnswer = async () => {
        setLoading(true);
        try {
          const response = await messageService.getSuggestedAnswer(messageId);

          // Set AI mode and response
          setAiMode(response.data?.mode ?? null);
          setAiResponse(response.data?.aiResponse?.text ?? null);
          setAiConfidence(response.data?.aiResponse?.confidence ?? 0);

          // Convert sources to similar messages format for backward compatibility
          const sources = response.data?.sources ?? [];
          const converted: SimilarMessage[] = sources.map((source) => ({
            messageId: source.type === 'message' ? source.id : undefined,
            content: source.content,
            subject: source.title ?? null,
            sender: source.metadata?.sender as string | undefined,
            directReply: source.answer ?? source.content,
            similarity: source.similarity,
            repliedAt: source.metadata?.repliedAt as string | null | undefined,
            source: source.type === 'documentation' ? 'documentation' : 'message',
            documentationId: source.type === 'documentation' ? source.id : undefined,
            documentTitle: source.type === 'documentation' ? source.title : undefined,
          }));

          setSimilarMessages(converted);
        } catch (error) {
          console.error('Failed to fetch suggested answer:', error);
          setSimilarMessages([]);
          setAiMode(null);
          setAiResponse(null);
        } finally {
          setLoading(false);
        }
      };

      void fetchSuggestedAnswer();
    }
  }, [open, messageId]);

  const handleUseAnswer = async () => {
    // If AI response is selected
    if (useAiResponse && aiResponse) {
      // Save to message metadata for persistence
      try {
        await messageService.saveSuggestedAnswer(messageId, {
          answer: aiResponse,
          similarity: aiConfidence,
          source: 'ai-generated',
        });
      } catch (error) {
        console.error('Failed to save suggested answer:', error);
      }
      onSelectAnswer(aiResponse);
      onClose();
      return;
    }

    // Otherwise use selected source
    if (selectedIndex !== null && similarMessages[selectedIndex]) {
      const msg = similarMessages[selectedIndex];
      // Use the version the user is currently viewing (English or native)
      const answer =
        showEnglish[selectedIndex] && msg.directReplyEnglish
          ? msg.directReplyEnglish
          : msg.directReply;

      // Save to message metadata for persistence
      try {
        await messageService.saveSuggestedAnswer(messageId, {
          answer,
          similarity: msg.similarity,
          source: msg.source,
          documentTitle: msg.documentTitle,
        });
      } catch (error) {
        console.error('Failed to save suggested answer:', error);
      }

      onSelectAnswer(answer);
      onClose();
    }
  };

  const handleTranslateAiResponse = async () => {
    if (!aiResponse || !selectedLanguage) return;

    setIsTranslating(true);
    try {
      const response = await apiClient.post<{
        success: boolean;
        data: { translated: { content: string } };
      }>('/api/translation/text/translate', {
        text: aiResponse,
        targetLanguage: selectedLanguage,
      });

      if (response.data.success) {
        setTranslatedAiResponse(response.data.data.translated.content);
        setShowTranslation(true);
      }
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      setIsTranslating(false);
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
    <Dialog
      open={open}
      onOpenChange={onClose}
      className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
    >
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

        <div className="overflow-y-auto flex-1">
          {/* AI-Generated Response Section */}
          {!loading && aiMode === 'ai-generated' && aiResponse && (
            <div className="mb-4">
              <div
                onClick={() => {
                  setUseAiResponse(true);
                  setSelectedIndex(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setUseAiResponse(true);
                    setSelectedIndex(null);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  useAiResponse
                    ? 'ring-2 border-primary bg-primary/10 ring-primary'
                    : 'border-dashed border-muted-foreground/30 hover:border-primary hover:bg-accent/20'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-2 items-center">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-semibold">AI-Generated Response</h3>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <div className="flex gap-1 items-center text-sm font-semibold text-primary">
                      <TrendingUp className="w-4 h-4" />
                      {Math.round(aiConfidence * 100)}%
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {aiConfidence >= 0.9
                        ? 'Very Confident'
                        : aiConfidence >= 0.8
                          ? 'Confident'
                          : 'Moderate'}
                    </span>
                  </div>
                </div>

                {/* Translation Controls */}
                <div className="flex gap-2 items-center mb-3">
                  <ReactSelect
                    value={selectedLanguage}
                    onChange={setSelectedLanguage}
                    options={
                      languages && languages.length > 0
                        ? languages.map((lang) => ({
                            value: lang.code,
                            label: lang.name,
                          }))
                        : [{ value: 'en', label: 'English' }]
                    }
                    className="flex-1"
                    placeholder="Select language..."
                  />
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleTranslateAiResponse();
                    }}
                    disabled={isTranslating || !selectedLanguage}
                    variant="outline"
                    size="sm"
                  >
                    {isTranslating ? (
                      <>
                        <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                        Translating...
                      </>
                    ) : (
                      <>
                        <Languages className="mr-2 w-4 h-4" />
                        Translate
                      </>
                    )}
                  </Button>
                </div>

                {/* Original Response */}
                <div className="p-3 bg-gradient-to-br rounded border from-primary/5 to-primary/10 border-primary/20">
                  <p className="mb-2 text-sm font-medium text-muted-foreground">
                    {showTranslation && translatedAiResponse ? 'Original:' : 'Suggested Answer:'}
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
                </div>

                {/* Translated Response */}
                {showTranslation && translatedAiResponse && (
                  <div className="p-3 mt-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded border border-blue-200 dark:from-blue-950/20 dark:to-blue-900/30 dark:border-blue-800">
                    <p className="mb-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                      Translated to {languages?.find((l) => l.code === selectedLanguage)?.name}:
                    </p>
                    <p className="text-sm leading-relaxed text-blue-900 whitespace-pre-wrap dark:text-blue-100">
                      {translatedAiResponse}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 items-center mt-3 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3" />
                  <span>Synthesized from {similarMessages.length} sources (see below)</span>
                </div>

                {useAiResponse && (
                  <div className="flex justify-center items-center mt-3">
                    <Badge variant="success" className="text-xs">
                      <Check className="mr-1 w-3 h-3" />
                      Selected
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search Results Section */}
          {!loading && aiMode === 'ai-generated' && similarMessages.length > 0 && (
            <div className="mb-2">
              <h4 className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
                Or choose from sources:
              </h4>
            </div>
          )}

          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="w-8 h-8 rounded-full border-2 animate-spin border-primary border-t-transparent" />
            </div>
          )}

          {!loading && similarMessages.length === 0 && (
            <div className="py-12 text-center rounded-lg border border-dashed">
              <Search className="mx-auto mb-3 w-12 h-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No similar content found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No matching documentation, tickets, or messages found in the knowledge base
              </p>
            </div>
          )}

          {!loading && similarMessages.length > 0 && (
            <div className="space-y-4">
              {similarMessages.map((msg, index) => (
                <div
                  key={
                    msg.source === 'documentation'
                      ? `doc-${msg.documentationId}`
                      : `msg-${msg.messageId}`
                  }
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
                        <h3 className="flex gap-2 items-center text-sm font-semibold">
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
                      <div
                        className={`flex gap-1 items-center text-sm font-semibold ${getSimilarityColor(msg.similarity)}`}
                      >
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
                          setExpandedQuotes((prev) => {
                            const newSet = new Set(prev);
                            if (newSet.has(index)) {
                              newSet.delete(index);
                            } else {
                              newSet.add(index);
                            }
                            return newSet;
                          });
                        }}
                        className="flex gap-1 items-center text-xs transition-colors text-muted-foreground hover:text-primary"
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
                        <div className="p-3 mt-2 rounded border bg-muted/30 border-muted">
                          <div className="flex gap-1 items-center mb-2 text-xs font-medium text-muted-foreground">
                            <Quote className="w-3 h-3" />
                            Original Documentation Quotes:
                          </div>
                          <p className="text-sm italic whitespace-pre-wrap text-muted-foreground">
                            {msg.content}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 mb-3 rounded bg-muted/30">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Customer Request:
                      </p>
                      <p className="text-sm whitespace-pre-wrap line-clamp-3">{msg.content}</p>
                    </div>
                  )}

                  {/* Answer */}
                  <div
                    className={`p-3 rounded border ${
                      msg.source === 'documentation'
                        ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800'
                        : 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <p
                        className={`text-xs font-medium ${
                          msg.source === 'documentation'
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-green-700 dark:text-green-300'
                        }`}
                      >
                        {msg.source === 'documentation' ? 'From Documentation:' : 'Support Answer:'}
                      </p>

                      {/* Language Toggle */}
                      {msg.directReplyEnglish &&
                        msg.detectedLanguage &&
                        msg.detectedLanguage !== 'en' && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowEnglish((prev) => ({ ...prev, [index]: false }));
                              }}
                              className={`flex gap-1 items-center px-2 py-1 text-xs rounded transition-colors ${
                                !showEnglish[index]
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              <Globe className="w-3 h-3" />
                              {msg.detectedLanguage.toUpperCase()}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowEnglish((prev) => ({ ...prev, [index]: true }));
                              }}
                              className={`flex gap-1 items-center px-2 py-1 text-xs rounded transition-colors ${
                                showEnglish[index]
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              EN
                            </button>
                          </div>
                        )}
                    </div>
                    <p
                      className={`text-sm whitespace-pre-wrap ${
                        msg.source === 'documentation'
                          ? 'text-blue-900 dark:text-blue-50'
                          : 'text-green-900 dark:text-green-50'
                      }`}
                    >
                      {showEnglish[index] && msg.directReplyEnglish
                        ? msg.directReplyEnglish
                        : msg.directReply}
                    </p>
                  </div>

                  {/* Reference/Citation */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {msg.source === 'documentation' ? (
                      <>
                        <div className="flex gap-2 items-center mb-1">
                          <FileText className="w-3 h-3" />
                          <span className="font-medium">{msg.documentTitle}</span>
                        </div>
                        {msg.references && msg.references.length > 0 ? (
                          <div className="ml-5 space-y-0.5">
                            {msg.references.map((ref) => {
                              const metadata = ref.metadata as { page?: number } | null;
                              const sectionNum =
                                ref.chunkIndex !== undefined && ref.chunkIndex !== null
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
                          msg.chunkIndex !== undefined &&
                          msg.chunkIndex !== null && (
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
                          className="flex gap-1 items-center transition-colors hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="underline">View Original Message #{msg.messageId}</span>
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
          <Button onClick={handleUseAnswer} disabled={!useAiResponse && selectedIndex === null}>
            <Check className="mr-2 w-4 h-4" />
            {useAiResponse ? 'Use AI Response' : 'Use This Answer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
