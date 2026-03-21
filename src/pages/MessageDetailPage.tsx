import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { MessageDetail } from '@/components/messages/MessageDetail';
import { ScrollButtons } from '@/components/shared/ScrollButtons';
import { Button } from '@/components/ui/Button';
import { messageService } from '@/services/message.service';
import type { Message } from '@/types';

export const MessageDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      void fetchMessage(parseInt(id));
    }
  }, [id]);

  const fetchMessage = async (messageId: number) => {
    try {
      setLoading(true);
      const response = await messageService.getById(messageId);
      if (response.success && response.data) {
        setMessage(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch message:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/messages');
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64 gap-2 text-muted-foreground">
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
    <>
      <ScrollButtons bottomTarget="[data-message-actions]" />
      <Layout>
        <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
          <div className="flex gap-2 items-center">
            <Button onClick={handleBack} variant="outline" size="sm">
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
            <h1 className="text-2xl font-bold">Message Details</h1>
          </div>

          <div className="p-6 rounded-lg border bg-card">
            <MessageDetail
              message={message}
              onRefresh={() => fetchMessage(message.id)}
              onApprove={() => fetchMessage(message.id)}
              onReject={() => fetchMessage(message.id)}
              onReopen={() => fetchMessage(message.id)}
              onDelete={handleBack}
              onResolve={() => fetchMessage(message.id)}
            />
          </div>
        </div>
      </Layout>
    </>
  );
};
