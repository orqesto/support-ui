import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { categoryService } from '@/services/category.service';
import { ticketService } from '@/services/ticket.service';
import type { Category, TicketPriority, TicketStatus, Ticket } from '@/types';

export const EditTicketPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'pending' as TicketStatus,
    priority: 'medium' as TicketPriority,
    categoryId: '',
  });

  useEffect(() => {
    if (id) {
      fetchTicket(parseInt(id));
      fetchCategories();
    }
  }, [id]);

  const fetchTicket = async (ticketId: number) => {
    try {
      const response = await ticketService.getById(ticketId);
      if (response.success && response.data) {
        setTicket(response.data);
        setFormData({
          title: response.data.title,
          description: response.data.description,
          status: response.data.status,
          priority: response.data.priority,
          categoryId: response.data.categoryId?.toString() || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch ticket:', error);
      alert('Failed to load ticket');
    } finally {
      setLoading(false);
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
    if (!id) {
      return;
    }

    setSaving(true);
    try {
      const response = await ticketService.update(parseInt(id), {
        ...formData,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
      });

      if (response.success) {
        alert('Ticket updated successfully');
        navigate(`/tickets`);
      }
    } catch (error) {
      console.error('Failed to update ticket:', error);
      alert('Failed to update ticket');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Ticket</h1>
          <p className="text-muted-foreground mt-2">Update ticket details</p>
        </div>

        {ticket?.externalId && (
          <Card className="border-yellow-500 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900 mb-1">
                    This ticket is synced with Jira
                  </h3>
                  <p className="text-sm text-yellow-800 mb-3">
                    This ticket has been pushed to Jira and should be edited there to maintain
                    consistency. Changes made here will not sync back to Jira.
                  </p>
                  {ticket.externalUrl && (
                    <a
                      href={ticket.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      Open in Jira
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => navigate('/tickets')}>
                      Back to Tickets
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Ticket Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {ticket?.externalId && (
                <div className="p-3 bg-gray-100 border border-gray-300 rounded-md text-sm text-gray-700">
                  ⚠️ Warning: This form is disabled because the ticket is synced with Jira.
                </div>
              )}
              <Input
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                disabled={!!ticket?.externalId}
                required
              />

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  rows={6}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={!!ticket?.externalId}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, status: e.target.value as TicketStatus }))
                  }
                  disabled={!!ticket?.externalId}
                >
                  <option value="pending">Pending</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Priority</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, priority: e.target.value as TicketPriority }))
                  }
                  disabled={!!ticket?.externalId}
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.categoryId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, categoryId: e.target.value }))}
                  disabled={!!ticket?.externalId}
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" isLoading={saving} disabled={!!ticket?.externalId}>
                  Save Changes
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/tickets')}>
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
