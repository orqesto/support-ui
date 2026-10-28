import { useState, useEffect, useRef, type FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CreateTicketBar,
  CreateTicketFilesSection,
  CreateTicketJiraOption,
  CreateTicketQuote,
} from '@/components/tickets/CreateTicketChrome';
import { pickUploadableFiles } from '@/components/tickets/NewTicketFiles';
import { TicketThreadPicker } from '@/components/tickets/TicketThreadPicker';
import type { ThreadCandidate } from '@/services/threadCandidates.service';
import { useTicketOwners } from '@/components/tickets/useTicketOwners';
import { Alert } from '@/components/ui/Alert';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tooltip } from '@/components/ui/Tooltip';
import { useNewTicketTeams } from '@/hooks/useTeamsEnabled';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/errorMessages';
import { categoryService } from '@/services/category.service';
import { integrationsService } from '@/services/integrations.service';
import { settingsService } from '@/services/settings.service';
import { messageService } from '@/services/message.service';
import { ticketService } from '@/services/ticket.service';
import { ticketThreadsService } from '@/services/ticketThreads.service';
import { useAuthStore } from '@/stores/authStore';
import { useAiRefusalText } from '@/components/subscription/useAiRefusalText';
import { useMessagesStore } from '@/stores/messagesStore';
import { useTicketsStore } from '@/stores/ticketsStore';
import type { Message, Category, TicketPriority, ApiResponse } from '@/types';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { logger } from '@/lib/logger';

/** The text of the editor's HTML, to tell an empty description from a written one. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim();

/** Words, or a picture (a thread whose body is an image): an image-only description is written. */
const hasContent = (html: string) => textOf(html) !== '' || /<img\b/i.test(html);

/**
 * Create ticket — ONE page for both ways in (owner 2026-10-21,
 * `.planning/ONE-CREATE-TICKET-PAGE-PLAN-2026-10-21.md`):
 * - Tickets → New ticket: empty — a contingency (client spec; owner 2026-10-19: allowed with no
 *   thread yet, the cause is often known before anyone reports it), filed in one of the creator's
 *   teams;
 * - a thread → Create ticket (`?messageId=`): that thread is listed and its team shown.
 * Essentials first (title, cause, team, owner, threads), then priority, category, Jira and
 * files. The ticket is created, then the extra threads are linked and the files uploaded; a step
 * that fails after the ticket exists opens it anyway, and its page says what is missing.
 */
