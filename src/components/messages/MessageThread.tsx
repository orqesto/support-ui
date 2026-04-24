import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  User,
  Mail,
  Brain,
  AlertCircle,
  ArrowDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LinkifiedText } from '@/lib/linkify';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';

type MessageThreadProps = {
  messageId: number;
  currentThreadId?: string | null;
  onMessageClick?: (messageId: number) => void;
  onHasReplyChange?: (hasReply: boolean) => void;
  refreshKey?: number;
};

type AIAnalysis = {
  isTicketWorthy?: boolean;
  confidence?: number;
  needsMoreInfo?: boolean;
  suggestedCategory?: string;
  suggestedPriority?: string;
  summary?: string;
  analysisProvider?: string;
  analysisModel?: string;
};

type SpamCheck = {
  isSpam?: boolean;
  category?: string;
  confidence?: number;
  reason?: string;
};

type ConversationPair = {
  customerEmail: Message;
  systemReplies: Message[];
};

const renderAIAnalysis = (msg: Message) => {
  if (!msg.metadata) {
    return null;
  }

  const analysis = msg.metadata.analysis as AIAnalysis | undefined;
  const spamCheck = msg.metadata.spamCheck as SpamCheck | undefined;

  if (!analysis && !spamCheck) {
    return null;
  }

  return (
    <div className="pt-2 mt-3 space-y-2 border-t">
      {/* AI Analysis */}
      {analysis && (
        <div className="p-2 text-xs bg-blue-50 rounded border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <div className="flex items-center gap-1.5 mb-1">
            <Brain className="w-3 h-3 text-blue-600" />
            <span className="font-semibold text-blue-900 dark:text-blue-100">AI Analysis</span>
            {analysis.confidence && (
              <span className="text-blue-600 dark:text-blue-400 text-[10px]">
                {Math.round(analysis.confidence * 100)}% confident
              </span>
            )}
          </div>
          {analysis.summary && (
            <p className="text-blue-800 dark:text-blue-200 mb-1.5">{analysis.summary}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {analysis.isTicketWorthy !== undefined && (
              <Badge
                variant={analysis.isTicketWorthy ? 'default' : 'secondary'}
                className="text-[10px] py-0"
              >
                {analysis.isTicketWorthy ? '✓ Ticket worthy' : '✗ Not ticket worthy'}
              </Badge>
            )}
            {analysis.needsMoreInfo && (
              <Badge variant="warning" className="text-[10px] py-0">
                Needs info
              </Badge>
            )}
            {analysis.suggestedPriority && (
              <Badge variant="secondary" className="text-[10px] py-0">
                {analysis.suggestedPriority}
              </Badge>
            )}
            {analysis.suggestedCategory && (
              <Badge variant="secondary" className="text-[10px] py-0">
                {analysis.suggestedCategory}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Spam Warning */}
      {spamCheck?.isSpam && (
        <div className="p-2 text-xs bg-red-50 rounded border border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="w-3 h-3 text-red-600" />
            <span className="font-semibold text-red-900 dark:text-red-100">Spam Detected</span>
          </div>
          {spamCheck.reason && (
            <p className="text-red-800 dark:text-red-200 text-[10px]">{spamCheck.reason}</p>
          )}
        </div>
      )}
    </div>
  );
};

export const MessageThread = ({
  messageId,
  currentThreadId,
  onMessageClick,
  onHasReplyChange,
  refreshKey,
}: MessageThreadProps) => {
  const [conversationPairs, setConversationPairs] = useState<ConversationPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true); // Auto-expand by default
  const [error, setError] = useState<string | null>(null);
  const onHasReplyChangeRef = useRef(onHasReplyChange);
  onHasReplyChangeRef.current = onHasReplyChange;

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const fetchThread = async () => {
      setLoading(true);
      setError(null);
      try {
        // Always attempt to fetch thread messages
        const response = await messageService.getThreadMessages(messageId);
        const allMessages = response.data ?? [];

        // Sort by actual message time.
        // Priority: repliedAt (outgoing send time) > metadata.receivedAt (incoming email header) > createdAt (DB insert, may be batch-constant)
        const msgTime = (m: Message) =>
          new Date(
            m.repliedAt ??
            (m.metadata as { receivedAt?: string } | null)?.receivedAt ??
            m.createdAt
          ).getTime();
        allMessages.sort((a, b) => msgTime(a) - msgTime(b));

        // Separate customer emails from system replies
        const systemEmails: Message[] = [];
        const customerEmails: Message[] = [];

        allMessages.forEach((msg: Message) => {
          // Check if this is a system reply using authoritative BE fields.
          // isOutgoing is set by the BE for every sent message; isSystemReply is set in
          // metadata for bot/AI replies. These two fields are the source of truth.
          // The old isFromSupport heuristic (sender contains "support" or equals "me") is
          // removed: it misclassifies incoming messages from customers whose address happens
          // to contain the word "support", causing them to disappear from the thread view.
          const isSystemReply = msg.metadata?.isSystemReply === true;
          const isOutgoingMessage = msg.isOutgoing === true;
          const isBotSender = msg.sender.toLowerCase() === 'bot';

          // System messages: outgoing OR bot sender OR explicit system replies
          // NOTE: Don't check directReply - that field is on CUSTOMER messages containing bot's response
          if (isOutgoingMessage || isBotSender || isSystemReply) {
            systemEmails.push(msg);
          } else {
            customerEmails.push(msg);
          }
        });

        // Create conversation pairs — each customer message gets the system replies that
        // belong to it. Priority: parentMessageId link (authoritative DB relation). Fall back
        // to timestamp window for replies that have no parentMessageId or whose parent is
        // not a customer message in this thread (e.g. older imported records).
        const pairs: ConversationPair[] = [];

        customerEmails.forEach((customerMsg, idx) => {
          const nextCustomerTime =
            idx + 1 < customerEmails.length ? msgTime(customerEmails[idx + 1]) : Infinity;

          const replies = systemEmails.filter((sysMsg) => {
            // If the reply has a parentMessageId pointing to a known customer message,
            // only attach it here if it points to THIS customer message.
            if (sysMsg.parentMessageId !== null && sysMsg.parentMessageId !== undefined) {
              return sysMsg.parentMessageId === customerMsg.id;
            }
            // No parentMessageId — fall back to timestamp window.
            // When nextCustomerTime === msgTime(customerMsg) (batch-imported messages with
            // identical timestamps), the window would collapse to zero and the reply would
            // match neither customer message. Add 1ms epsilon so the reply still attaches
            // to the earlier customer message in that degenerate case.
            const windowEnd = nextCustomerTime === msgTime(customerMsg)
              ? nextCustomerTime + 1
              : nextCustomerTime;
            return msgTime(sysMsg) > msgTime(customerMsg) && msgTime(sysMsg) < windowEnd;
          });

          pairs.push({ customerEmail: customerMsg, systemReplies: replies });
        });

        setConversationPairs(pairs);
        const currentPair = pairs.find((p) => p.customerEmail.id === messageId);
        onHasReplyChangeRef.current?.(!!(currentPair?.systemReplies.length));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    };

    void fetchThread();
  }, [messageId, currentThreadId, expanded, refreshKey]);

  const totalExchanges = conversationPairs.length;
  const hasThread = currentThreadId !== null && currentThreadId !== undefined;

  // Always show the thread section - even if API returns no related messages
  // This helps users understand the conversation context
  // Only hide if there was an error or we're still loading
  // if (!loading && conversationPairs.length === 0 && !hasThread && !error) {
  //   return null;
  // }

  return (
    <div className="pt-4 mt-6 border-t">
      {/* Header */}
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="justify-between p-2 w-full h-auto hover:bg-accent"
      >
        <div className="flex gap-2 items-center">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <MessageSquare className="w-4 h-4" />
          <span className="font-semibold">
            {hasThread || totalExchanges > 0 ? 'Conversation Thread' : 'Message Details'}
          </span>
          {totalExchanges > 0 && (
            <Badge variant="secondary" className="ml-1">
              {totalExchanges} {totalExchanges === 1 ? 'exchange' : 'exchanges'}
            </Badge>
          )}
        </div>
        {!expanded && totalExchanges > 0 && (
          <span className="text-xs text-muted-foreground">Click to view conversation</span>
        )}
      </Button>

      {/* Content */}
      {expanded && (
        <div className="mt-4">
          {loading && (
            <div className="py-8 text-sm text-center text-muted-foreground">
              <div className="mx-auto mb-2 w-6 h-6 rounded-full border-2 animate-spin border-primary border-t-transparent" />
              Loading conversation...
            </div>
          )}

          {error && (
            <div className="p-4 text-sm rounded-lg border text-destructive bg-destructive/10 border-destructive/20">
              {error}
            </div>
          )}

          {!loading && !error && conversationPairs.length === 0 && (
            <div className="py-8 text-sm text-center rounded-lg border border-dashed text-muted-foreground">
              {hasThread
                ? 'No conversation found in this thread'
                : 'No additional conversation data'}
            </div>
          )}

          {!loading && !error && conversationPairs.length > 0 && (
            <div className="space-y-6">
              {conversationPairs.map((pair, pairIndex) => {
                const isCurrentMessage = pair.customerEmail.id === messageId;
                const isFirstExchange = pairIndex === 0;

                return (
                  <div
                    key={pair.customerEmail.id}
                    role="button"
                    tabIndex={isCurrentMessage ? -1 : 0}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      isCurrentMessage
                        ? 'ring-2 ring-offset-2 ring-primary'
                        : 'cursor-pointer hover:shadow-md'
                    }`}
                    onClick={() => {
                      if (!isCurrentMessage && onMessageClick) {
                        onMessageClick(pair.customerEmail.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        !isCurrentMessage &&
                        onMessageClick &&
                        (e.key === 'Enter' || e.key === ' ')
                      ) {
                        e.preventDefault();
                        onMessageClick(pair.customerEmail.id);
                      }
                    }}
                  >
                    {/* Customer Email */}
                    <div className="p-4 bg-muted/30">
                      <div className="flex gap-4 justify-between items-start mb-2">
                        <div className="flex flex-1 gap-2 items-center">
                          <div className="flex justify-center items-center w-8 h-8 rounded-full bg-primary text-primary-foreground">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium">{pair.customerEmail.sender}</div>
                            {pair.customerEmail.subject && (
                              <div className="text-xs truncate text-muted-foreground">
                                {pair.customerEmail.subject}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <div className="text-xs whitespace-nowrap text-muted-foreground">
                            {formatDate(
                              new Date(
                                (pair.customerEmail.metadata as { receivedAt?: string })
                                  ?.receivedAt ?? pair.customerEmail.createdAt
                              )
                            )}
                          </div>
                          {isCurrentMessage && (
                            <Badge variant="default" className="text-xs">
                              Current
                            </Badge>
                          )}
                          {isFirstExchange && (
                            <Badge variant="secondary" className="text-xs">
                              First
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Customer Email Content */}
                      <div className="ml-10 text-sm whitespace-pre-wrap break-words">
                        <LinkifiedText>{pair.customerEmail.content}</LinkifiedText>
                      </div>

                      {/* AI Analysis for Customer Email */}
                      <div className="ml-10">{renderAIAnalysis(pair.customerEmail)}</div>

                      {/* Status Badges */}
                      <div className="flex gap-2 mt-3 ml-10">
                        {pair.customerEmail.processed && (
                          <Badge variant="success" className="text-xs">
                            Processed
                          </Badge>
                        )}
                        {pair.customerEmail.ticketId && (
                          <Badge variant="secondary" className="text-xs">
                            Ticket #{pair.customerEmail.ticketId}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* System Replies (all replies for this customer message) */}
                    {pair.systemReplies.map((reply) => (
                      <div key={reply.id}>
                        {/* Arrow indicating reply */}
                        <div className="flex justify-center py-1 bg-accent/20">
                          <ArrowDown className="w-4 h-4 text-muted-foreground" />
                        </div>

                        <div className="p-4 border-t bg-accent/10">
                          <div className="flex gap-4 justify-between items-start mb-2">
                            <div className="flex flex-1 gap-2 items-center">
                              <div className="flex justify-center items-center w-8 h-8 rounded-full bg-accent text-accent-foreground">
                                <Mail className="w-4 h-4" />
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium">Support Team</div>
                                <div className="text-xs text-muted-foreground">Reply</div>
                              </div>
                            </div>
                            <div className="text-xs whitespace-nowrap text-muted-foreground">
                              {formatDate(
                                new Date(
                                  reply.repliedAt ??
                                  (reply.metadata as { receivedAt?: string })?.receivedAt ??
                                  reply.createdAt
                                )
                              )}
                            </div>
                          </div>

                          {/* Reply Content */}
                          <div className="ml-10 text-sm whitespace-pre-wrap break-words text-foreground/80">
                            {(() => {
                              const html = reply.content;
                              const isHtml = /<[a-z][\s\S]*>/i.test(html);
                              return isHtml ? (
                                <div
                                  className="max-w-none prose prose-sm dark:prose-invert"
                                  dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(html, {
                                      ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code'],
                                      ALLOWED_ATTR: ['href', 'target', 'rel'],
                                    }),
                                  }}
                                />
                              ) : (
                                <LinkifiedText>{html}</LinkifiedText>
                              );
                            })()}
                          </div>

                          {/* Attachments */}
                          {(() => {
                            const names = (reply.metadata as { attachmentNames?: string[] } | null)?.attachmentNames;
                            return names && names.length > 0 ? (
                              <div className="mt-2 ml-10 flex flex-wrap gap-1">
                                {names.map((name) => (
                                  <span key={name} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground border">
                                    📎 {name}
                                  </span>
                                ))}
                              </div>
                            ) : null;
                          })()}

                          {/* Reply Status */}
                          {reply.isOutgoing && (
                            <div className="mt-2 ml-10">
                              <Badge variant="success" className="text-xs">
                                ✓ Sent
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* No Reply Yet */}
                    {pair.systemReplies.length === 0 && (
                      <div className="p-3 text-center bg-yellow-50 border-t dark:bg-yellow-900/10">
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">
                          ⏳ Awaiting support response
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
