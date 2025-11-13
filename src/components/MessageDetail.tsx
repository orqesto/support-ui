import { useState, useEffect, useRef } from 'react';
import {
  Mail,
  MessageSquare,
  Send,
  Check,
  Trash2,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
  Link as LinkIcon,
  Reply,
  RefreshCw,
  Search,
  Info,
  CheckCircle,
  BookOpen,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { MessageAIAnalysis } from '@/components/MessageAIAnalysis';
import { MessageAttachments } from '@/components/MessageAttachments';
import { MessageThread } from '@/components/MessageThread';
import { SimilarMessagesDialog } from '@/components/SimilarMessagesDialog';
import { SimilarTickets } from '@/components/SimilarTickets';
import { TranslateButton } from '@/components/TranslateButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Textarea } from '@/components/ui/Textarea';
import { LinkifiedText } from '@/lib/linkify';
import { formatDate } from '@/lib/utils';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';

type MessageDetailProps = {
  message: Message;
  onApprove?: () => void;
  onReject?: () => void;
  onReopen?: () => void;
  onDelete?: () => void;
  onRefresh?: () => void;
  onMessageNavigate?: (messageId: number) => void;
};

export const MessageDetail = ({
  message,
  onApprove,
  onReject,
  onReopen,
  onDelete,
  onRefresh,
  onMessageNavigate,
}: MessageDetailProps) => {
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [similarMessagesOpen, setSimilarMessagesOpen] = useState(false);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const [showTopButton, setShowTopButton] = useState(false);
  const [showBottomButton, setShowBottomButton] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    // Scroll to the very top (header/message content)
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToBottom = () => {
    // Scroll to actions at the bottom
    document
      .querySelector('[data-message-actions]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Check if content is scrollable and update button visibility
  useEffect(() => {
    const checkScroll = () => {
      const container = containerRef.current?.closest(
        '.overflow-auto, .overflow-y-auto'
      ) as HTMLElement;
      if (!container) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrollable = scrollHeight > clientHeight + 100; // Only show if significant scroll needed

      setShowScrollButtons(isScrollable);

      // Show top button when scrolled down
      setShowTopButton(scrollTop > 200);

      // Show bottom button when not at bottom
      setShowBottomButton(scrollTop < scrollHeight - clientHeight - 200);
    };

    checkScroll();

    const container = containerRef.current?.closest(
      '.overflow-auto, .overflow-y-auto'
    ) as HTMLElement;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);

      return () => {
        container.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [message]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/messages?id=${message.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy link:', err);
      });
  };

  const handleRejectClick = () => {
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    setRejectDialogOpen(false);
    onReject?.();
  };

  const handleReopenClick = () => {
    setReopenDialogOpen(true);
  };

  const handleReopenConfirm = () => {
    setReopenDialogOpen(false);
    onReopen?.();
  };

  const handleSendReply = async () => {
    if (!replyContent.trim()) {
      return;
    }

    try {
      setSubmitting(true);
      // Only resolve if it's a standalone message (no ticket)
      // Messages with tickets should just send reply without resolving
      const shouldResolve = !message.ticketId && !message.resolved;
      await messageService.reply(message.id, replyContent, shouldResolve);
      setReplyContent('');
      setShowReplyForm(false);
      onApprove?.(); // Refresh message
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveWithoutReply = async () => {
    try {
      await messageService.resolve(message.id);
    } catch (error) {
      console.error('Failed to resolve message:', error);
    }
  };

  const handleSelectSimilarAnswer = (answer: string) => {
    setReplyContent(answer);
    setShowReplyForm(true);
  };

  const handleUseResponse = (content: string) => {
    setReplyContent(content);
    setShowReplyForm(true);
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="w-5 h-5" />;
      case 'slack':
      case 'telegram':
        return <MessageSquare className="w-5 h-5" />;
      default:
        return <Send className="w-5 h-5" />;
    }
  };

  const autoReply = message.metadata?.autoReply as
    | {
        sent?: boolean;
        sentAt?: string;
        missingInfo?: string[];
        replyContent?: string;
      }
    | undefined;

  const suggestedAnswer = message.metadata?.suggestedAnswer as
    | {
        answer: string;
        similarity: number;
        source?: 'documentation' | 'similar_ticket' | 'similar_message';
        sourceId: number;
        sourceMessageId?: number; // Legacy field
        documentTitle?: string;
        foundAt: string;
      }
    | undefined;

  return (
    <div ref={containerRef} className="relative space-y-6">
      {/* Floating scroll buttons - only show when scrollable */}
      {showScrollButtons && (
        <div className="flex fixed right-6 bottom-24 z-40 flex-col gap-2">
          {showTopButton && (
            <Button
              onClick={scrollToTop}
              size="sm"
              variant="outline"
              className="p-0 w-10 h-10 border-2 shadow-lg backdrop-blur-sm transition-all duration-300 bg-background/80 hover:scale-110"
              title="Scroll to actions"
            >
              <ArrowUp className="w-4 h-4" />
            </Button>
          )}
          {showBottomButton && (
            <Button
              onClick={scrollToBottom}
              size="sm"
              variant="outline"
              className="p-0 w-10 h-10 border-2 shadow-lg backdrop-blur-sm transition-all duration-300 bg-background/80 hover:scale-110"
              title="Scroll to message"
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex gap-3 items-center">
          <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/10">
            {getChannelIcon(message.channel)}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="secondary">{message.channel}</Badge>
              {message.processed && <Badge variant="success">Processed</Badge>}
              {message.ticketId && <Badge variant="default">Has Ticket</Badge>}
              {message.resolved && !message.ticketId && <Badge variant="success">Resolved</Badge>}
            </div>
          </div>
          {onRefresh && (
            <Button
              onClick={onRefresh}
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              title="Refresh message data"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Message ID</p>
            <p className="font-mono text-sm">#{message.id}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">From</p>
            <p className="text-lg font-semibold truncate">{message.sender}</p>
          </div>
        </div>

        {message.subject && (
          <div>
            <p className="text-sm text-muted-foreground">Subject</p>
            <p className="font-medium">{message.subject}</p>
          </div>
        )}

        <div>
          <p className="text-sm text-muted-foreground">Received</p>
          <p className="text-sm">
            {formatDate(
              (message.metadata as { receivedAt?: string })?.receivedAt ?? message.createdAt
            )}
          </p>
          {(message.metadata as { receivedAt?: string })?.receivedAt && message.createdAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Imported: {formatDate(message.createdAt)}
            </p>
          )}
        </div>

        {/* Link to Ticket */}
        {message.ticketId && (
          <div className="p-3 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Linked Ticket
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Ticket #{message.ticketId}
                </p>
              </div>
              <Link
                to={`/tickets?id=${message.ticketId}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition-colors"
              >
                View Ticket
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Processing Error Alert */}
        {message.processingError && (
          <div className="p-4 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/20 dark:border-red-800">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="mb-1 font-medium text-red-900 dark:text-red-100">Processing Failed</p>
                <p className="text-sm text-red-700 break-words dark:text-red-300">
                  {message.processingError}
                </p>
                {(message.metadata as { failedAt?: string })?.failedAt && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    Failed at: {formatDate((message.metadata as { failedAt: string }).failedAt)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Similar Resolved Tickets - AI-powered suggestions */}
      {!message.ticketId && !message.resolved && (
        <SimilarTickets messageId={message.id} onUseResponse={handleUseResponse} />
      )}

      {/* Message Content */}
      <div className="pt-6 border-t" data-message-content>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Message</h3>
          <TranslateButton
            messageId={message.id}
            originalContent={message.content}
            originalSubject={message.subject ?? undefined}
            variant="ghost"
            size="sm"
          />
        </div>
        <div className="max-w-none break-words prose prose-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere">
            <LinkifiedText>{message.content}</LinkifiedText>
          </p>
        </div>
      </div>

      {/* AI Auto-Reply (if sent) */}
      {autoReply?.sent && autoReply.replyContent && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950/20 dark:border-green-800">
          <div className="flex justify-between items-start mb-3">
            <div className="flex gap-2 items-center">
              <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-900">
                <Send className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                AI Auto-Reply Sent
              </h3>
            </div>
            {autoReply.sentAt && (
              <span className="text-xs text-green-600 dark:text-green-400">
                {formatDate(new Date(autoReply.sentAt))}
              </span>
            )}
          </div>
          <div className="mb-3 max-w-none break-words prose prose-sm prose-green">
            <p className="text-sm leading-relaxed text-green-900 whitespace-pre-wrap break-words overflow-wrap-anywhere dark:text-green-50">
              <LinkifiedText>{autoReply.replyContent}</LinkifiedText>
            </p>
          </div>
          {autoReply.missingInfo && autoReply.missingInfo.length > 0 && (
            <div className="pt-3 border-t border-green-200 dark:border-green-800">
              <p className="mb-2 text-xs font-medium text-green-700 dark:text-green-300">
                Additional information requested:
              </p>
              <ul className="space-y-1 text-xs text-green-600 dark:text-green-400">
                {autoReply.missingInfo.map((info) => (
                  <li key={info} className="flex gap-2 items-start">
                    <span className="mt-1">•</span>
                    <span>{info}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* AI Suggested Answer - Needs Agent Approval */}
      {suggestedAnswer &&
        !message.resolved &&
        (suggestedAnswer.source === 'documentation' ? (
          <div className="p-4 mb-6 bg-blue-50 rounded-lg border-2 border-blue-300 dark:bg-blue-950/20 dark:border-blue-700">
            <div className="flex gap-2 items-start mb-3">
              <div className="p-2 bg-blue-100 rounded-full dark:bg-blue-900">
                <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                  AI Found Answer in Documentation
                </h3>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {Math.round(suggestedAnswer.similarity * 100)}% similarity
                  {suggestedAnswer.documentTitle && ` • ${suggestedAnswer.documentTitle}`}
                  {' • Needs your review'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
              <p className="mb-2 text-xs font-medium text-blue-700 dark:text-blue-300">
                From Documentation:
              </p>
              <p className="text-sm text-blue-900 whitespace-pre-wrap break-words overflow-wrap-anywhere dark:text-blue-50">
                <LinkifiedText>{suggestedAnswer.answer}</LinkifiedText>
              </p>
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => {
                  setReplyContent(suggestedAnswer.answer);
                  setShowReplyForm(true);
                }}
                className="flex-1"
              >
                <Check className="mr-2 w-4 h-4" />
                Use This Answer
              </Button>
              <Button onClick={() => setShowReplyForm(true)} variant="outline">
                Write Different Reply
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4 mb-6 bg-purple-50 rounded-lg border-2 border-purple-300 dark:bg-purple-950/20 dark:border-purple-700">
            <div className="flex gap-2 items-start mb-3">
              <div className="p-2 bg-purple-100 rounded-full dark:bg-purple-900">
                <Search className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-purple-900 dark:text-purple-100">
                  {suggestedAnswer.source === 'similar_ticket'
                    ? 'AI Found Similar Resolved Ticket'
                    : 'AI Found Similar Resolved Message'}
                </h3>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  {Math.round(suggestedAnswer.similarity * 100)}% similarity • Needs your review
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded border border-purple-200 dark:bg-purple-950/40 dark:border-purple-800">
              <p className="mb-2 text-xs font-medium text-purple-700 dark:text-purple-300">
                Suggested Answer:
              </p>
              <p className="text-sm text-purple-900 whitespace-pre-wrap break-words overflow-wrap-anywhere dark:text-purple-50">
                <LinkifiedText>{suggestedAnswer.answer}</LinkifiedText>
              </p>
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => {
                  setReplyContent(suggestedAnswer.answer);
                  setShowReplyForm(true);
                }}
                className="flex-1"
              >
                <Check className="mr-2 w-4 h-4" />
                Use This Answer
              </Button>
              <Button onClick={() => setShowReplyForm(true)} variant="outline">
                Write Different Reply
              </Button>
            </div>
          </div>
        ))}

      {/* Email Thread */}
      <MessageThread
        messageId={message.id}
        currentThreadId={message.threadId}
        onMessageClick={onMessageNavigate}
      />

      {/* Direct Reply Form */}
      <div className="pt-6 border-t">
        {message.ticketId && (
          <div className="p-3 mb-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
            <p className="flex gap-2 items-start text-sm text-blue-900 dark:text-blue-100">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This message is linked to Ticket #{message.ticketId}. Your reply will be sent to the
                customer.
              </span>
            </p>
          </div>
        )}
        {message.resolved && !message.ticketId && (
          <div className="p-3 mb-3 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950/20 dark:border-green-800">
            <p className="flex gap-2 items-start text-sm text-green-900 dark:text-green-100">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This message is already marked as resolved. You can still send a follow-up reply if
                needed.
              </span>
            </p>
          </div>
        )}
        {!showReplyForm ? (
          <div className="space-y-2">
            {/* AI Knowledge Search - searches docs, tickets, and messages */}
            {!message.resolved && !message.ticketId && (
              <Button
                onClick={() => setSimilarMessagesOpen(true)}
                className="w-full"
                variant="secondary"
              >
                <Search className="mr-2 w-4 h-4" />
                AI Knowledge Search
              </Button>
            )}
            <Button onClick={() => setShowReplyForm(true)} className="w-full" variant="outline">
              <Reply className="mr-2 w-4 h-4" />
              {message.ticketId
                ? 'Send Reply'
                : message.resolved
                  ? 'Send Follow-up Reply'
                  : 'Reply Without Creating Ticket'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              id="reply-textarea"
              label={
                message.ticketId ? 'Reply' : message.resolved ? 'Follow-up Reply' : 'Quick Reply'
              }
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder={
                message.ticketId
                  ? 'Type your reply...'
                  : message.resolved
                    ? 'Type your follow-up message...'
                    : 'Type your reply to resolve this request quickly...'
              }
            />
            <div className="flex gap-2">
              <Button onClick={handleSendReply} disabled={submitting || !replyContent.trim()}>
                <Send className="mr-2 w-4 h-4" />
                {submitting
                  ? 'Sending...'
                  : message.ticketId
                    ? 'Send Reply'
                    : message.resolved
                      ? 'Send Reply'
                      : 'Send & Resolve'}
              </Button>
              <Button variant="outline" onClick={() => setShowReplyForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Show existing direct reply if present */}
      {message.directReply && message.repliedAt && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Support Reply
            </h3>
            {message.repliedAt && (
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {formatDate(new Date(message.repliedAt))}
              </span>
            )}
          </div>
          <p className="text-sm text-blue-900 whitespace-pre-wrap dark:text-blue-50">
            {message.directReply}
          </p>
        </div>
      )}

      {/* Email Attachments */}
      <MessageAttachments message={message} />

      {/* AI Analysis */}
      <MessageAIAnalysis message={message} onRefresh={onRefresh} />

      {/* Metadata */}
      {message.metadata &&
        (() => {
          // Filter out embedding fields and already-displayed analysis/spamCheck
          const { embedding, embeddingString, analysis, spamCheck, ...displayMetadata } =
            message.metadata;
          return Object.keys(displayMetadata).length > 0 ? (
            <div className="pt-6 border-t">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Additional Information
              </h3>
              <div className="p-4 rounded-lg bg-muted">
                <pre className="overflow-auto text-xs">
                  {JSON.stringify(displayMetadata, null, 2)}
                </pre>
              </div>
            </div>
          ) : null;
        })()}

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-6 border-t" data-message-actions>
        {/* UNPROCESSED: Needs human review */}
        {!message.processed && (
          <>
            {/* Primary action */}
            {onReject && (
              <Button onClick={handleRejectClick} className="w-full" size="lg">
                <Check className="mr-2 w-4 h-4" />
                Process
              </Button>
            )}

            {/* Secondary actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="flex-1">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
              {onDelete && (
                <Button onClick={onDelete} variant="destructive" size="sm" className="flex-1">
                  <Trash2 className="mr-2 w-4 h-4" />
                  Delete
                </Button>
              )}
            </div>
          </>
        )}

        {/* PROCESSED (not resolved, no ticket): Ready for action */}
        {message.processed && !message.resolved && !message.ticketId && (
          <>
            {/* Primary actions */}
            <div className="grid grid-cols-2 gap-3">
              {onApprove && (
                <Button onClick={onApprove} size="lg">
                  <Check className="mr-2 w-4 h-4" />
                  Create Ticket
                </Button>
              )}
              <Button
                onClick={handleResolveWithoutReply}
                variant="secondary"
                size="lg"
                title="Mark as resolved and save attachments to knowledge base"
              >
                <CheckCircle className="mr-2 w-4 h-4" />
                Resolve & Save to KB
              </Button>
            </div>

            {/* Secondary actions */}
            <div className="flex gap-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="flex-1">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
              {onReopen && (
                <Button onClick={handleReopenClick} variant="outline" size="sm" className="flex-1">
                  <RotateCcw className="mr-2 w-4 h-4" />
                  Reopen
                </Button>
              )}
            </div>
          </>
        )}

        {/* RESOLVED: Completed */}
        {message.resolved && !message.ticketId && (
          <>
            {/* Primary action */}
            {onReopen && (
              <Button onClick={handleReopenClick} variant="outline" size="lg" className="w-full">
                <RotateCcw className="mr-2 w-4 h-4" />
                Unresolve
              </Button>
            )}

            {/* Secondary action */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="w-full">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
            </div>
          </>
        )}

        {/* HAS TICKET: Ticket created */}
        {message.ticketId && (
          <>
            {/* Info banner */}
            <div className="p-4 rounded-lg border bg-blue-500/10 dark:bg-blue-500/10 border-blue-500/20">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                ✓ Ticket created for this message
              </p>
            </div>

            {/* Secondary action */}
            <div className="flex gap-2">
              <Button onClick={handleCopyLink} variant="ghost" size="sm" className="w-full">
                <LinkIcon className="mr-2 w-4 h-4" />
                {linkCopied ? 'Link Copied!' : 'Copy Link'}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Processed?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to mark this message as processed without creating a ticket? This
            action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRejectConfirm}>Mark as Processed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unresolve Confirmation Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unresolve Message?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to unresolve this message? This will:
          </p>
          <ul className="pl-2 space-y-1 text-sm list-disc list-inside text-muted-foreground">
            <li>Mark the message as unprocessed</li>
            <li>Remove all documentation created from this message</li>
            <li>Delete PDFs and images from the knowledge base</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            The message will appear in your unprocessed messages list again.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReopenConfirm} variant="destructive">
              Unresolve & Clean Up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similar Messages Dialog */}
      <SimilarMessagesDialog
        messageId={message.id}
        open={similarMessagesOpen}
        onClose={() => setSimilarMessagesOpen(false)}
        onSelectAnswer={handleSelectSimilarAnswer}
      />
    </div>
  );
};
