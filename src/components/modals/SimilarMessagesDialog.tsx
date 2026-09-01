// Over the 650-line cap — same as the sibling message components. The
// no-AI-provider note + failure toast tipped it over; splitting the source-card
// renderer out is the natural follow-up refactor.
/* eslint-disable max-lines */
import { useState, useEffect } from 'react';
import { AlertTriangle, BookOpen, Check, ChevronDown, ChevronUp, Clock, ExternalLink, FileText, Globe, Languages, Loader2, MessageCircle, Quote, Search, Sparkles, TrendingUp, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '@/components/ui/Dialog';
import { formatDate } from '@/lib/utils';
import { Spinner } from '@/components/ui/Spinner';
import { messageService } from '@/services/message.service';
import { useSupportedLanguages } from '@/hooks/useTranslation';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { isAiNotConfiguredError, AI_NOT_CONFIGURED_MESSAGE } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import {
  type SimilarMessage,
  toSimilarMessages,
  getSimilarityColor,
  getSimilarityBadge,
} from './similarMessagesTypes';

type SimilarMessagesDialogProps = {
  messageId: number;
  open: boolean;
  onClose: () => void;
  onSelectAnswer: (answer: string, source?: string) => void;
  preloadedSources?: SimilarMessage[];
  preloadedTitle?: string;
};

/**
 * What to tell the agent when no reply was written. Keyed by the backend's `reason`.
 *
 * 🔑 Each line names WHOSE PROBLEM IT IS, because that decides what the agent does next: a
 * content gap means write the answer, a failure on our side means try again rather than
 * assume the knowledge base is empty. They used to share one silence.
 */
const NO_ANSWER_COPY: Record<string, string> = {
  'no-sources': 'Nothing in the knowledge base matched this message, so no reply was drafted.',
  'sources-unusable':
    'The matches below are references, not answers — none of them could be turned into a reply.',
  'generation-empty':
    'The assistant was asked but returned nothing. This is a fault on our side, not an empty knowledge base — try again, and report it if it keeps happening.',
  'generation-failed':
    'The assistant could not be reached, so no reply was drafted. The sources below are still valid — try again shortly.',
  'search-failed': 'The search itself failed, so nothing below is a complete picture. Try again.',
  default: 'No reply was drafted for this message.',
};

export const SimilarMessagesDialog = ({
  messageId,
  open,
  onClose,
  onSelectAnswer,
  preloadedSources,
  preloadedTitle,
}: SimilarMessagesDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [similarMessages, setSimilarMessages] = useState<SimilarMessage[]>(preloadedSources ?? []);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [expandedQuotes, setExpandedQuotes] = useState<Set<number>>(new Set());
  const [showEnglish, setShowEnglish] = useState<Record<number, boolean>>({});
  const [aiMode, setAiMode] = useState<'ai-generated' | 'search-results' | null>(null);
  // null = unknown (preloaded sources / not yet fetched); false = org has no provider.
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  /**
   * WHY there is no written answer. `aiConfigured` cannot carry this: it reports whether a
   * provider exists, so it is true for a call that ran and failed. Without the distinction
   * an empty knowledge base and a model that returned nothing looked identical here — which
   * is exactly how a starved token budget presented as "the KB has nothing" on prod.
   */
  const [noAnswerReason, setNoAnswerReason] = useState<string | null>(null);
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
    if (preloadedSources) {
      setSimilarMessages(preloadedSources);
      return;
    }
    if (open && messageId) {
      // ⛔ EVERY RUN OF THIS EFFECT SPENDS MONEY — it is a billed AI generation, not a read.
      // It had no guard at all, so StrictMode's double-invoke fired two generations per
      // open in dev, and in production a re-open or a changed prop identity started a
      // second one whose LATE response overwrote the fresh one. Observed on 2026-09-01:
      // twin requests 1ms apart that disagreed — one 'ai-generated', one 'search-results'.
      let current = true;

      const fetchSuggestedAnswer = async () => {
        setLoading(true);
        try {
          const response = await messageService.getSuggestedAnswer(messageId);
          // A superseded run must not paint over the current one.
          if (!current) return;

          // Set AI mode and response
          setAiMode(response.data?.mode ?? null);
          setAiConfigured(response.data?.aiConfigured ?? true);
          setNoAnswerReason(response.data?.reason ?? null);
          setAiResponse(response.data?.aiResponse?.text ?? null);
          setAiConfidence(response.data?.aiResponse?.confidence ?? 0);
          // Convert sources to similar messages format for backward compatibility
          const sources = response.data?.sources ?? [];
          const converted: SimilarMessage[] = toSimilarMessages(sources);

          setSimilarMessages(converted);
        } catch (error) {
          if (!current) return;
          logger.error('Failed to fetch suggested answer:', error);
          setSimilarMessages([]);
          setAiMode(null);
          setAiConfigured(null);
          setNoAnswerReason(null);
          setAiResponse(null);
        } finally {
          if (current) setLoading(false);
        }
      };

      void fetchSuggestedAnswer();
      return () => {
        current = false;
      };
    }
    return undefined;
  }, [open, messageId, preloadedSources]);

  /**
   * Is the highlighted row raw source text rather than an authored reply? Drives both the
   * caution and the button wording — a documentation chunk and a reply an agent actually
   * sent are not the same artefact and must not be offered as though they were.
   */
  const selectedIsRawSource =
    !useAiResponse &&
    selectedIndex !== null &&
    similarMessages[selectedIndex]?.isRawSourceText === true;

  const handleUseAnswer = async (forceText?: string) => {
    // If AI response is selected
    if (useAiResponse && aiResponse) {
      // Use translated text if available and no override provided
      const textToUse =
        forceText ?? (showTranslation && translatedAiResponse ? translatedAiResponse : aiResponse);
      // Save to message metadata for persistence
      try {
        await messageService.saveSuggestedAnswer(messageId, {
          answer: textToUse,
          similarity: aiConfidence,
          source: 'ai-generated',
        });
      } catch (error) {
        logger.error('Failed to save suggested answer:', error);
      }
      onSelectAnswer(textToUse, 'ai-generated');
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
        logger.error('Failed to save suggested answer:', error);
      }

      onSelectAnswer(answer, msg.source);
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
      logger.error('Translation failed:', error);
      toast.error(
        isAiNotConfiguredError(error)
          ? AI_NOT_CONFIGURED_MESSAGE
          : error instanceof Error
            ? error.message
            : 'Translation failed'
      );
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onClose}
      className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
    >
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div>
            <DialogTitle className="flex gap-2 items-center">
              <Search className="w-5 h-5" />
              {preloadedTitle ?? 'AI Knowledge Search'}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Searching documentation, resolved tickets, and previous messages
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="overflow-y-auto flex-1">
          {/* No AI provider — the endpoint still returned similar matches, so be
              explicit that this is the fallback rather than an AI-generated reply. */}
          {!loading && aiConfigured === false && (
            <div className="flex gap-2 items-start p-3 mb-4 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              <Sparkles className="flex-shrink-0 mt-0.5 w-4 h-4" />
              <span>
                AI suggestions need a provider — showing similar messages instead. Connect an AI
                provider in Settings to get suggested replies.
              </span>
            </div>
          )}

          {/* Why there is no written answer. Distinct from the banner above: that one is an
              admin task (no provider), these are a content gap or our own failure — and
              conflating them is what made a starved token budget read as an empty KB. */}
          {!loading && aiConfigured !== false && noAnswerReason && (
            <div className="flex gap-2 items-start p-3 mb-4 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              <Sparkles className="flex-shrink-0 mt-0.5 w-4 h-4" />
              <span>{NO_ANSWER_COPY[noAnswerReason] ?? NO_ANSWER_COPY.default}</span>
            </div>
          )}

          {/* AI-Generated Response Section */}
          {!loading && aiMode === 'ai-generated' && aiResponse && (
            <div className="mb-4">
              <div
                onClick={() => {
                  setUseAiResponse(true);
                  setSelectedIndex(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
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
                    onClick={(event) => {
                      event.stopPropagation();
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
                  <div className="overflow-y-auto max-h-[200px]">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
                  </div>
                </div>

                {/* Translated Response */}
                {showTranslation && translatedAiResponse && (
                  <div className="p-3 mt-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded border border-blue-200 dark:from-blue-950/20 dark:to-blue-900/30 dark:border-blue-800">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Translated to {languages?.find((lang) => lang.code === selectedLanguage)?.name}:
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-auto px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleUseAnswer(aiResponse);
                        }}
                      >
                        Use original instead
                      </Button>
                    </div>
                    <div className="overflow-y-auto max-h-[200px]">
                      <p className="text-sm leading-relaxed text-blue-900 whitespace-pre-wrap dark:text-blue-100">
                        {translatedAiResponse}
                      </p>
                    </div>
                  </div>
                )}

                {similarMessages.length > 0 && (
                  <div className="flex gap-2 items-center mt-3 text-xs text-muted-foreground">
                    <Sparkles className="w-3 h-3" />
                    <span>Synthesized from {similarMessages.length} sources (see below)</span>
                  </div>
                )}

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
              <Spinner size={20} className="text-primary" />
            </div>
          )}

          {!loading && similarMessages.length === 0 && aiMode !== 'ai-generated' && (
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
                      ? `doc-${msg.documentationId}-${index}`
                      : `msg-${msg.messageId}-${index}`
                  }
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
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
                        {/* The backend widened past this conversation's department to find
                            anything at all — say so, because the answer may come from a
                            department this agent does not work in. */}
                        {msg.viaOrgWideFallback && (
                          <Badge
                            variant="warning"
                            className="text-xs"
                            title="No knowledge in this conversation's department — found elsewhere in the workspace"
                          >
                            Other department
                          </Badge>
                        )}
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
                      {msg.content && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedQuotes((prev) => {
                              const nextSet = new Set(prev);
                              if (nextSet.has(index)) {
                                nextSet.delete(index);
                              } else {
                                nextSet.add(index);
                              }
                              return nextSet;
                            });
                          }}
                          className="gap-1 items-center p-0 h-auto text-xs text-muted-foreground hover:text-primary"
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
                        </Button>
                      )}
                      {msg.content && expandedQuotes.has(index) && (
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
                      <div className="overflow-y-auto min-h-[48px] max-h-[120px]">
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
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
                            <Button
                              size="sm"
                              variant={!showEnglish[index] ? 'primary' : 'secondary'}
                              onClick={(event) => {
                                event.stopPropagation();
                                setShowEnglish((prev) => ({ ...prev, [index]: false }));
                              }}
                              className="gap-1 items-center px-2 py-1 h-auto text-xs"
                            >
                              <Globe className="w-3 h-3" />
                              {msg.detectedLanguage.toUpperCase()}
                            </Button>
                            <Button
                              size="sm"
                              variant={showEnglish[index] ? 'primary' : 'secondary'}
                              onClick={(event) => {
                                event.stopPropagation();
                                setShowEnglish((prev) => ({ ...prev, [index]: true }));
                              }}
                              className="gap-1 items-center px-2 py-1 h-auto text-xs"
                            >
                              EN
                            </Button>
                          </div>
                        )}
                    </div>
                    <div className="overflow-y-auto min-h-[60px] max-h-[160px]">
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
                  </div>

                  {/* Reference/Citation */}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {msg.source === 'documentation' ? (
                      <>
                        <div className="flex gap-2 items-center mb-1">
                          <FileText className="w-3 h-3" />
                          {msg.parentDocId ? (
                            <Link
                              to={`/knowledge-base?docId=${msg.parentDocId}#documentation`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium underline transition-colors hover:text-primary"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {msg.documentTitle}
                            </Link>
                          ) : msg.documentationId ? (
                            <Link
                              to={`/knowledge-base?id=${msg.documentationId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium underline transition-colors hover:text-primary"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {msg.documentTitle}
                            </Link>
                          ) : (
                            <span className="font-medium">{msg.documentTitle}</span>
                          )}
                        </div>
                        {msg.references && msg.references.length > 0 ? (
                          <div className="ml-5 space-y-0.5">
                            {msg.references.map((ref) => {
                              const meta = ref.metadata as { page?: number } | null;
                              const sec =
                                ref.chunkIndex !== null && ref.chunkIndex !== undefined
                                  ? ref.chunkIndex + 1
                                  : '?';
                              return (
                                <div key={ref.chunkId}>
                                  • Section {sec}
                                  {meta?.page && ` (Page ${meta.page})`}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          msg.chunkIndex !== null &&
                          msg.chunkIndex !== undefined && (
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
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex gap-1 items-center transition-colors hover:text-primary"
                          onClick={(event) => event.stopPropagation()}
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

        {/* ⛔ The selected row is documentation, not a reply somebody sent a customer.
            Inserting it verbatim is a real path for internal content to reach a customer —
            orbelli's top-ranked chunk on prod begins "OPEN COMPLIANCE ITEM — escalate, do
            not improvise". The insert is still allowed (agents legitimately paste a passage
            and edit it); what is removed is the false equivalence with a written answer. */}
        {selectedIsRawSource && (
          <div className="flex gap-2 items-start px-6 pt-3 text-[13px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="flex-shrink-0 mt-0.5 w-4 h-4" />
            <span>
              This is raw documentation written for agents, not a reply to a customer. It may
              contain internal notes — read it before sending.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleUseAnswer()}
            disabled={!useAiResponse && selectedIndex === null}
          >
            <Check className="mr-2 w-4 h-4" />
            {useAiResponse
              ? showTranslation && translatedAiResponse
                ? 'Use Translated Response'
                : 'Use AI Response'
              : selectedIsRawSource
                ? 'Insert source text'
                : 'Use This Answer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
