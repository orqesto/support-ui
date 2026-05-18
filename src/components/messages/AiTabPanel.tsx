import { useState, useEffect } from 'react';
import { BookOpen, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Message } from '@/types';
import { getSpamCheck } from '@/lib/messageHelpers';
import { MONO } from './messageDetailConstants';
import { messageService } from '@/services/message.service';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { Spinner } from '@/components/ui/Spinner';
import { logger } from '@/lib/logger';

type Analysis = {
  isTicketWorthy?: boolean;
  needsMoreInfo?: boolean;
  suggestedCategory?: string;
  suggestedPriority?: string;
  confidence?: number;
  summary?: string;
};

type SuggestedAnswer = {
  answer: string;
  confidence?: number;
  source?: 'documentation' | 'similar_ticket' | 'similar_message' | 'lead_qualification' | 'lead_qualification_kb';
  similarMessageId?: number;
  referencedChunks?: number[];
  documentationId?: number;
};

type AutoReply = { sent?: boolean };

type KBReference = { documentationId: number; documentTitle: string; similarity: number };

type ChunkReference = { chunkId: number; chunkIndex: number; metadata: unknown };
const isKBReference = (r: KBReference | ChunkReference): r is KBReference => 'documentationId' in r;

type SimilarResult = {
  messageId?: number;
  documentationId?: number;
  directReply: string;
  similarity: number;
  source: 'documentation' | 'message';
  documentTitle?: string;
  content?: string;
  subject?: string | null;
  sender?: string;
  references?: KBReference[] | ChunkReference[];
};

type ReplyOption = {
  id: string;
  label: string;
  sublabel?: string;
  answer: string;
  type: 'lead' | 'documentation' | 'similar';
  documentationId?: number;
  documentTitle?: string;
  messageId?: number;
  content?: string;
  subject?: string | null;
  sender?: string;
  references?: KBReference[] | ChunkReference[];
};

