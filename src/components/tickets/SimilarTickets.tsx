import { useState, useEffect } from 'react';
import { Lightbulb, Copy, CheckCircle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { ticketService } from '@/services/ticket.service';
import { messageService } from '@/services/message.service';

type SimilarTicket = {
  ticketId: number;
  messageId: number;
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
};

type SimilarTicketsProps = {
  messageId: number;
  onUseResponse?: (content: string) => void;
};

export const SimilarTickets = ({ messageId, onUseResponse }: SimilarTicketsProps) => {
  const [similarTickets, setSimilarTickets] = useState<SimilarTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    const fetchSimilarTickets = async () => {
      try {
        setLoading(true);
        // Try both endpoints: tickets and resolved messages
        const [ticketsResponse, messagesResponse] = await Promise.allSettled([
          ticketService.getSimilar(messageId, { limit: 3, minSimilarity: 0.7 }),
          messageService.getSimilarResolvedMessages(messageId, 3, 0.7),
        ]);

        const tickets =
          ticketsResponse.status === 'fulfilled' ? (ticketsResponse.value.data ?? []) : [];
        const messages =
          messagesResponse.status === 'fulfilled' ? (messagesResponse.value.data ?? []) : [];

        // Map resolved messages to ticket format
        const mappedMessages: SimilarTicket[] = messages.map((msg: unknown) => {
          const m = msg as {
            messageId?: number;
            content: string;
            subject?: string | null;
            directReply: string;
            similarity: number;
            repliedAt?: string | null;
          };
          return {
            ticketId: 0, // No ticket for direct replies
            messageId: m.messageId ?? 0,
            messageContent: m.content,
            messageSubject: m.subject ?? null,
            similarity: m.similarity,
            ticketStatus: 'resolved',
            ticketTitle: m.subject ?? 'Direct Reply',
            responses: [
              {
                id: 0,
                content: m.directReply,
                channel: 'email',
                sentAt: m.repliedAt ?? null,
              },
            ],
          };
        });

        // Combine and deduplicate results
        const allResults = [...tickets, ...mappedMessages];
        setSimilarTickets(allResults);
      } catch (error) {
        console.error('Failed to fetch similar tickets:', error);
        setSimilarTickets([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchSimilarTickets();
  }, [messageId]);

  const handleCopyResponse = (content: string, responseId: number) => {
    void navigator.clipboard.writeText(content);
    setCopiedId(responseId);
    void setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUseResponse = (content: string) => {
    if (onUseResponse) {
      onUseResponse(content);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-lg border bg-muted/30">
        <div className="flex gap-2 items-center mb-2">
          <Lightbulb className="w-4 h-4 text-yellow-600 animate-pulse dark:text-yellow-400" />
          <span className="text-sm font-medium">Finding similar tickets...</span>
        </div>
      </div>
    );
  }

  if (similarTickets.length === 0) {
    return null;
  }

  return (
    <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg border border-yellow-200 dark:from-yellow-950/20 dark:to-amber-950/20 dark:border-yellow-800">
      <div className="flex gap-2 items-center mb-3">
        <Lightbulb className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
        <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
          💡 Similar Resolved Tickets
        </h3>
        <Badge variant="secondary" className="ml-auto">
          {similarTickets.length} found
        </Badge>
      </div>

      <p className="mb-4 text-xs text-yellow-700 dark:text-yellow-300">
        These tickets had similar issues and were successfully resolved. You can use these responses
        as a starting point.
      </p>

      <div className="space-y-3">
        {similarTickets.map((ticket) => (
          <div
            key={ticket.ticketId}
            className="p-3 bg-white rounded-lg border border-yellow-200 dark:bg-gray-900 dark:border-yellow-800"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0">
                <Link to={`/tickets/${ticket.ticketId}`} className="flex gap-2 items-center group">
                  <h4 className="text-sm font-medium truncate transition-colors group-hover:text-primary">
                    {ticket.ticketTitle}
                  </h4>
                  <ExternalLink className="flex-shrink-0 w-3 h-3 opacity-0 transition-opacity text-muted-foreground group-hover:opacity-100" />
                </Link>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {ticket.messageSubject ?? ticket.messageContent}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="flex-shrink-0 ml-2 text-xs text-green-700 bg-green-100 dark:bg-green-900 dark:text-green-300"
              >
                {Math.round(ticket.similarity * 100)}% match
              </Badge>
            </div>

            {ticket.responses.length > 0 && (
              <div className="pt-3 mt-3 border-t border-yellow-100 dark:border-yellow-900">
                <p className="mb-2 text-xs font-medium text-yellow-800 dark:text-yellow-200">
                  Successful Response{ticket.responses.length > 1 ? 's' : ''}:
                </p>
                {ticket.responses.map((response) => (
                  <div
                    key={response.id}
                    className="p-2 mb-2 bg-gray-50 rounded last:mb-0 dark:bg-gray-800"
                  >
                    <div className="flex gap-2 justify-between items-start mb-2">
                      <Badge variant="secondary" className="text-xs border">
                        via {response.channel}
                      </Badge>
                      {response.sentAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(new Date(response.sentAt))}
                        </span>
                      )}
                    </div>
                    <p className="mb-2 text-sm whitespace-pre-wrap text-foreground line-clamp-3">
                      {response.content}
                    </p>
                    <div className="flex gap-2">
                      {onUseResponse && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUseResponse(response.content)}
                          className="text-xs"
                        >
                          Use This Response
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyResponse(response.content, response.id)}
                        className="text-xs"
                      >
                        {copiedId === response.id ? (
                          <>
                            <CheckCircle className="mr-1 w-3 h-3" />
                            Copied!
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
    </div>
  );
};
