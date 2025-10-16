import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ticketService } from '@/services/ticket.service';
import { messageService } from '@/services/message.service';
import { categoryService } from '@/services/category.service';
import type { Message, Category, TicketPriority } from '@/types';

export const CreateTicketPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const messageId = searchParams.get('messageId');

  const [message, setMessage] = useState<Message | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as TicketPriority,
    categoryId: '',
  });

  useEffect(() => {
    if (messageId) {
      fetchMessage(parseInt(messageId));
    }
    fetchCategories();
  }, [messageId]);

  const fetchMessage = async (id: number) => {
    try {
      const response = await messageService.getById(id);
      if (response.success && response.data) {
        setMessage(response.data);
        setFormData(prev => ({
          ...prev,
          title: response.data!.subject || `Message from ${response.data!.sender}`,
          description: response.data!.content,
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
    if (!messageId) return;

    setLoading(true);
    try {
      const response = await ticketService.create({
        ...formData,
        messageId: parseInt(messageId),
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      });

      if (response.success) {
        alert('Ticket created successfully');
        navigate('/tickets');
      }
    } catch (error) {
      console.error('Failed to create ticket:', error);
      alert('Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Ticket</h1>
          <p className="text-muted-foreground mt-2">
            Convert message into a support ticket
          </p>
        </div>

        {message && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Original Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm"><strong>From:</strong> {message.sender}</p>
              <p className="text-sm"><strong>Channel:</strong> {message.channel}</p>
              {message.subject && (
                <p className="text-sm"><strong>Subject:</strong> {message.subject}</p>
              )}
              <p className="text-sm"><strong>Content:</strong></p>
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
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  rows={6}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Priority</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as TicketPriority }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.categoryId}
                  onChange={(e) => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                >
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" isLoading={loading}>
                  Create Ticket
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/messages')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};
