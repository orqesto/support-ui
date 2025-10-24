import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { categoryService } from '@/services/category.service';
import { messageService } from '@/services/message.service';
import { ticketService } from '@/services/ticket.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Message, Category, TicketPriority } from '@/types';

export const CreateTicketPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const messageId = searchParams.get('messageId');
  const clearTicketsCache = useTicketsStore((state) => state.clearCache);
  const clearMessagesCache = useMessagesStore((state) => state.clearCache);

  const [message, setMessage] = useState<Message | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as TicketPriority,
    categoryId: '',
  });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  useEffect(() => {
    if (messageId) {
      fetchMessage(parseInt(messageId)).catch((error) => {
        console.error('Failed to fetch message:', error);
      });
    }
    fetchCategories().catch((error) => {
      console.error('Failed to fetch categories:', error);
    });
  }, [messageId]);

  const fetchMessage = async (id: number) => {
    try {
      const response = await messageService.getById(id);
      if (response.success && response.data) {
        const data = response.data;
        setMessage(data);
        setFormData((prev) => ({
          ...prev,
          title: data.subject ?? `Message from ${data.sender}`,
          description: data.content,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch message:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await categoryService.getAll();
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!messageId) {
      return;
    }

    setLoading(true);
    try {
      const response = await ticketService.create({
        ...formData,
        messageId: parseInt(messageId),
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      });

      if (response.success && response.data) {
        const ticketId = response.data.id;
        setAlertDialog({
          open: true,
          title: 'Success',
          description: 'Ticket created successfully',
          variant: 'success',
        });
        clearTicketsCache(); // Clear tickets cache to show new ticket
        clearMessagesCache(); // Clear messages cache since message is now processed
        // Navigate to the newly created ticket after a short delay
        setTimeout(() => navigate(`/tickets/${ticketId}`), 1500);
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
      setAlertDialog({
        open: true,
        title: 'Creation Failed',
        description: 'Failed to create ticket',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold">Create Ticket</h1>
          <p className="mt-2 text-muted-foreground">Convert message into a support ticket</p>
        </div>

        {message && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Original Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                <strong>From:</strong> {message.sender}
              </p>
              <p className="text-sm">
                <strong>Channel:</strong> {message.channel}
              </p>
              {message.subject && (
                <p className="text-sm">
                  <strong>Subject:</strong> {message.subject}
                </p>
              )}
              <p className="text-sm">
                <strong>Content:</strong>
              </p>
              <p className="text-sm text-muted-foreground">{message.content}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Ticket Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                required
              />

              <div>
                <label htmlFor="description" className="block mb-2 text-sm font-medium">
                  Description
                </label>
                <textarea
                  className="flex px-3 py-2 w-full text-sm rounded-md border border-input bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  rows={6}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  required
                />
              </div>

              <Select
                label="Priority"
                value={formData.priority}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, priority: e.target.value as TicketPriority }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>

              <Select
                label="Category"
                value={formData.categoryId}
                onChange={(e) => setFormData((prev) => ({ ...prev, categoryId: e.target.value }))}
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </Select>

              <div className="flex gap-2 pt-4">
                <Button type="submit" isLoading={loading}>
                  Create Ticket
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/messages')}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </Layout>
  );
};
