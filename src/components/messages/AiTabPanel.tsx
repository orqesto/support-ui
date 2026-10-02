import { useState, useEffect } from 'react';
import { BookOpen, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Message } from '@/types';
import { getSpamCheck, humanizeSignalFlag, spamClassLabel } from '@/lib/messageHelpers';
import { SIMILAR_RESULTS_LIMIT, SIMILAR_RESULTS_MIN_SIMILARITY } from '@/lib/constants';
import { messageService } from '@/services/message.service';
import { AnswerPreview } from './AnswerPreview';
import { SimilarMessagesDialog } from '@/components/modals/SimilarMessagesDialog';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { useAiConfigured } from '@/hooks/useAiConfigured';
import { useAiDraftsOff } from '@/hooks/useAiDraftsOff';
import { logger } from '@/lib/logger';
import { languageName as languageNameOf } from '@/lib/languageName';
import { stripGreetingName } from '@/lib/depersonalise';
import { priorityLabel } from './messageDetailConstants';

type Analysis = {
  isTicketWorthy?: boolean;
  needsMoreInfo?: boolean;
  suggestedCategory?: string;
  suggestedPriority?: string;
  confidence?: number;
  summary?: string;
};

type KBSourceRef = {
  type: string;
  id: number;
  title?: string;
  similarity: number;
  parentDocId?: number;
};

export type KBAttachment = {
  id: number;
  filename: string;
  originalFilename: string;
  url: string;
  mimeType: string;
};

type SuggestedAnswer = {
  answer: string;
  confidence?: number;
  source?:
    | 'documentation'
    | 'similar_ticket'
    | 'similar_message'
    | 'lead_qualification'
    | 'lead_qualification_kb';
  similarMessageId?: number;
  referencedChunks?: number[];
  documentationId?: number;
  kbSources?: KBSourceRef[];
};

type AutoReply = { sent?: boolean };

type KBReference = { documentationId: number; documentTitle: string; similarity: number };

type ChunkReference = { chunkId: number; chunkIndex: number; metadata: unknown };
const isKBReference = (ref: KBReference | ChunkReference): ref is KBReference =>
  'documentationId' in ref;

export type SimilarResult = {
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
  attachments?: KBAttachment[];
};

/**
 * The bare address from a `Name <addr@host>` sender string, for attributing a past reply
 * to the person it was written to. Falls back to the raw value rather than hiding it —
 * an unattributed past reply is exactly what this change exists to prevent.
 */
const senderAddress = (sender?: string): string => {
  if (!sender) return 'unknown recipient';
  return sender.match(/<([^>]+)>/)?.[1] ?? sender.trim();
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
  kbSources?: KBSourceRef[];
  similarity?: number;
  attachments?: KBAttachment[];
};

