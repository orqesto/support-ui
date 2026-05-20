import { useState, useEffect, useRef } from 'react';
import { Search, Copy, CheckCircle, ExternalLink, ChevronDown, ChevronRight, BookOpen, MessageSquare } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { stripHtml } from '@/lib/stripHtml';
import { ticketService } from '@/services/ticket.service';
import { messageService } from '@/services/message.service';
import { SIMILAR_RESULTS_LIMIT, SIMILAR_RESULTS_MIN_SIMILARITY } from '@/lib/constants';

type SimilarTicket = {
  ticketId: number;
  messageId: number;
  documentationId?: number;
  messageContent: string;
  messageSubject: string | null;
  similarity: number;
  ticketStatus: string;
  ticketTitle: string;
  responses: Array<{
    id: number;
    content: string;
    channel: string;
    sentAt: string | null;
  }>;
  references?: Array<{
    documentationId: number;
    documentTitle: string;
    similarity: number;
  }>;
};

type SimilarTicketsProps = {
  messageId: number;
  onUseResponse?: (content: string) => void;
  defaultExpanded?: boolean;
};

export const SimilarTickets = ({ messageId, onUseResponse, defaultExpanded = false }: SimilarTicketsProps) => {
  const [similarTickets, setSimilarTickets] = useState<SimilarTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchSimilarTickets = async () => {
      try {
        setLoading(true);
        const [ticketsResponse, messagesResponse] = await Promise.allSettled([
          ticketService.getSimilar(messageId, { limit: SIMILAR_RESULTS_LIMIT, minSimilarity: SIMILAR_RESULTS_MIN_SIMILARITY }),
          messageService.getSimilarResolvedMessages(messageId, SIMILAR_RESULTS_LIMIT, SIMILAR_RESULTS_MIN_SIMILARITY),
        ]);

        if (cancelled) return;

        const tickets =
          ticketsResponse.status === 'fulfilled' ? (ticketsResponse.value.data ?? []) : [];
        const messages =
          messagesResponse.status === 'fulfilled' ? (messagesResponse.value.data ?? []) : [];

        const mappedMessages: SimilarTicket[] = messages.map((msgItem: unknown, idx: number) => {
          const msgData = msgItem as {
            messageId?: number;
            documentationId?: number;
            source?: string;
            content: string;
            subject?: string | null;
            documentTitle?: string;
            directReply: string;
            similarity: number;
            repliedAt?: string | null;
            references?: Array<{
              documentationId: number;
              documentTitle: string;
              similarity: number;
            }>;
          };

          const effectiveMessageId = msgData.messageId ?? -(msgData.documentationId ?? idx + 1000);
          const isKBItem = msgData.source === 'documentation' || (!msgData.messageId && msgData.documentationId);

          return {
            ticketId: 0,
            messageId: effectiveMessageId,
            documentationId: msgData.documentationId,
            messageContent: msgData.content,
            messageSubject: msgData.subject ?? null,
            similarity: msgData.similarity,
            ticketStatus: 'resolved',
            ticketTitle: isKBItem
              ? (msgData.documentTitle ?? 'Knowledge Base')
              : (msgData.subject ?? 'Direct Reply'),
            responses: [
              {
                id: effectiveMessageId,
                content: msgData.directReply,
                channel: isKBItem ? 'kb' : 'email',
                sentAt: msgData.repliedAt ?? null,
              },
            ],
            references: msgData.references,
          };
        });

        const messageIdSet = new Set<number>();
        const deduplicated: SimilarTicket[] = [];

        for (const ticket of tickets) {
          if (!messageIdSet.has(ticket.messageId)) {
            messageIdSet.add(ticket.messageId);
            deduplicated.push(ticket);
          }
        }

        for (const message of mappedMessages) {
          if (!messageIdSet.has(message.messageId)) {
            messageIdSet.add(message.messageId);
            deduplicated.push(message);
          }
        }

        if (!cancelled) setSimilarTickets(deduplicated);
      } catch {
        if (!cancelled) setSimilarTickets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchSimilarTickets();
    return () => { cancelled = true; };
  }, [messageId]);

  const handleCopyResponse = (content: string, responseId: number) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopiedId(responseId);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => { setCopiedId(null); copyTimerRef.current = null; }, 2000);
  };

  const handleUseResponse = (content: string) => {
    if (onUseResponse) {
      onUseResponse(content);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 dark:bg-slate-900/20 dark:border-slate-700/50">
        <div className="flex gap-2 items-center">
          <Spinner className="text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Searching similar resolved issues…
          </span>
        </div>
      </div>
    );
  }

  if (similarTickets.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 overflow-hidden">
      <button
        className="flex gap-2 items-center p-4 w-full text-left bg-slate-50 hover:bg-slate-100/70 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="p-1.5 rounded-md bg-slate-200/70 dark:bg-slate-700/50">
          <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Similar Resolved Issues
          </span>
          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
            {similarTickets.length} found
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-2 bg-white dark:bg-transparent border-t border-slate-100 dark:border-slate-700/40">
          {similarTickets.map((ticket) => (
            <div
              key={
                ticket.documentationId ? `doc-${ticket.documentationId}` : `msg-${ticket.messageId}`
              }
              className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 dark:bg-slate-900/20 dark:border-slate-700/40"
            >
              {/* Title row */}
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="flex-1 min-w-0 flex items-start gap-1.5">
                  {ticket.documentationId ? (
                    <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  )}
                  {ticket.ticketId > 0 ? (
                    <Link
                      to={`/tickets/${ticket.ticketId}`}
                      className="flex gap-1 items-center group min-w-0"
                    >
                      <span className="text-sm font-medium truncate text-slate-800 dark:text-slate-100 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        {ticket.ticketTitle}
                      </span>
                      <ExternalLink className="flex-shrink-0 w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ) : ticket.documentationId ? (
                    <Link
                      to={`/knowledge-base?id=${ticket.documentationId}`}
                      className="flex gap-1 items-center group min-w-0"
                    >
                      <span className="text-sm font-medium truncate text-slate-800 dark:text-slate-100 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        {ticket.ticketTitle}
                      </span>
                      <ExternalLink className="flex-shrink-0 w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ) : ticket.messageId > 0 ? (
                    <Link
                      to={`/messages/${ticket.messageId}`}
                      className="flex gap-1 items-center group min-w-0"
                    >
                      <span className="text-sm font-medium truncate text-slate-800 dark:text-slate-100 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        {ticket.ticketTitle}
                      </span>
                      <ExternalLink className="flex-shrink-0 w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ) : (
                    <span className="text-sm font-medium truncate text-slate-800 dark:text-slate-100">
                      {ticket.ticketTitle}
                    </span>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className="shrink-0 text-xs font-medium text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600"
                >
                  {Math.round(ticket.similarity * 100)}% match
                </Badge>
              </div>

              {/* Original message snippet */}
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2 pl-5">
                {ticket.messageSubject ?? ticket.messageContent}
              </p>

              {/* KB references */}
              {ticket.references && ticket.references.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2 pl-5">
                  {ticket.references.map((ref) => (
                    <Link key={ref.documentationId} to={`/knowledge-base?id=${ref.documentationId}`}>
                      <Badge
                        variant="secondary"
                        className="text-xs text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900"
                      >
                        {ref.documentTitle} · {Math.round(ref.similarity * 100)}%
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}

              {/* Responses */}
              {ticket.responses.length > 0 && (
                <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-700/40 space-y-2">
                  {ticket.responses.map((response) => (
                    <div key={response.id}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                          Successful response
                          {response.sentAt && (
                            <span className="font-normal text-muted-foreground ml-1">
                              · {formatDate(new Date(response.sentAt))}
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-3 whitespace-pre-wrap mb-2">
                        {stripHtml(response.content)}
                      </p>
                      <div className="flex gap-2">
                        {onUseResponse && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUseResponse(response.content)}
                            className="text-xs h-7 border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800/50"
                          >
                            Use This Response
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopyResponse(response.content, response.id)}
                          className="text-xs h-7 text-muted-foreground hover:text-foreground"
                        >
                          {copiedId === response.id ? (
                            <>
                              <CheckCircle className="mr-1 w-3 h-3 text-green-500" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1 w-3 h-3" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