export const CreateTicketPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const messageId = searchParams.get('messageId');
  const user = useAuthStore((state) => state.user);
  const refusalText = useAiRefusalText();
  const userId = user?.id;
  // A ticket with no thread is filed in one of the creator's teams (an administrator may pick
  // any); from a thread it is the thread's team. Teams off: the default team, no field.
  const { allDepartments, departmentsFetched, teamsEnabled, departments } = useNewTicketTeams(user);
  const clearTicketsCache = useTicketsStore((state) => state.clearCache);
  const clearMessagesCache = useMessagesStore((state) => state.clearCache);

  const [message, setMessage] = useState<Message | null>(null);
  const [threadMessageIds, setThreadMessageIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The thread the ticket is created from could not be read: Create cannot go ahead. */
  const [threadFailed, setThreadFailed] = useState(false);
  const [fileNotice, setFileNotice] = useState<string | null>(null);
  const [chosenThreads, setChosenThreads] = useState<ThreadCandidate[]>([]);
  const [pickedDepartmentId, setPickedDepartmentId] = useState('');
  /** Set once a ticket was created: the form stays disabled until the redirect. */
  const [created, setCreated] = useState(false);
  // Something the agent typed or picked — leaving then asks first (a prefill from the thread is not).
  const [touched, setTouched] = useState(false);
  const submittedRef = useRef(false);
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
    // The creator by default on a ticket with no thread; the thread's owner on one from a thread.
    // Sent only when the department's owner list shows they can own it.
    assigneeId: messageId ? null : (userId ?? null),
    syncToJira: false,
  });

  // The department the owner list is read for: null until it is known.
  const firstDepartment = departments[0]?.id;
  const departmentKey: string | null = messageId
    ? message
      ? String(message.departmentId ?? '')
      : null
    : pickedDepartmentId || (firstDepartment !== undefined ? String(firstDepartment) : null);
  const { owners, ownersLoaded } = useTicketOwners(departmentKey);
  const ownerValue =
    formData.assigneeId !== null && owners.some((opt) => opt.value === String(formData.assigneeId))
      ? String(formData.assigneeId)
      : '';
  const threadDepartmentName = message
    ? message.departmentId
      ? (allDepartments.find((dept) => dept.id === message.departmentId)?.name ??
        `Team #${message.departmentId}`)
      : 'No team'
    : '';

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
      if (isNaN(numId)) {
        setThreadFailed(true);
      } else {
        fetchMessage(numId).catch((error) => {
          logger.error('Failed to fetch message:', error);
          setThreadFailed(true);
        });
      }
    }
    fetchCategories().catch((error) => {
      logger.error('Failed to fetch categories:', error);
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

      if (
        messageResult.status === 'rejected' ||
        !messageResult.value.success ||
        !messageResult.value.data
      ) {
        setThreadFailed(true);
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
      setHasJira(
        (response.data ?? []).some(
          (integration) => integration.type === 'jira' && integration.enabled
        )
      );
    } catch (error) {
      logger.error('Failed to check Jira integration:', error);
      setHasJira(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const { kept, notice } = pickUploadableFiles([
      ...selectedFiles,
      ...Array.from(event.target.files),
    ]);
    event.target.value = '';
    setFileNotice(notice);
    setSelectedFiles(kept);
    setTouched(true);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, idx) => idx !== index));
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
        // An AI refusal (enhance-ticket answers 429 FREE_AI_ALLOWANCE_USED) is not "try again".
        description:
          refusalText(error) ?? 'Failed to enhance ticket description. Please try again.',
        variant: 'error',
      });
    } finally {
      setEnhancing(false);
    }
  };

  const ready =
    formData.title.trim() !== '' &&
    hasContent(formData.description) &&
    departmentKey !== null &&
    (messageId ? message !== null : departmentKey !== '') &&
    ownersLoaded;

  // Why Create is off, said on hover (the alerts on the page explain the rarer reasons).
  const blockedReason = !formData.title.trim()
    ? 'Add a title'
    : !hasContent(formData.description)
      ? 'Describe the cause'
      : departmentKey !== null && !ownersLoaded
        ? 'Loading who can own it…'
        : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    /*
      One ticket per press. Every create makes a NEW ticket now — a thread may be on several
      (2026-09-30) — so a second click is a second ticket, not the same one handed back. The ref
      stops a double click before React re-renders the disabled button, and stays set after a
      success until the page navigates away.
    */
    if (submittedRef.current) return;
    submittedRef.current = true;

    setLoading(true);
    setError(null);
    try {
      // JSON, never multipart: POST /api/tickets reads no files (a multipart body arrived empty,
      // staging 2026-10-21) — the files go to the ticket once it exists.
      const response = await ticketService.create({
        title: formData.title.trim(),
        description: formData.description,
        priority: formData.priority,
        ...(formData.categoryId ? { categoryId: parseInt(formData.categoryId, 10) } : {}),
        ...(ownerValue ? { assigneeId: Number(ownerValue) } : {}),
        // A ticket with no thread cannot go to Jira on create: the backend refuses it (400).
        ...(messageId ? { syncToJira: formData.syncToJira } : {}),
        ...(messageId
          ? { messageId: parseInt(messageId, 10) }
          : { departmentId: Number(departmentKey) }),
      });
      const ticketId = response.data?.id;
      if (!ticketId) throw new Error('The ticket was not created');

      // The ticket exists from here on: a later step that fails opens it anyway, and its page
      // says what is missing (TicketDetailPage) rather than failing the whole create.
      let threadsNotLinked = false;
      if (chosenThreads.length > 0) {
        try {
          await ticketThreadsService.addThreads(
            ticketId,
            chosenThreads.map((row) => row.id)
          );
        } catch (err) {
          logger.error('New ticket: linking its threads failed', err);
          threadsNotLinked = true;
        }
      }
      let filesNotAttached = false;
      if (selectedFiles.length > 0) {
        try {
          await ticketService.uploadAttachments(ticketId, selectedFiles);
        } catch (err) {
          logger.error('New ticket: uploading its files failed', err);
          filesNotAttached = true;
        }
      }

      const missing = [
        ...(threadsNotLinked ? ['its threads could not be linked'] : []),
        ...(filesNotAttached ? ['its files could not be attached'] : []),
      ];
      setAlertDialog(
        missing.length > 0
          ? {
              open: true,
              title: 'Ticket created',
              description: `The ticket was created, but ${missing.join(' and ')} — add them on its page.`,
              variant: 'warning',
            }
          : {
              open: true,
              title: 'Success',
              description: 'Ticket created successfully',
              variant: 'success',
            }
      );
      clearTicketsCache(); // Clear tickets cache to show new ticket
      clearMessagesCache(); // Clear messages cache since message is now processed
      const notice = {
        ...(threadsNotLinked ? { threadsNotLinked: true } : {}),
        ...(filesNotAttached ? { filesNotAttached: true } : {}),
      };
      // Navigate to the newly created ticket after a short delay
      setTimeout(
        () =>
          navigate(`/tickets/${ticketId}`, Object.keys(notice).length > 0 ? { state: notice } : {}),
        1500
      );
      setCreated(true);
    } catch (err) {
      submittedRef.current = false;
      logger.error('Failed to create ticket:', err);
      setError(getApiErrorMessage(err) ?? 'The ticket could not be created. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="px-4 mx-auto space-y-4 w-full">
        <CreateTicketBar
          backLabel={messageId ? 'Thread' : 'Tickets'}
          formId="create-ticket-form"
          blockedReason={blockedReason}
          canCreate={ready && !loading && !created}
          loading={loading}
          dirty={touched && !loading && !created}
          onLeave={() => navigate(messageId ? '/threads' : '/tickets')}
        />
        <div>
          <h1 className="font-display text-3xl font-bold">New ticket</h1>
          <p className="mt-2 text-muted-foreground">
            {messageId
              ? 'Turn this thread into a ticket — add other threads it explains if you like.'
              : 'A ticket for a known cause — add the threads it explains now or later.'}
          </p>
        </div>

        {message && <CreateTicketQuote message={message} />}

        <Card>
          <CardContent className="pt-6">
            {threadFailed && (
              <Alert variant="danger" className="mb-4">
                This thread could not be loaded, so a ticket cannot be created from it. Open the
                thread again and use Create ticket there.
              </Alert>
            )}
            {!messageId && departmentsFetched && departments.length === 0 && (
              <Alert variant="warning" className="mb-4">
                A ticket with no thread is filed in one of your teams, and you are not in any. Ask
                an administrator to add you to one, or create the ticket from a thread.
              </Alert>
            )}
            <form id="create-ticket-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,28%)]">
                <div className="space-y-4 min-w-0">
                  <Input
                    label="Title"
                    placeholder="What broke, in a line"
                    value={formData.title}
                    onChange={(event) => {
                      setTouched(true);
                      setFormData((prev) => ({ ...prev, title: event.target.value }));
                    }}
                    required
                  />

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="description" className="text-sm font-medium">
                        Cause or description
                      </label>
                      <Tooltip
                        content={`Rewrites the description into what happened, who’s affected and the workaround${messageId ? ', using the thread' : ''}`}
                        size="sm"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleAIEnhance()}
                          disabled={!formData.description.trim() || enhancing || loading}
                          className="gap-1"
                        >
                          <Sparkles className="w-3 h-3" aria-hidden />
                          {enhancing ? 'Enhancing…' : 'AI enhance'}
                        </Button>
                      </Tooltip>
                    </div>
                    <RichTextEditor
                      content={formData.description}
                      onChange={(html: string) => {
                        setTouched(true);
                        setFormData((prev) => ({ ...prev, description: html }));
                      }}
                      placeholder="What happened, as far as you know"
                      minHeight="200px"
                      // Always show the full editor here — no collapse toggle. The
                      // description is the ticket's core field, not an optional add-on.
                      initiallyHidden={false}
                    />
                  </div>
                  <TicketThreadPicker
                    chosen={chosenThreads}
                    onChosenChange={(next) => {
                      setTouched(true);
                      setChosenThreads(next);
                    }}
                    fixed={
                      message
                        ? {
                            id: message.id,
                            publicId: message.publicId ?? null,
                            subject: message.subject ?? null,
                            sender: message.sender ?? '',
                          }
                        : null
                    }
                  />
                  {error && <Alert variant="danger">{error}</Alert>}
                </div>
                <aside
                  aria-label="Ticket settings"
                  className="space-y-5 lg:pl-6 lg:border-l lg:border-border"
                >
                  <section className="space-y-3">
                    <h3 className="font-display text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground">
                      Where it goes
                    </h3>
                    <div className="grid gap-3">
                      {!teamsEnabled ? null : messageId ? (
                        <div className="space-y-1">
                          <Input
                            label="Team"
                            aria-label="Team"
                            value={threadDepartmentName}
                            readOnly
                            disabled
                          />
                          <p className="text-xs text-muted-foreground">Set by the thread.</p>
                        </div>
                      ) : (
                        <Select
                          label="Team"
                          aria-label="Team"
                          value={departmentKey ?? ''}
                          options={departments.map((dept) => ({
                            value: String(dept.id),
                            label: dept.name,
                          }))}
                          onChange={(value) => {
                            setPickedDepartmentId(value);
                            // Another department, another set of people: the owner is chosen again.
                            setFormData((prev) => ({ ...prev, assigneeId: null }));
                          }}
                          hint="One of your teams."
                        />
                      )}
                      <div className="space-y-1">
                        <Select
                          label="Owner"
                          aria-label="Owner"
                          value={ownerValue}
                          options={[{ value: '', label: 'Unassigned' }, ...owners]}
                          onChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              assigneeId: value ? Number.parseInt(value, 10) : null,
                            }))
                          }
                          searchable
                        />
                        {departmentKey !== null && !ownersLoaded && (
                          <p className="text-xs text-muted-foreground">Loading who can own it…</p>
                        )}
                        {departmentKey !== null && ownersLoaded && owners.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Nobody in this team can own tickets yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                  <section className="space-y-3">
                    <h3 className="font-display text-[10.5px] font-semibold tracking-wider uppercase text-muted-foreground">
                      More details{' '}
                      <span className="font-normal normal-case tracking-normal">· optional</span>
                    </h3>
                    <div>
                      <Select
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
                        <p className="mt-1 text-xs text-ai">
                          ✨ AI suggested: {aiSuggestions.priority}
                        </p>
                      )}
                    </div>

                    <div>
                      <Select
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
                          ...categories.map((cat) => ({
                            value: String(cat.id),
                            label: cat.name,
                          })),
                          ...(suggestedNewCategory
                            ? [{ value: '__new__', label: `✨ Create "${suggestedNewCategory}"` }]
                            : []),
                        ]}
                        placeholder="Select a category"
                        // No category is a valid state: the × returns to it (emits '' as the old empty option did).
                        clearable
                        searchable
                        disabled={creatingCategory}
                      />
                      {aiSuggestions.category && !formData.categoryId && (
                        <p className="mt-1 text-xs text-ai">
                          ✨ AI suggested: {aiSuggestions.category}
                          {suggestedNewCategory
                            ? ' — not in your list yet, select above to create it'
                            : ''}
                        </p>
                      )}
                    </div>

                    {hasJira && messageId && (
                      <CreateTicketJiraOption
                        checked={formData.syncToJira}
                        onChange={(syncToJira) => setFormData((prev) => ({ ...prev, syncToJira }))}
                      />
                    )}
                  </section>
                  <CreateTicketFilesSection
                    files={selectedFiles}
                    notice={fileNotice}
                    disabled={loading}
                    onPick={handleFileSelect}
                    onRemove={handleRemoveFile}
                  />
                </aside>
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
    </>
  );
};
