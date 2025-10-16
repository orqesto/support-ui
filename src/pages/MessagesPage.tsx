import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/Card';
import { ListCard } from '@/components/ui/ListCard';
import { Drawer } from '@/components/ui/Drawer';
import { MessageDetail } from '@/components/MessageDetail';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { messageService } from '@/services/message.service';
import { formatDate } from '@/lib/utils';
import { Mail, MessageSquare, Send, Check, X, RefreshCw, Trash2, Filter } from 'lucide-react';
import type { Message } from '@/types';
import { Dialog, DialogHeader, DialogTitle, DialogClose, DialogContent, DialogFooter } from '@/components/ui/Dialog';

export const MessagesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unprocessed'>(
    (searchParams.get('filter') as 'all' | 'unprocessed') || 'unprocessed'
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const navigate = useNavigate();

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const filters: Record<string, string> | undefined = filter === 'unprocessed' ? { processed: 'false' } : undefined;
      const response = await messageService.getAll(filters);
      if (response.success && response.data) {
        setMessages(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleFilterChange = (newFilter: 'all' | 'unprocessed') => {
    setFilter(newFilter);
    setSearchParams(newFilter === 'unprocessed' ? { filter: 'unprocessed' } : {});
  };

  const handleApprove = (message: Message) => {
    // Navigate to create ticket page with message data
    navigate(`/tickets/create?messageId=${message.id}`);
  };

  const handleReject = async (message: Message) => {
    try {
      await messageService.markAsProcessed(message.id);
      fetchMessages();
    } catch (error) {
      console.error('Failed to mark as processed:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const handleDeleteClick = (message: Message) => {
    setMessageToDelete(message);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!messageToDelete) return;
    
    setDeleting(true);
    try {
      await messageService.delete(messageToDelete.id);
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
      fetchMessages();
    } catch (error) {
      console.error('Failed to delete message:', error);
      alert('Failed to delete message');
    } finally {
      setDeleting(false);
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'slack':
      case 'telegram':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Send className="h-4 w-4" />;
    }
  };

  return (
    <Layout>
      <div className="space-y-4 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Messages</h1>
            <p className="text-muted-foreground mt-2">
              Review incoming messages and create tickets
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              isLoading={refreshing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant={filter === 'all' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('all')}
            >
              <Filter className="h-4 w-4 mr-2" />
              All ({messages.length})
            </Button>
            <Button
              variant={filter === 'unprocessed' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange('unprocessed')}
            >
              <Filter className="h-4 w-4 mr-2" />
              Unprocessed ({messages.filter(m => !m.processed).length})
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No messages found</h3>
              <p className="text-muted-foreground">
                {filter === 'unprocessed'
                  ? 'All messages have been processed'
                  : 'No messages available'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 w-full">
            {messages.map((message) => {
              const analysis = message.metadata?.analysis as {
                isTicketWorthy?: boolean;
                suggestedPriority?: string;
              } | undefined;
              
              const spamCheck = message.metadata?.spamCheck as {
                isSpam?: boolean;
              } | undefined;

              return (
              <ListCard
                key={message.id}
                onClick={() => setSelectedMessage(message)}
                header={
                  <>
                    {getChannelIcon(message.channel)}
                    <Badge variant="secondary">{message.channel}</Badge>
                    {message.processed && <Badge variant="success">Processed</Badge>}
                    {spamCheck?.isSpam === true && <Badge variant="danger">Spam</Badge>}
                    {analysis?.isTicketWorthy && <Badge variant="default">Ticket Worthy</Badge>}
                    {analysis?.suggestedPriority && (
                      <Badge variant={
                        analysis.suggestedPriority === 'critical' ? 'danger' :
                        analysis.suggestedPriority === 'high' ? 'warning' :
                        'default'
                      }>
                        {analysis.suggestedPriority}
                      </Badge>
                    )}
                  </>
                }
                content={
                  <>
                    <div>
                      <p className="font-semibold">{message.sender}</p>
                      {message.subject && (
                        <p className="text-sm text-muted-foreground">
                          Subject: {message.subject}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {message.content}
                    </p>
                  </>
                }
                metadata={formatDate(message.createdAt)}
                actions={
                  <>
                    {!message.processed && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(message)}
                          title="Create Ticket"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(message)}
                          title="Mark as Processed"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteClick(message)}
                      title="Delete Message"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                }
              />
            );
            })}
          </div>
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogHeader>
          <DialogTitle>Delete Message</DialogTitle>
          <DialogClose onClose={() => setDeleteDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <p>Are you sure you want to delete this message? This action cannot be undone.</p>
          {messageToDelete && (
            <div className="mt-4 p-4 bg-gray-50 rounded">
              <p className="text-sm font-medium">From: {messageToDelete.sender}</p>
              {messageToDelete.subject && (
                <p className="text-sm text-muted-foreground">Subject: {messageToDelete.subject}</p>
              )}
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteConfirm}
            isLoading={deleting}
          >
            Delete
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Message Detail Drawer */}
      {selectedMessage && (
        <Drawer
          open={!!selectedMessage}
          onClose={() => setSelectedMessage(null)}
          title="Message Details"
        >
          <MessageDetail
            message={selectedMessage}
            onApprove={() => {
              handleApprove(selectedMessage);
              setSelectedMessage(null);
            }}
            onReject={async () => {
              await handleReject(selectedMessage);
              setSelectedMessage(null);
            }}
            onDelete={() => {
              setMessageToDelete(selectedMessage);
              setSelectedMessage(null);
              setDeleteDialogOpen(true);
            }}
          />
        </Drawer>
      )}
    </Layout>
  );
};
