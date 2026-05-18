import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { Button } from '@/components/ui/Button';
import { messageService } from '@/services/message.service';
import { similarResultsCache } from '@/components/messages/AiTabPanel';
import type { Message } from '@/types';
import { logger } from '@/lib/logger';

export const MessageDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      void (async () => {
        await fetchMessage(parseInt(id), true);
        // Auto-navigate to the latest message in the thread
        try {
          const threadRes = await messageService.getThreadMessages(parseInt(id));
          if (threadRes.success && threadRes.data && threadRes.data.length > 0) {
            const latestIncoming = threadRes.data
              .filter((m) => !m.isOutgoing)
              .sort((a, b) => b.id - a.id)[0];
            if (latestIncoming && latestIncoming.id !== parseInt(id)) {
              // Pre-warm KB cache so AiTabPanel gets an instant hit when it mounts for this ID.
              if (!similarResultsCache.has(latestIncoming.id)) {
                void messageService
                  .getSimilarResolvedMessages(latestIncoming.id, 3, 0.75)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .then((r) => { if (r.success && r.data) similarResultsCache.set(latestIncoming.id, r.data as any); });
              }
              void fetchMessage(latestIncoming.id);
            }
          }
        } catch {
          // ignore — stay on the original message if thread fetch fails
        }
      })();
    }
  }, [id]);

  const handleApprove = useCallback(() => {
    if (message) navigate(`/tickets/create?messageId=${message.id}`);
  }, [message, navigate]);

  const fetchMessage = async (messageId: number, fullLoad = false) => {
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

  const handleBack = () => {
    navigate('/messages');
  };

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
          <div className="flex gap-2 items-center px-4 py-2 mx-auto w-full max-w-7xl">
            <Button onClick={handleBack} variant="outline" size="sm">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
            <h1 className="text-base font-semibold">Message Details</h1>
          </div>
        </div>

        {/* 3-zone panel */}
        <div className="flex overflow-hidden flex-1 justify-center min-h-0">
          <div className="flex flex-col w-full max-w-7xl h-full border-x border-border">
            <MessageDetail
              message={message}
              onRefresh={() => fetchMessage(message.id)}
              onApprove={handleApprove}
              onReject={() => fetchMessage(message.id)}
              onReopen={() => fetchMessage(message.id)}
              onDelete={handleBack}
              onResolve={() => fetchMessage(message.id)}
              onMessageNavigate={(messageId) => {
                void fetchMessage(messageId);
              }}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};
