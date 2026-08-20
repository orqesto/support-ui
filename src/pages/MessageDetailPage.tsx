import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { Button } from '@/components/ui/Button';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';

export const MessageDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  // The open detail registers its prompt-aware close here so the Back button asks
  // "Mark as read?" for an unread triage thread, matching the slide-over.
  const requestCloseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // `id` may be either a numeric conv id ('16952') or a publicId ('SUP-42').
    // Pass the raw string straight through — the BE's resolveConvIdFromParam
    // dual-resolves both shapes. Previously this used parseInt and silently
    // dropped any non-numeric (i.e. publicId-shaped) URL.
    if (id) {
      void fetchMessage(id, true);
    }
  }, [id]);

  const handleApprove = useCallback(() => {
    if (message) navigate(`/tickets/create?messageId=${message.id}`);
  }, [message, navigate]);

  /**
   * Reclassify a filtered message — "this isn't junk, put it back".
   *
   * MessageDetail gates the whole filtered action block on `isFiltered &&
   * onClassify`, so omitting this prop did not disable one button: it removed
   * Approve and Move to Spam from the page entirely. The inbox slide-over passed
   * it and the full page did not, so the same message offered different actions
   * depending on how it was opened — and the Orphaned Outbound list links HERE,
   * which left an orphan with no way out of the orphan lens at all.
   *
   * `onApprove` above is a different thing despite the name: it starts a ticket.
   */
  const handleClassify = useCallback(
    async (
      action: 'approve' | 'mark_suspicious' | 'move_to_spam',
      createDetectionRule?: boolean,
      trainSpamFilter?: boolean
    ) => {
      if (!message) return;
      await messageService.classify(message.id, action, createDetectionRule, trainSpamFilter);
      // Re-read rather than patch locally: approve moves the status server-side
      // (filtered → new) and the action strip renders off that status, so a stale
      // copy would keep offering the action that has already been taken.
      await fetchMessage(message.id);
    },
    [message]
  );

  const fetchMessage = async (messageId: number | string, fullLoad = false) => {
    try {
      if (fullLoad) setLoading(true);
      const response = await messageService.getById(messageId);
      if (response.success && response.data) {
        setMessage(response.data);
      }
    } catch (error) {
      logger.error('Failed to fetch message:', error);
    } finally {
      if (fullLoad) setLoading(false);
    }
  };

  const goBack = useCallback(() => {
    navigate('/messages');
  }, [navigate]);

  // Route Back through the detail's prompt-aware close (falls back to a direct
  // navigate if it hasn't registered yet, e.g. the not-found state).
  const handleBack = useCallback(() => {
    if (requestCloseRef.current) {
      requestCloseRef.current();
      return;
    }
    goBack();
  }, [goBack]);

  if (loading) {
    return (
      <Layout>
        <div className="flex gap-2 justify-center items-center h-64 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading message...
        </div>
      </Layout>
    );
  }

  if (!message) {
    return (
      <Layout>
        <div className="flex flex-col gap-4 justify-center items-center h-64">
          <div className="text-muted-foreground">Message not found</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back to Messages
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex overflow-hidden flex-col flex-1 min-h-0">
        {/* Back bar */}
        <div className="flex-shrink-0 border-b border-border">
          <div className="flex gap-2 items-center px-4 py-2 mx-auto w-full">
            <Button onClick={handleBack} variant="outline" size="sm">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
            <h1 className="text-base font-semibold">Message Details</h1>
          </div>
        </div>

        {/* 3-zone panel */}
        <div className="flex overflow-hidden flex-1 justify-center min-h-0">
          <div className="flex flex-col w-full h-full border-x border-border">
            <MessageDetail
              key={message.id}
              message={message}
              isFullPage
              onClose={goBack}
              onRegisterRequestClose={(fn) => {
                requestCloseRef.current = fn;
              }}
              onReadChanged={() => fetchMessage(message.id)}
              onRefresh={() => fetchMessage(message.id)}
              onApprove={handleApprove}
              onClassify={handleClassify}
              onReject={() => fetchMessage(message.id)}
              onReopen={() => fetchMessage(message.id)}
              onDelete={goBack}
              onResolve={() => fetchMessage(message.id)}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};
