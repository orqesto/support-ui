import { useState, useEffect, type FormEvent } from 'react';
import { AlertCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';
import { categoryService } from '@/services/category.service';
import { labelService, type Label } from '@/services/settings.service';
import { ticketService } from '@/services/ticket.service';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Category, TicketPriority, TicketStatus, Ticket } from '@/types';
import { logger } from '@/lib/logger';

export const EditTicketPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clearCache = useTicketsStore((state) => state.clearCache);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [allLabels, setAllLabels] = useState<Label[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<number>>(new Set());
  const [initialLabelIds, setInitialLabelIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'pending' as TicketStatus,
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
    if (id) {
      fetchTicket(parseInt(id)).catch((error) => {
        logger.error('Failed to fetch ticket:', error);
      });
      fetchCategories().catch((error) => {
        logger.error('Failed to fetch categories:', error);
      });
      assignmentService.getAssignableUsers().then(setAssignableUsers).catch((error) => {
        logger.error('Failed to fetch assignable users:', error);
      });
      labelService.getLabels().then(setAllLabels).catch((error) => {
        logger.error('Failed to fetch labels:', error);
      });
      labelService.getTicketLabels(parseInt(id)).then((labels) => {
        const ids = new Set(labels.map((l) => l.id));
        setSelectedLabelIds(ids);
        setInitialLabelIds(ids);
      }).catch((error) => {
        logger.error('Failed to fetch ticket labels:', error);
      });
    }
  }, [id]);

  const fetchTicket = async (ticketId: number) => {
    try {
      const response = await ticketService.getById(ticketId);
      if (response.success && response.data) {
        setTicket(response.data);
        const div = document.createElement('div');
        div.innerHTML = response.data.description;
        const plainDescription = div.textContent ?? div.innerText ?? response.data.description;
        setFormData({
          title: response.data.title,
          description: plainDescription,
          status: response.data.status,
          priority: response.data.priority,
          categoryId: response.data.categoryId?.toString() ?? '',
        });
        setAssigneeId(response.data.assigneeId?.toString() ?? '');
      }
    } catch (error) {
      logger.error('Failed to fetch ticket:', error);
      setAlertDialog({
        open: true,
        title: 'Load Failed',
        description: 'Failed to load ticket',
        variant: 'error',
      });
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
      logger.error('Failed to fetch categories:', error);
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
        await assignmentService.assignTicket(parseInt(id), assigneeId ? parseInt(assigneeId) : null);
        const ticketId = parseInt(id);
        await Promise.all([
          ...[...selectedLabelIds].filter((lid) => !initialLabelIds.has(lid)).map((lid) => labelService.assignLabelToTicket(ticketId, lid)),
          ...[...initialLabelIds].filter((lid) => !selectedLabelIds.has(lid)).map((lid) => labelService.removeLabelFromTicket(ticketId, lid)),
        ]);
        clearCache(); // Clear cache to refresh tickets list
        setAlertDialog({
          open: true,
          title: 'Success',
          description: 'Ticket updated successfully',
          variant: 'success',
        });
        setTimeout(() => navigate(`/tickets`), 1500);
      }
    } catch (error) {
      logger.error('Failed to update ticket:', error);
      setAlertDialog({
        open: true,
        title: 'Update Failed',
        description: 'Failed to update ticket',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 rounded-full border-4 animate-spin border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 pb-6 mx-auto space-y-4 w-full max-w-7xl">
        <div>
          <h1 className="text-3xl font-bold">Edit Ticket</h1>
          <p className="mt-2 text-muted-foreground">Update ticket details</p>
        </div>

        {ticket?.externalId && (
          <Card className="bg-yellow-50 border-yellow-500">
            <CardContent className="pt-6">
              <div className="flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="mb-1 font-semibold text-yellow-900">
                    This ticket is synced with Jira
                  </h3>
                  <p className="mb-3 text-sm text-yellow-800">
                    This ticket has been pushed to Jira and should be edited there to maintain
                    consistency. Changes made here will not sync back to Jira.
                  </p>
                  {ticket.externalUrl && (
                    <a
                      href={ticket.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex gap-2 items-center text-sm font-medium text-blue-600 hover:text-blue-800"
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
                <div className="flex gap-2 items-start p-3 text-sm text-gray-700 bg-gray-100 rounded-md border border-gray-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Warning: This form is disabled because the ticket is synced with Jira.
                  </span>
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
                <label htmlFor="description" className="block mb-2 text-sm font-medium">
                  Description
                </label>
                <textarea
                  className="flex px-3 py-2 w-full text-sm rounded-md border border-input bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  rows={6}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  disabled={!!ticket?.externalId}
                  required
                />
              </div>

              <ReactSelect
                label="Status"
                value={formData.status}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, status: value as TicketStatus }))
                }
                options={[
                  { value: 'pending', label: 'Pending' },
                  { value: 'open', label: 'Open' },
                  { value: 'in_progress', label: 'In Progress' },
                  { value: 'resolved', label: 'Resolved' },
                  { value: 'closed', label: 'Closed' },
                ]}
                isDisabled={!!ticket?.externalId}
                placeholder="Select status"
              />

              <ReactSelect
                label="Priority"
                value={formData.priority}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, priority: value as TicketPriority }))
                }
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'critical', label: 'Critical' },
                ]}
                isDisabled={!!ticket?.externalId}
                placeholder="Select priority"
              />

              <ReactSelect
                label="Category"
                value={formData.categoryId}
                onChange={(value) => setFormData((prev) => ({ ...prev, categoryId: value }))}
                options={[
                  { value: '', label: 'Select a category' },
                  ...categories.map((cat) => ({
                    value: String(cat.id),
                    label: cat.name,
                  })),
                ]}
                isDisabled={!!ticket?.externalId}
                placeholder="Select a category"
                isSearchable
              />

              <ReactSelect
                label="Assignee"
                value={assigneeId}
                onChange={(value) => setAssigneeId(value)}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...assignableUsers.map((u) => ({
                    value: String(u.id),
                    label: `${u.firstName} ${u.lastName}`.trim(),
                  })),
                ]}
                isDisabled={!!ticket?.externalId}
                placeholder="Select assignee"
                isSearchable
              />

              {allLabels.length > 0 && (
                <div>
                  <label className="block mb-2 text-sm font-medium">Labels</label>
                  <div className="flex flex-wrap gap-2">
                    {allLabels.map((label) => {
                      const selected = selectedLabelIds.has(label.id);
                      return (
                        <button
                          key={label.id}
                          type="button"
                          disabled={!!ticket?.externalId}
                          onClick={() => {
                            setSelectedLabelIds((prev) => {
                              const next = new Set(prev);
                              if (selected) {
                                next.delete(label.id);
                              } else {
                                next.add(label.id);
                              }
                              return next;
                            });
                          }}
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white transition-opacity ${selected ? 'opacity-100 ring-2 ring-offset-1 ring-current' : 'opacity-40'} disabled:cursor-not-allowed`}
                          style={{ backgroundColor: label.color }}
                        >
                          {label.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