type Props = {
  message: Message;
  onGhostClick: (answer: string) => void;
  onOptionSelect?: (answer: string, label: string, type: ReplyOption['type']) => void;
  onOptionsLoaded?: (total: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** Called once after load when no metadata suggestedAnswer exists and KB results are available. */
  onAutoSuggest?: (answer: string, label: string, type: ReplyOption['type']) => void;
  /** 'suggested' = reply block only; 'analysis' = stats/flags only; default = both */
  section?: 'suggested' | 'analysis';
};

// Session-scoped cache: survives remount (inbox → full page nav) but cleared on refresh.
export const similarResultsCache = new Map<number, SimilarResult[]>();

const PILL_BASE: Record<ReplyOption['type'], string> = {
  lead: 'text-violet-600 border-violet-200 bg-violet-50 dark:text-violet-400 dark:border-violet-800/50 dark:bg-violet-950/20',
  documentation: 'text-sky-600 border-sky-200 bg-sky-50 dark:text-sky-400 dark:border-sky-800/50 dark:bg-sky-950/20',
  similar: 'text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800/50 dark:bg-amber-950/20',
};

const PILL_ACTIVE: Record<ReplyOption['type'], string> = {
  lead: 'text-violet-700 border-violet-500 bg-violet-100 ring-1 ring-violet-400/50 dark:text-violet-300 dark:border-violet-500 dark:bg-violet-900/40',
  documentation: 'text-sky-700 border-sky-500 bg-sky-100 ring-1 ring-sky-400/50 dark:text-sky-300 dark:border-sky-500 dark:bg-sky-900/40',
  similar: 'text-amber-700 border-amber-500 bg-amber-100 ring-1 ring-amber-400/50 dark:text-amber-300 dark:border-amber-500 dark:bg-amber-900/40',
};

export function AiTabPanel({ message, onGhostClick, onOptionSelect, onOptionsLoaded, onLoadingChange, onAutoSuggest, section }: Props) {
  const spamCheck = getSpamCheck(message);
  const analysis = message.metadata?.analysis as Analysis | undefined;
  const suggestedAnswer = message.metadata?.suggestedAnswer as SuggestedAnswer | undefined;
  const autoReply = message.metadata?.autoReply as AutoReply | undefined;

  const [similarResults, setSimilarResults] = useState<SimilarResult[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(true);
  useEffect(() => { onLoadingChange?.(loadingSimilar); }, [loadingSimilar, onLoadingChange]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewOriginal, setViewOriginal] = useState<ReplyOption | null>(null);
  const [viewKBSources, setViewKBSources] = useState<ReplyOption | null>(null);

  useEffect(() => {
    let cancelled = false;

    setSelectedId(null);
    setViewOriginal(null);
    setViewKBSources(null);

    const applyResults = (data: SimilarResult[]) => {
      if (cancelled) return;
      setSimilarResults(data);
      const hasSuggested = !!suggestedAnswer?.answer;
      onOptionsLoaded?.((hasSuggested ? 1 : 0) + data.length);
      // Call directly so aiLoading clears even when loadingSimilar didn't change (cache hit path).
      onLoadingChange?.(false);
      if (!hasSuggested && data.length > 0) {
        const first = data[0];
        onAutoSuggest?.(
          first.directReply,
          first.source === 'documentation' ? 'KB' : 'MSG',
          first.source === 'documentation' ? 'documentation' : 'similar'
        );
      }
    };

    const cached = similarResultsCache.get(message.id);
    if (cached) {
      setLoadingSimilar(false);
      applyResults(cached);
    } else {
      setSimilarResults([]);
      setLoadingSimilar(true);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => {
        try {
          const res = await messageService.getSimilarResolvedMessages(message.id, 3, 0.75);
          if (res.success && res.data) {
            similarResultsCache.set(message.id, res.data);
            applyResults(res.data);
          }
        } catch (err) {
          logger.error('Failed to load similar results:', err);
        } finally {
          if (!cancelled) setLoadingSimilar(false);
        }
      })();
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]); // intentionally keyed on message.id only — callbacks are stable refs

  const options: ReplyOption[] = [];

  if (suggestedAnswer && !autoReply?.sent) {
    const isLead =
      suggestedAnswer.source === 'lead_qualification' ||
      suggestedAnswer.source === 'lead_qualification_kb';
    const isDocs = suggestedAnswer.source === 'documentation';
    const matchingResult = suggestedAnswer.similarMessageId
      ? similarResults.find((r) => r.messageId === suggestedAnswer.similarMessageId)
      : undefined;
    options.push({
      id: 'suggested',
      label: isLead ? 'LEAD' : isDocs ? 'DOCS' : 'AI',
      answer: suggestedAnswer.answer,
      type: isLead ? 'lead' : isDocs ? 'documentation' : 'similar',
      documentationId: isDocs
        ? (suggestedAnswer.referencedChunks?.[0] ?? suggestedAnswer.documentationId)
        : undefined,
      messageId: suggestedAnswer.similarMessageId,
      content: matchingResult?.content,
      subject: matchingResult?.subject,
      sender: matchingResult?.sender,
    });
  }

  similarResults.forEach((r, i) => {
    options.push({
      id: `sim-${i}`,
      label: r.source === 'documentation' ? 'KB' : 'MSG',
      sublabel: `${Math.round(r.similarity * 100)}%`,
      answer: r.directReply,
      type: r.source === 'documentation' ? 'documentation' : 'similar',
      documentationId: r.documentationId,
      documentTitle: r.documentTitle,
      messageId: r.messageId,
      content: r.content,
      subject: r.subject,
      sender: r.sender,
      references: r.references,
    });
  });

  const activeOption = options.find((o) => o.id === selectedId) ?? options[0];

  return (
    <div className="space-y-1.5">
      {!analysis && !spamCheck && options.length === 0 && !loadingSimilar && (
        <p className="text-[11px] text-muted-foreground text-center py-4">No AI analysis yet</p>
      )}

      {/* Suggested reply with source switcher */}
      {section !== 'analysis' && (loadingSimilar || options.length > 0) && (
        <div className="p-1.5 rounded border border-border">
          <div className="flex justify-between items-center mb-1.5">
            <p className={`${MONO} text-muted-foreground`}>SUGGESTED REPLY</p>
            {!loadingSimilar && activeOption && (
              <button
                onClick={() => onGhostClick(activeOption.answer)}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                Use
              </button>
            )}
          </div>

          {loadingSimilar && options.length === 0 && (
            <div className="flex items-center gap-1.5 py-1">
              <Spinner />
              <span className="text-[11px] text-muted-foreground">Loading…</span>
            </div>
          )}

          {options.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {options.map((opt) => {
                const isActive = opt.id === (activeOption?.id ?? options[0]?.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSelectedId(opt.id);
                      onOptionSelect?.(opt.answer, opt.label, opt.type);
                    }}
                    className={`${MONO} px-1.5 py-0.5 rounded border text-[9px] transition-colors ${
                      isActive ? PILL_ACTIVE[opt.type] : PILL_BASE[opt.type]
                    }`}
                  >
                    {opt.sublabel ? `${opt.label} ${opt.sublabel}` : opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {options.length === 1 && activeOption && (
            <div className="mb-1">
              <span className={`${MONO} px-1 py-0.5 rounded border text-[9px] ${PILL_BASE[activeOption.type]}`}>
                {activeOption.label}
              </span>
            </div>
          )}

          {activeOption && (
            <>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {activeOption.answer}
              </p>
              {activeOption.documentationId && (
                <div className="mt-1.5 pt-1.5 border-t border-border flex items-center gap-1 min-w-0">
                  <BookOpen className="w-3 h-3 text-sky-500 flex-shrink-0" />
                  {activeOption.references && activeOption.references.length > 1 ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewKBSources(activeOption); }}
                      className="text-[10px] text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 truncate"
                    >
                      {activeOption.documentTitle?.replace(/^Q:\s*/i, '').replace(/<[^>]+>/g, '').trim().slice(0, 80) ?? 'View sources'}
                    </button>
                  ) : (
                    <Link
                      to={`/knowledge-base?docId=${activeOption.documentationId}#documentation`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 truncate"
                    >
                      {activeOption.documentTitle
                        ? activeOption.documentTitle.replace(/^Q:\s*/i, '').replace(/<[^>]+>/g, '').trim().slice(0, 80)
                        : 'View in Knowledge Base'}
                    </Link>
                  )}
                </div>
              )}
              {activeOption.messageId && activeOption.messageId > 0 && !activeOption.documentationId && (
                <div className="mt-1.5 pt-1.5 border-t border-border flex items-center gap-1">
                  <MessageSquare className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  {activeOption.content ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewOriginal(activeOption); }}
                      className="text-[10px] text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                    >
                      View original message
                    </button>
                  ) : (
                    <Link
                      to={`/messages/${activeOption.messageId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                    >
                      View original message
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {section !== 'suggested' && !!(analysis ?? spamCheck) && (
        <div className="grid grid-cols-3 gap-1.5">
          {spamCheck && (
            <div className="rounded border border-border p-1.5">
              <p className={`${MONO} text-muted-foreground mb-0.5`}>CLASS</p>
              <p className="text-[11px] font-medium truncate">
                {spamCheck.isSpam === false ? 'Legit' : spamCheck.isSpam === true ? 'Spam' : 'Unknown'}
              </p>
            </div>
          )}
          {analysis?.suggestedCategory && (
            <div className="rounded border border-border p-1.5">
              <p className={`${MONO} text-muted-foreground mb-0.5`}>CATEGORY</p>
              <p className="text-[11px] font-medium truncate">{analysis.suggestedCategory}</p>
            </div>
          )}
          {analysis?.confidence !== undefined && (
            <div className="rounded border border-border p-1.5">
              <p className={`${MONO} text-muted-foreground mb-0.5`}>CONFIDENCE</p>
              <p className="text-[11px] font-medium">{Math.round(analysis.confidence * 100)}%</p>
            </div>
          )}
          {analysis?.isTicketWorthy !== undefined && (
            <div className="rounded border border-border p-1.5">
              <p className={`${MONO} text-muted-foreground mb-0.5`}>TICKET</p>
              <p className="text-[11px] font-medium">{analysis.isTicketWorthy ? 'Worthy' : 'No'}</p>
            </div>
          )}
          {analysis?.needsMoreInfo !== undefined && (
            <div className="rounded border border-border p-1.5">
              <p className={`${MONO} text-muted-foreground mb-0.5`}>INFO</p>
              <p className="text-[11px] font-medium">{analysis.needsMoreInfo ? 'Needs more' : 'Complete'}</p>
            </div>
          )}
          {analysis?.suggestedPriority && (
            <div className="rounded border border-border p-1.5">
              <p className={`${MONO} text-muted-foreground mb-0.5`}>PRIORITY</p>
              <p className="text-[11px] font-medium capitalize">{analysis.suggestedPriority}</p>
            </div>
          )}
        </div>
      )}

      {section !== 'suggested' && analysis?.summary && (
        <div className="p-1.5 rounded border border-border">
          <p className={`mb-0.5 ${MONO} text-muted-foreground`}>SUMMARY</p>
          <p className="text-[11px] leading-snug">{analysis.summary}</p>
        </div>
      )}

      {section !== 'suggested' && spamCheck?.reason && (
        <div className="p-1.5 rounded border border-border">
          <p className={`mb-0.5 ${MONO} text-muted-foreground`}>REASON</p>
          <p className="text-[11px] leading-snug text-muted-foreground">{spamCheck.reason}</p>
        </div>
      )}

      {section !== 'suggested' && spamCheck?.redFlags && spamCheck.redFlags.length > 0 && (
        <div className="p-2 rounded border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/10">
          <p className={`mb-1 text-red-500 ${MONO}`}>RED FLAGS</p>
          {spamCheck.redFlags.map((f: string) => (
            <p key={f} className="text-[11px] text-red-600 dark:text-red-400">• {f}</p>
          ))}
        </div>
      )}

      {section !== 'suggested' && spamCheck?.greenFlags && spamCheck.greenFlags.length > 0 && (
        <div className="p-2 rounded border border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/10">
          <p className={`mb-1 text-green-600 ${MONO}`}>GREEN FLAGS</p>
          {spamCheck.greenFlags.map((f: string) => (
            <p key={f} className="text-[11px] text-green-700 dark:text-green-400">• {f}</p>
          ))}
        </div>
      )}

      {viewKBSources?.references && (
        <SimilarMessagesDialog
          messageId={message.id}
          open
          onClose={() => setViewKBSources(null)}
          onSelectAnswer={(answer) => { onGhostClick(answer); setViewKBSources(null); }}
          preloadedSources={viewKBSources.references.filter(isKBReference).map((ref) => ({
            content: '',
            directReply: viewKBSources.answer,
            similarity: ref.similarity,
            source: 'documentation' as const,
            documentTitle: ref.documentTitle,
          }))}
          preloadedTitle="Knowledge Base Sources"
        />
      )}

      {viewOriginal && (
        <SimilarMessagesDialog
          messageId={message.id}
          open
          onClose={() => setViewOriginal(null)}
          onSelectAnswer={(answer) => { onGhostClick(answer); setViewOriginal(null); }}
          preloadedSources={[{
            messageId: viewOriginal.messageId,
            content: viewOriginal.content ?? '',
            subject: viewOriginal.subject,
            sender: viewOriginal.sender,
            directReply: viewOriginal.answer,
            similarity: parseFloat(viewOriginal.sublabel ?? '0') / 100,
            source: 'message' as const,
          }]}
          preloadedTitle={viewOriginal.subject ?? 'Original Message'}
        />
      )}
    </div>
  );
}
