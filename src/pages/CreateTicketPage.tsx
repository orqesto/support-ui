import { useState, useEffect, type FormEvent } from 'react';
import { Paperclip, X, File, Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { apiClient } from '@/lib/api-client';
import { assignmentService, type AssignableUser } from '@/services/assignment.service';
import { categoryService } from '@/services/category.service';
import { integrationsService } from '@/services/integrations.service';
import { settingsService } from '@/services/settings.service';
import { messageService } from '@/services/message.service';
import { ticketService } from '@/services/ticket.service';
import { useMessagesStore } from '@/stores/messagesStore';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Message, Category, TicketPriority, ApiResponse } from '@/types';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { logger } from '@/lib/logger';

export const CreateTicketPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const messageId = searchParams.get('messageId');
  const clearTicketsCache = useTicketsStore((state) => state.clearCache);
  const clearMessagesCache = useMessagesStore((state) => state.clearCache);

  const [message, setMessage] = useState<Message | null>(null);
  const [threadMessageIds, setThreadMessageIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    category?: string;
    priority?: string;
  }>({});
  const [suggestedNewCategory, setSuggestedNewCategory] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  // Only offer "Sync to Jira" when the org actually has a Jira integration
  // connected — otherwise the toggle is a dead end.
  const [hasJira, setHasJira] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as TicketPriority,
    categoryId: '',
    assigneeId: null as number | null,
    syncToJira: false,
  });

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [enhancing, setEnhancing] = useState(false);

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  useEffect(() => {
    if (messageId) {
      const numId = parseInt(messageId, 10);
      if (!isNaN(numId)) {
        fetchMessage(numId).catch((error) => {
          logger.error('Failed to fetch message:', error);
        });
      }
    }
    fetchCategories().catch((error) => {
      logger.error('Failed to fetch categories:', error);
    });
    fetchUsers().catch((error) => {
      logger.error('Failed to fetch users:', error);
    });
    fetchJiraStatus().catch((error) => {
      logger.error('Failed to check Jira integration:', error);
    });
  }, [messageId]);

  // Match AI-suggested category once both suggestion and category list are ready
  useEffect(() => {
    if (!aiSuggestions.category || categories.length === 0 || formData.categoryId) return;
    const matched = categories.find(
      (cat) => cat.name.toLowerCase() === aiSuggestions.category!.toLowerCase()
    );
    if (matched) {
      setFormData((prev) => ({ ...prev, categoryId: matched.id.toString() }));
    } else {
      setSuggestedNewCategory(aiSuggestions.category);
    }
  }, [aiSuggestions.category, categories, formData.categoryId]);

  const fetchMessage = async (id: number) => {
    try {
      const [messageResult, threadResult] = await Promise.allSettled([
        messageService.getById(id),
        messageService.getThreadMessages(id),
      ]);

      if (messageResult.status === 'rejected' || !messageResult.value.success || !messageResult.value.data) {
        return;
      }

      // Thread events carry the actual message BODY — it lives in message_events,
      // not on the conversation row that getById returns. Use them to prefill the
      // description; also collect ids for the AI-enhance call.
      const threadEvents =
        threadResult.status === 'fulfilled' && threadResult.value.success
          ? (threadResult.value.data ?? [])
          : [];
      if (threadEvents.length > 1) {
        setThreadMessageIds(threadEvents.map((msg) => msg.id));
      }

      const response = messageResult.value;
      if (response.success && response.data) {
        // Widen to the tolerant app Message type: `content` is not returned by the
        // message endpoint (lives in message_events), so it is optional/undefined
        // here — the description prefill below no-ops until the BE exposes it.
        const data: Message = response.data;
        setMessage(data);

        // Extract AI analysis from metadata
        const analysis = data.metadata?.analysis as
          | {
              suggestedCategory?: string;
              suggestedPriority?: string;
            }
          | undefined;

        // Track AI suggestions (WR-04: use || so empty strings are treated as falsy)
        if (analysis?.suggestedPriority || analysis?.suggestedCategory) {
          setAiSuggestions({
            priority: analysis.suggestedPriority,
            category: analysis.suggestedCategory,
          });
        }

        // Convert plain text to HTML for RichTextEditor
        const escapeHtml = (text: string) =>
          text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Prefer the original inbound (client) message body; fall back to the
        // first event, then to any body the message endpoint happened to carry.
        const inboundBody = threadEvents.find((event) => event.type === 'inbound')?.content;
        const rawBody = inboundBody ?? threadEvents[0]?.content ?? data.content ?? '';

        // Email bodies may already be HTML; only escape+wrap when it's plain text.
        const looksLikeHtml = /<[a-z][\s\S]*>/i.test(rawBody);
        const htmlDescription = looksLikeHtml
          ? rawBody
          : rawBody
              .split('\n')
              .filter((line) => line.trim()) // Remove empty lines
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join('');

        setFormData((prev) => ({
          ...prev,
          title:
            data.subject?.replace(/^(?:(?:Re|Fwd?|AW|WG):\s*)+/i, '').trim() ??
            data.subject ??
            `Message from ${data.sender}`,
          description: htmlDescription,
          // Pre-fill priority if AI suggested a valid enum value
          priority: (['low', 'medium', 'high', 'critical'] as TicketPriority[]).includes(
            analysis?.suggestedPriority as TicketPriority
          )
            ? (analysis!.suggestedPriority as TicketPriority)
            : prev.priority,
          assigneeId: data.assigneeId ?? prev.assigneeId,
          // categoryId will be set after categories are loaded
        }));
      }
    } catch (error) {
      logger.error('Failed to fetch message:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await assignmentService.getAssignableUsers();
      setUsers(data);
    } catch (error) {
      logger.error('Failed to fetch assignable users:', error);
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

  const fetchJiraStatus = async () => {
    try {
      const response = await integrationsService.getAll();
      setHasJira((response.data ?? []).some((integration) => integration.type === 'jira' && integration.enabled));
    } catch (error) {
      logger.error('Failed to check Jira integration:', error);
      setHasJira(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFiles(Array.from(event.target.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleAIEnhance = async () => {
    if (!formData.description.trim()) {
      return;
    }

    try {
      setEnhancing(true);
      // Call AI service to enhance the description
      const response = await apiClient.post<ApiResponse<{ enhanced: string }>>(
        '/api/ai/enhance-ticket',
        {
          content: formData.description,
          title: formData.title,
          ...(threadMessageIds.length > 0 && { messageIds: threadMessageIds }),
        }
      );

      if (response.data.success && response.data.data) {
        setFormData((prev) => ({
          ...prev,
          description: response.data.data?.enhanced ?? prev.description,
        }));
      }
    } catch (error) {
      logger.error('Failed to enhance description:', error);
      setAlertDialog({
        open: true,
        title: 'Enhancement Failed',
        description: 'Failed to enhance ticket description. Please try again.',
        variant: 'error',
      });
    } finally {
      setEnhancing(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!messageId) {
      return;
    }

    setLoading(true);
    try {
      const response = await ticketService.createWithAttachments(
        {
          ...formData,
          messageId: parseInt(messageId),
          categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined,
          assigneeId: formData.assigneeId ?? undefined,
          syncToJira: formData.syncToJira,
        },
        selectedFiles
      );

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
      logger.error('Failed to create ticket:', error);
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
      <div className="px-4 mx-auto space-y-4 w-full max-w-7xl">
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
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, title: event.target.value }))
                }
                required
              />

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="description" className="text-sm font-medium">
                    Description
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAIEnhance}
                    disabled={!formData.description.trim() || enhancing || loading}
                    className="gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    {enhancing ? 'Enhancing...' : 'AI Enhance'}
                  </Button>
                </div>
                <RichTextEditor
                  content={formData.description}
                  onChange={(html: string) =>
                    setFormData((prev) => ({ ...prev, description: html }))
                  }
                  placeholder="Enter ticket description..."
                  minHeight="200px"
                  // Always show the full editor here — no collapse toggle. The
                  // description is the ticket's core field, not an optional add-on.
                  initiallyHidden={false}
                />
              </div>

              {/* File Attachments */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="block text-sm font-medium">Attachments</p>
                  <div className="space-y-1">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={file.name}
                        className="flex gap-2 items-center p-2 rounded border bg-muted border-border"
                      >
                        <File className="w-4 h-4 text-muted-foreground" />
                        <span className="flex-1 text-sm truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(index)}
                          className="p-1 h-auto text-red-600 dark:text-red-400 hover:bg-red-500/10"
                          disabled={loading}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
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
                  placeholder="Select priority"
                />
                {aiSuggestions.priority && (
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    ✨ AI suggested: {aiSuggestions.priority}
                  </p>
                )}
              </div>

              <div>
                <ReactSelect
                  label="Category"
                  value={formData.categoryId}
                  onChange={async (value) => {
                    if (value === '__new__' && suggestedNewCategory) {
                      setCreatingCategory(true);
                      try {
                        const newCat = await settingsService.createCategory({
                          name: suggestedNewCategory,
                        });
                        setCategories((prev) => [...prev, newCat]);
                        setFormData((prev) => ({ ...prev, categoryId: String(newCat.id) }));
                        setSuggestedNewCategory(null);
                      } catch {
                        setAlertDialog({
                          open: true,
                          title: 'Error',
                          description: 'Failed to create category.',
                          variant: 'error',
                        });
                      } finally {
                        setCreatingCategory(false);
                      }
                    } else {
                      setFormData((prev) => ({ ...prev, categoryId: value }));
                    }
                  }}
                  options={[
                    { value: '', label: 'Select a category' },
                    ...categories.map((cat) => ({
                      value: String(cat.id),
                      label: cat.name,
                    })),
                    ...(suggestedNewCategory
                      ? [{ value: '__new__', label: `✨ Create "${suggestedNewCategory}"` }]
                      : []),
                  ]}
                  placeholder="Select a category"
                  isSearchable
                  isDisabled={creatingCategory}
                />
                {aiSuggestions.category && !formData.categoryId && (
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    ✨ AI suggested: {aiSuggestions.category}
                    {suggestedNewCategory
                      ? ' — not in your list yet, select above to create it'
                      : ''}
                  </p>
                )}
              </div>

              <div>
                <ReactSelect
                  label="Assigned to"
                  value={formData.assigneeId ? String(formData.assigneeId) : ''}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      assigneeId: value ? Number.parseInt(value, 10) : null,
                    }))
                  }
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...users.map((user) => ({
                      value: String(user.id),
                      label: `${user.firstName} ${user.lastName} (${user.role})`,
                    })),
                  ]}
                  placeholder="Select assignee"
                  isSearchable
                />
              </div>

              {hasJira && (
                <div className="flex gap-2 items-start p-4 rounded-lg border border-border bg-muted/30">
                  <input
                    type="checkbox"
                    id="syncToJira"
                    checked={formData.syncToJira}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, syncToJira: event.target.checked }))
                    }
                    className="mt-0.5 w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary focus:ring-2"
                  />
                  <label htmlFor="syncToJira" className="flex-1 text-sm cursor-pointer">
                    <span className="font-medium">Sync to Jira</span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Automatically create a Jira ticket when this ticket is created. Ticket will only
                      sync if it has meaningful title/description and a category (or high/critical
                      priority).
                    </p>
                  </label>
                </div>
              )}

              <div className="flex gap-2 justify-between items-center pt-4">
                <label className="flex gap-1 items-center px-3 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer text-foreground bg-background border-border hover:bg-accent">
                  <Paperclip className="w-4 h-4" />
                  <span>Attach Files</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="submit" isLoading={loading}>
                    Create Ticket
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate('/messages')}>
                    Cancel
                  </Button>
                </div>
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