type Props = {
  message: Message;
  /**
   * Puts an answer into the reply. Absent where there is no composer (a closed, filtered or
   * suspicious thread): the suggestions and their sources still show, without the insert controls.
   */
  onGhostClick?: (answer: string, source: string, attachments?: KBAttachment[]) => void;
  onOptionSelect?: (answer: string, label: string, type: ReplyOption['type']) => void;
  onOptionsLoaded?: (total: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  /** 'suggested' = reply block only; 'analysis' = stats/flags only; default = both */
  section?: 'suggested' | 'analysis';
};

// Session-scoped cache: survives remount (inbox → full page nav) but cleared on refresh.
// Exposed via accessor functions only — callers must not mutate the Map directly.
const _similarResultsCache = new Map<number, SimilarResult[]>();
const similarResultsInFlight = new Map<number, Promise<SimilarResult[]>>();

export const similarResultsCache = {
  has: (id: number) => _similarResultsCache.has(id),
  get: (id: number) => _similarResultsCache.get(id),
  set: (id: number, data: SimilarResult[]) => {
    _similarResultsCache.set(id, data);
  },
  delete: (id: number) => {
    _similarResultsCache.delete(id);
  },
  clear: () => {
    _similarResultsCache.clear();
  },
};

/** v4 `.k-sum-card`: the Summary and Reason cards. */
const SUM_CARD = 'rounded-[9px] border border-border bg-card px-3 py-2.5';
/** v4's small ghost label, in sentence case rather than the shouting uppercase LABEL. */
const GHOST_LABEL = 'text-[11px] font-medium text-faint-foreground';

/** v4 `.k-pill`: a 6px-radius source chip, the label in the display face and the rest plain. */
const PILL =
  'inline-flex items-center gap-1 h-auto rounded-[6px] border px-2 py-[3px] font-sans text-[11px] font-normal whitespace-nowrap transition-colors';

const PILL_BASE: Record<ReplyOption['type'], string> = {
  lead: 'text-ai border-ai-line bg-ai-muted hover:bg-ai-muted hover:text-ai',
  documentation:
    'text-primary border-primary-line bg-primary-muted hover:bg-primary-muted hover:text-primary',
  similar:
    'text-warning border-warning-line bg-warning-muted hover:bg-warning-muted hover:text-warning',
};

/** v4 `.k-pill.on`: the selected source gets a 1.5px border in its own colour. */
const PILL_ACTIVE: Record<ReplyOption['type'], string> = {
  lead: `${PILL_BASE.lead} border-[1.5px] border-current`,
  documentation: `${PILL_BASE.documentation} border-[1.5px] border-current`,
  similar: `${PILL_BASE.similar} border-[1.5px] border-current`,
};

/** "AI 87%", "PAST REPLY 82% → j@x.net": staging's label and sublabel, v4's two weights. */
const PillText = ({ option }: { option: Pick<ReplyOption, 'label' | 'sublabel'> }) => (
  <>
    <b className="font-display text-[10px] font-semibold tracking-[0.08em]">{option.label}</b>
    {/* The space is in the text, not only the gap: it is what a screen reader and a copy hear. */}
    {option.sublabel && <span>{` ${option.sublabel}`}</span>}
  </>
);

export function AiTabPanel({
  message,
  onGhostClick,
  onOptionSelect,
  onOptionsLoaded,
  onLoadingChange,
  section,
}: Props) {
  const spamCheck = getSpamCheck(message);
  const analysis = message.metadata?.analysis as Analysis | undefined;
  const languageName = languageNameOf(message.detectedLanguage);
  const { off: aiDraftsOff, resolved: aiDraftsKnown } = useAiDraftsOff();
  /*
    A reply a model wrote BEFORE drafts were switched off is still stored on the message, and the
    backend cannot refuse it — it is already here. So it is offered only once the setting is KNOWN
    to be on; with drafts off the agent gets the past replies and KB matches, which people wrote.
  */
  const storedSuggestion = message.metadata?.suggestedAnswer as SuggestedAnswer | undefined;
  const suggestedAnswer = aiDraftsKnown && !aiDraftsOff ? storedSuggestion : undefined;
  const autoReply = message.metadata?.autoReply as AutoReply | undefined;
  const { aiConfigured } = useAiConfigured();

  const [similarResults, setSimilarResults] = useState<SimilarResult[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(true);
  useEffect(() => {
    onLoadingChange?.(loadingSimilar);
  }, [loadingSimilar, onLoadingChange]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewOriginal, setViewOriginal] = useState<ReplyOption | null>(null);
  const [viewKBSources, setViewKBSources] = useState<ReplyOption | null>(null);
  const [viewLeadSources, setViewLeadSources] = useState<ReplyOption | null>(null);

  useEffect(() => {
    let cancelled = false;

    setSelectedId(null);
    setViewOriginal(null);
    setViewKBSources(null);
    setViewLeadSources(null);

    const applyResults = (data: SimilarResult[]) => {
      if (cancelled) return;
      // Deduplicate: remove entries that are already represented by the metadata suggestedAnswer
      // (same messageId or documentationId) to avoid showing the same suggestion twice.
      // Guard against undefined comparisons: only deduplicate when the suggestedAnswer
      // actually has a matching ID set — undefined !== undefined is false and would
      // incorrectly drop every documentation result when no pre-computed answer exists.
      const deduped = data.filter((result) => {
        if (
          suggestedAnswer?.similarMessageId !== null &&
          suggestedAnswer?.similarMessageId !== undefined &&
          result.messageId === suggestedAnswer.similarMessageId
        )
          return false;
        if (
          suggestedAnswer?.documentationId !== null &&
          suggestedAnswer?.documentationId !== undefined &&
          result.documentationId === suggestedAnswer.documentationId
        )
          return false;
        return true;
      });
      setSimilarResults(deduped);
      // The SAME condition the options list renders the AI answer on (below): once an auto-reply
      // was sent it is not offered, so it must not be counted — the KB tab badge and the ghost
      // bubble's "+N more" both read this number.
      const hasSuggested = !!suggestedAnswer?.answer && !autoReply?.sent;
      onOptionsLoaded?.((hasSuggested ? 1 : 0) + deduped.length);
      // Call directly so aiLoading clears even when loadingSimilar didn't change (cache hit path).
      onLoadingChange?.(false);
      // NO auto-suggest from a past reply.
      //
      // This used to drop `data[0].directReply` straight into the ghost bubble, labelled
      // "AI" like a generated draft. It is not generated: it is the verbatim reply sent to
      // whichever customer matched best, greeting and account claims included. A cold pitch
      // selling fake reviews was handed "Hello Joy, … your subscription has now been
      // cancelled" as its one-click answer — another customer's name, and a statement about
      // her account, one tap from being sent to a stranger.
      //
      // Past replies remain available below as options the agent picks deliberately, tagged
      // with the address they were written to. Only a genuinely generated answer
      // (`suggestedAnswer`, computed for THIS message) may pre-fill the composer.
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
          let inflight = similarResultsInFlight.get(message.id);
          if (!inflight) {
            inflight = messageService
              .getSimilarResolvedMessages(
                message.id,
                SIMILAR_RESULTS_LIMIT,
                SIMILAR_RESULTS_MIN_SIMILARITY
              )
              .then((res) => {
                const data = res.success && res.data ? res.data : [];
                similarResultsCache.set(message.id, data);
                return data;
              })
              .finally(() => {
                similarResultsInFlight.delete(message.id);
              });
            similarResultsInFlight.set(message.id, inflight);
          }
          const data = await inflight;
          applyResults(data);
        } catch (err) {
          logger.error('Failed to load similar results:', err);
        } finally {
          if (!cancelled) setLoadingSimilar(false);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
    // Keyed on the conversation alone, on purpose. This is a suppression rather than the
    // bare prose comment that used to sit here, because a comment does not stop the next
    // person "fixing" the warning by pasting the missing names in.
    //
    // It fetches similar-resolved matches for a conversation, so the conversation changing
    // is its only real trigger. Everything ESLint wants added makes it worse:
    //
    //  • `suggestedAnswer.*` is read off `message.metadata`, a fresh object identity on
    //    every message update. The effect opens by clearing `selectedId` and three viewer
    //    states, so re-running when the AI answer lands — seconds after open, the common
    //    case — wipes an option the agent had already selected while reading it. Not
    //    re-running costs at worst a duplicate row in a list.
    //  • `onOptionsLoaded` / `onLoadingChange` are parent callbacks. They ARE stable today
    //    (MessageDetail passes the useState setters, MessagePanelTabs memoises its
    //    wrapper), but declaring them would put this network call at the mercy of every
    //    future parent's render hygiene: one inline arrow upstream and it refetches on
    //    every render. Stability is worth having and NOT worth depending on.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the note above
  }, [message.id]);

  const options: ReplyOption[] = [];

  if (suggestedAnswer && !autoReply?.sent) {
    const isLead =
      suggestedAnswer.source === 'lead_qualification' ||
      suggestedAnswer.source === 'lead_qualification_kb';
    const isDocs = suggestedAnswer.source === 'documentation';
    const matchingResult = suggestedAnswer.similarMessageId
      ? similarResults.find((result) => result.messageId === suggestedAnswer.similarMessageId)
      : undefined;
    const leadKBDocSource = suggestedAnswer.kbSources?.find((src) => src.type === 'documentation');
    options.push({
      id: 'suggested',
      label: isLead ? 'LEAD' : isDocs ? 'DOCS' : 'AI',
      sublabel: suggestedAnswer.confidence
        ? `${Math.round(suggestedAnswer.confidence * 100)}%`
        : undefined,
      answer: suggestedAnswer.answer,
      type: isLead ? 'lead' : isDocs ? 'documentation' : 'similar',
      documentationId: isDocs
        ? (suggestedAnswer.referencedChunks?.[0] ?? suggestedAnswer.documentationId)
        : undefined,
      messageId: suggestedAnswer.similarMessageId,
      content: matchingResult?.content,
      subject: matchingResult?.subject,
      sender: matchingResult?.sender,
      kbSources:
        isLead && suggestedAnswer.kbSources?.length ? suggestedAnswer.kbSources : undefined,
      documentTitle: isLead ? leadKBDocSource?.title : undefined,
    });
  }

  similarResults.forEach((result, idx) => {
    const isPastReply = result.source !== 'documentation';
    options.push({
      id: `sim-${idx}`,
      // "MSG" said nothing about whose words these are. "PAST REPLY" plus the address it
      // was sent to makes reuse a decision rather than an accident.
      label: isPastReply ? 'PAST REPLY' : 'KB',
      sublabel: isPastReply
        ? `${Math.round(result.similarity * 100)}% → ${senderAddress(result.sender)}`
        : `${Math.round(result.similarity * 100)}%`,
      // De-personalised at the point it becomes insertable text, not at render, so the
      // preview an agent reads is the same text that reaches the composer.
      answer: isPastReply ? stripGreetingName(result.directReply) : result.directReply,
      type: result.source === 'documentation' ? 'documentation' : 'similar',
      documentationId: result.documentationId,
      documentTitle: result.documentTitle,
      messageId: result.messageId,
      content: result.content,
      subject: result.subject,
      sender: result.sender,
      references: result.references,
      similarity: result.similarity,
      attachments: result.attachments,
    });
  });

  const activeOption = options.find((opt) => opt.id === selectedId) ?? options[0];

  /** The analysis facets, in staging's order, each only when the backend sent it. */
  const facets: { label: string; value: string }[] = [
    ...(spamCheck ? [{ label: 'Class', value: spamClassLabel(spamCheck) }] : []),
    ...(analysis?.suggestedCategory
      ? [{ label: 'Category', value: analysis.suggestedCategory }]
      : []),
    ...(analysis?.confidence !== undefined
      ? [{ label: 'Confidence', value: `${Math.round(analysis.confidence * 100)}%` }]
      : []),
    ...(analysis?.isTicketWorthy !== undefined
      ? [{ label: 'Ticket', value: analysis.isTicketWorthy ? 'Worthy' : 'No' }]
      : []),
    ...(analysis?.needsMoreInfo !== undefined
      ? [{ label: 'Info', value: analysis.needsMoreInfo ? 'Needs more' : 'Complete' }]
      : []),
    // v3 "Language": the language stamped at ingestion (conversations.detected_language), shown
    // only when the backend sends it — never a guess from this client.
    ...(languageName ? [{ label: 'Language', value: languageName }] : []),
    ...(analysis?.suggestedPriority
      ? [{ label: 'Priority', value: priorityLabel(analysis.suggestedPriority) }]
      : []),
  ];

  return (
    <div className={section === 'analysis' ? 'space-y-2.5' : 'space-y-1.5'}>
      {!analysis && !spamCheck && options.length === 0 && !loadingSimilar && (
        <p className="text-[11px] text-muted-foreground text-center py-4">No AI analysis yet</p>
      )}

      {/* Outside the options box on purpose: with nothing matched that box does not render, and
          the agent would be left wondering where the suggested reply went. */}
      {section !== 'analysis' && aiDraftsOff && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          AI drafts are switched off for this workspace — suggested replies show past replies and
          knowledge-base matches only.
        </p>
      )}

      {/* Suggested reply with source switcher */}
      {section !== 'analysis' && (loadingSimilar || options.length > 0) && (
        // v4 `.k-sr`: header + "Use in reply", the source pills, the answer, the source line.
        <div className="grid gap-[9px] rounded-[10px] border border-border bg-card px-3 py-[11px]">
          <div className="flex items-center gap-2">
            <span className={`flex-1 ${GHOST_LABEL}`}>Suggested reply</span>
            {!loadingSimilar && activeOption && onGhostClick && (
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  onGhostClick(
                    activeOption.answer,
                    activeOption.type === 'lead'
                      ? 'lead_qualification'
                      : activeOption.type === 'similar'
                        ? 'message'
                        : 'documentation',
                    activeOption.attachments
                  )
                }
                className="h-7 px-[9px] rounded-[7px] font-sans text-[11.5px]"
              >
                Use in reply
              </Button>
            )}
          </div>

          {!aiConfigured && !aiDraftsOff && (
            <p className="text-[10.5px] leading-snug text-warning">
              Connect an AI provider in Settings to get suggested replies — showing similar messages
              instead.
            </p>
          )}

          {loadingSimilar && options.length === 0 && (
            <div className="flex items-center gap-1.5">
              <Spinner />
              <span className="text-[11px] text-muted-foreground">Loading…</span>
            </div>
          )}

          {options.length > 1 && (
            // Toggle buttons in a named group (staging's plain buttons + aria-pressed): tab roles
            // promised arrow-key movement and a tabpanel that this row does not have.
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggestion source">
              {options.map((opt) => {
                const isActive = opt.id === (activeOption?.id ?? options[0]?.id);
                return (
                  <Button
                    key={opt.id}
                    variant="ghost"
                    aria-pressed={isActive}
                    // The name is the pill's own words ("AI 87%", "Past reply 82% j@x.net"), said
                    // explicitly: the text sits inside <PillText>, where a name check cannot see it.
                    aria-label={opt.sublabel ? `${opt.label} ${opt.sublabel}` : opt.label}
                    onClick={() => {
                      setSelectedId(opt.id);
                      onOptionSelect?.(opt.answer, opt.label, opt.type);
                    }}
                    className={`${PILL} ${isActive ? PILL_ACTIVE[opt.type] : PILL_BASE[opt.type]}`}
                  >
                    <PillText option={opt} />
                  </Button>
                );
              })}
            </div>
          )}

          {options.length === 1 && activeOption && (
            <div className="flex">
              <span className={`${PILL} cursor-default ${PILL_BASE[activeOption.type]}`}>
                <PillText option={activeOption} />
              </span>
            </div>
          )}

          {activeOption && (
            <>
              <AnswerPreview
                answer={activeOption.answer}
                className="text-[13px] leading-[1.6] text-foreground"
              />
              {activeOption.documentationId && (
                <div className="pt-2 border-t border-hair flex items-center gap-1.5 text-[12px] min-w-0">
                  <BookOpen className="flex-shrink-0 w-3 h-3 text-muted-foreground" />
                  {activeOption.references && activeOption.references.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewKBSources(activeOption);
                      }}
                      className="inline-block p-0 h-auto text-[12px] text-primary hover:text-primary/80 truncate"
                    >
                      {activeOption.documentTitle
                        ?.replace(/^Q:\s*/i, '')
                        .replace(/<[^>]+>/g, '')
                        .trim()
                        .slice(0, 80) ?? 'View sources'}
                    </Button>
                  ) : (
                    <Link
                      to={`/knowledge-base?docId=${activeOption.documentationId}#documentation`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="text-[12px] text-primary hover:text-primary/80 truncate"
                    >
                      {activeOption.documentTitle
                        ? activeOption.documentTitle
                            .replace(/^Q:\s*/i, '')
                            .replace(/<[^>]+>/g, '')
                            .trim()
                            .slice(0, 80)
                        : 'View in Knowledge Base'}
                    </Link>
                  )}
                </div>
              )}
              {activeOption.kbSources &&
                activeOption.kbSources.length > 0 &&
                !activeOption.documentationId && (
                  <div className="pt-2 border-t border-hair flex items-center gap-1.5 text-[12px] min-w-0">
                    <BookOpen className="flex-shrink-0 w-3 h-3 text-ai" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewLeadSources(activeOption);
                      }}
                      className="inline-block p-0 h-auto text-[12px] text-ai hover:text-ai/80 truncate"
                    >
                      {activeOption.kbSources.length === 1
                        ? (activeOption.kbSources[0].title
                            ?.replace(/^Q:\s*/i, '')
                            .replace(/<[^>]+>/g, '')
                            .trim()
                            .slice(0, 80) ?? 'View source')
                        : `Combined from ${activeOption.kbSources.length} sources (${Math.round((activeOption.kbSources.reduce((sum, source) => sum + source.similarity, 0) / activeOption.kbSources.length) * 100)}%)`}
                    </Button>
                  </div>
                )}
              {activeOption.messageId &&
                activeOption.messageId > 0 &&
                !activeOption.documentationId &&
                !activeOption.kbSources && (
                  <div className="pt-2 border-t border-hair flex items-center gap-1.5 text-[12px]">
                    <MessageSquare className="flex-shrink-0 w-3 h-3 text-warning" />
                    {activeOption.content ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewOriginal(activeOption);
                        }}
                        className="p-0 h-auto text-[12px] text-warning hover:text-warning"
                      >
                        View original message
                      </Button>
                    ) : (
                      <Link
                        to={`/messages/${activeOption.messageId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-[12px] text-warning hover:text-warning"
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

      {/* v4: a past reply was written to ANOTHER customer — said beside the card, every time it is
          the one selected. The address on its pill says to whom; this says what to check. */}
      {section !== 'analysis' &&
        !loadingSimilar &&
        activeOption?.id.startsWith('sim-') &&
        activeOption.type === 'similar' && (
          <p
            className="text-[10.5px] leading-[1.45] text-faint-foreground"
            data-testid="past-reply-hint"
          >
            {/* Always true: the greeting strip misses many shapes ("Thanks Marta", "Dear Mr. Smith"). */}
            A reply sent to another customer. Check it for their name or account details before you
            use it.
          </p>
        )}

      {/* v4 AI tab: Summary first (what the agent reads first), then the facets, then the Reason,
          then the flags. Every field staging showed is kept; only the order and the look change. */}
      {section !== 'suggested' && analysis?.summary && (
        <div className={SUM_CARD} data-testid="ai-summary">
          <span className={GHOST_LABEL}>Summary</span>
          <p className="mt-[5px] text-[13px] leading-[1.55]">{analysis.summary}</p>
        </div>
      )}

      {section !== 'suggested' && facets.length > 0 && (
        // Two columns in a narrow panel, three once it is wide enough for three 130px facets —
        // v4's `@container (min-width:430px)`, without a container-query plugin.
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-[7px]"
          data-testid="ai-facets"
        >
          {facets.map((facet) => (
            <div
              key={facet.label}
              className="min-w-0 rounded-lg border border-border bg-card px-2.5 py-[7px]"
            >
              <span className={`block mb-[3px] ${GHOST_LABEL}`}>{facet.label}</span>
              <b className="block truncate text-[13px] font-semibold text-foreground">
                {facet.value}
              </b>
            </div>
          ))}
        </div>
      )}

      {section !== 'suggested' && spamCheck?.reason && (
        <div className={SUM_CARD}>
          <span className={GHOST_LABEL}>Reason</span>
          <p className="mt-[5px] text-[12.5px] leading-[1.55] text-muted-foreground">
            {spamCheck.reason}
          </p>
        </div>
      )}

      {section !== 'suggested' && spamCheck?.redFlags && spamCheck.redFlags.length > 0 && (
        <div className="rounded-[9px] border border-destructive-line bg-destructive-muted px-3 py-[9px] text-destructive">
          <span className="text-[11px] font-medium">Red flags</span>
          <ul className="mt-[5px] pl-4 list-disc text-[12.5px] leading-[1.55]">
            {spamCheck.redFlags.map((flag: string) => (
              <li key={flag}>{humanizeSignalFlag(flag)}</li>
            ))}
          </ul>
        </div>
      )}

      {section !== 'suggested' && spamCheck?.greenFlags && spamCheck.greenFlags.length > 0 && (
        <div className="rounded-[9px] border border-success-line bg-success-muted px-3 py-[9px] text-success">
          <span className="text-[11px] font-medium">Green flags</span>
          <ul className="mt-[5px] pl-4 list-disc text-[12.5px] leading-[1.55]">
            {spamCheck.greenFlags.map((flag: string) => (
              <li key={flag}>{humanizeSignalFlag(flag)}</li>
            ))}
          </ul>
        </div>
      )}

      {viewKBSources?.references && (
        <SimilarMessagesDialog
          messageId={message.id}
          open
          onClose={() => setViewKBSources(null)}
          onSelectAnswer={
            onGhostClick
              ? (answer) => {
                  onGhostClick(answer, 'documentation');
                  setViewKBSources(null);
                }
              : undefined
          }
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

      {viewLeadSources?.kbSources && viewLeadSources.kbSources.length > 0 && (
        <SimilarMessagesDialog
          messageId={message.id}
          open
          onClose={() => setViewLeadSources(null)}
          onSelectAnswer={
            onGhostClick
              ? (answer) => {
                  onGhostClick(answer, 'lead_qualification');
                  setViewLeadSources(null);
                }
              : undefined
          }
          preloadedSources={viewLeadSources.kbSources
            .filter((src) => src.type === 'documentation')
            .map((src) => ({
              content: '',
              directReply: viewLeadSources.answer,
              similarity: src.similarity,
              source: 'documentation' as const,
              documentTitle: src.title,
              documentationId: src.parentDocId ?? src.id,
            }))}
          preloadedTitle="Lead KB Sources"
        />
      )}

      {viewOriginal && (
        <SimilarMessagesDialog
          messageId={message.id}
          open
          onClose={() => setViewOriginal(null)}
          onSelectAnswer={
            onGhostClick
              ? (answer) => {
                  onGhostClick(answer, 'message');
                  setViewOriginal(null);
                }
              : undefined
          }
          preloadedSources={[
            {
              messageId: viewOriginal.messageId,
              content: viewOriginal.content ?? '',
              subject: viewOriginal.subject,
              sender: viewOriginal.sender,
              directReply: viewOriginal.answer,
              similarity: viewOriginal.similarity ?? 0,
              source: 'message' as const,
            },
          ]}
          preloadedTitle={viewOriginal.subject ?? 'Original Message'}
        />
      )}
    </div>
  );
}
