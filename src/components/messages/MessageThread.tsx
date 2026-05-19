import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  User,
  Mail,
  ArrowDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LinkifiedText } from '@/lib/linkify';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';
import { MessageSignalBadges } from './MessageSignalBadges';

type MessageThreadProps = {
  messageId: number;
  currentThreadId?: string | null;
  onMessageClick?: (messageId: number) => void;
  onHasReplyChange?: (hasReply: boolean) => void;
  refreshKey?: number;
};

type ConversationPair = {
  customerEmail: Message;
  systemReplies: Message[];
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
  const [selectedPairId, setSelectedPairId] = useState<number | null>(null);
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
        const msgTime = (msg: Message) =>
          new Date(
            msg.repliedAt ??
            (msg.metadata as { receivedAt?: string } | null)?.receivedAt ??
            msg.createdAt
          ).getTime();
        allMessages.sort((itemA, itemB) => msgTime(itemA) - msgTime(itemB));

        // Pre-compute message times once to avoid O(n²) Date construction in the
        // attribution loop below.
        const timeCache = new Map<number, number>(
          allMessages.map((msg) => [msg.id, msgTime(msg)])
        );
        const cachedTime = (msg: Message) => timeCache.get(msg.id)!;

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

          // Skip sent_only_label stubs: Gmail phantom records with no real content that
          // were saved as outgoing placeholders during ingestion. They render as empty
          // "Support Team Reply" bubbles with no useful information.
          if ((msg.metadata as { skippedReason?: string } | null)?.skippedReason === 'sent_only_label') {
            return;
          }

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
            idx + 1 < customerEmails.length ? cachedTime(customerEmails[idx + 1]) : Infinity;

          const replies = systemEmails.filter((sysMsg) => {
            // If the reply has a parentMessageId pointing to a known customer message,
            // only attach it here if it points to THIS customer message.
            if (sysMsg.parentMessageId !== null && sysMsg.parentMessageId !== undefined) {
              return sysMsg.parentMessageId === customerMsg.id;
            }
            // No parentMessageId — fall back to timestamp window.
            // When nextCustomerTime === cachedTime(customerMsg) (batch-imported messages with
            // identical timestamps), the window would collapse to zero and the reply would
            // match neither customer message. Add 1ms epsilon so the reply still attaches
            // to the earlier customer message in that degenerate case.
            const windowEnd = nextCustomerTime === cachedTime(customerMsg)
              ? nextCustomerTime + 1
              : nextCustomerTime;
            return cachedTime(sysMsg) > cachedTime(customerMsg) && cachedTime(sysMsg) < windowEnd;
          });

          pairs.push({ customerEmail: customerMsg, systemReplies: replies });
        });

        setConversationPairs(pairs);
        const currentPair = pairs.find((pair) => pair.customerEmail.id === messageId);
        onHasReplyChangeRef.current?.(!!(currentPair?.systemReplies.length));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        setLoading(false);
      }
    };

    void fetchThread();
  }, [messageId, currentThreadId, expanded, refreshKey]);


  useEffect(() => { setSelectedPairId(null); }, [currentThreadId]);

  const totalExchanges = conversationPairs.length;
  const hasThread = currentThreadId !== null && currentThreadId !== undefined;
  const explicitIndex = selectedPairId !== null
    ? conversationPairs.findIndex((pair) => pair.customerEmail.id === selectedPairId)
    : -1;
  const effectiveCurrentIndex = explicitIndex >= 0 ? explicitIndex : conversationPairs.length - 1;

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
                const isCurrentMessage = pairIndex === effectiveCurrentIndex;
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
                        setSelectedPairId(pair.customerEmail.id);
                        onMessageClick(pair.customerEmail.id);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (
                        !isCurrentMessage &&
                        onMessageClick &&
                        (event.key === 'Enter' || event.key === ' ')
                      ) {
                        event.preventDefault();
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

                      {/* Inline signal badges + AI summary */}
                      {(() => {
                        const analysis = pair.customerEmail.metadata?.analysis as
                          | { summary?: string }
                          | undefined;
                        return (
                          <div className="mt-2 ml-10 space-y-1">
                            <div className="flex flex-wrap gap-1">
                              <MessageSignalBadges message={pair.customerEmail} size="sm" />
                              {pair.customerEmail.processed && (
                                <Badge variant="success" className="flex gap-1 items-center h-5 px-1.5">
                                  Processed
                                </Badge>
                              )}
                            </div>
                            {analysis?.summary && (
                              <p className="text-xs text-muted-foreground">{analysis.summary}</p>
                            )}
                          </div>
                        );
                      })()}
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
                      <div className="p-3 text-center bg-amber-50 border-t dark:bg-amber-900/10">
                        <p className="text-xs text-amber-800 dark:text-amber-200">
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
