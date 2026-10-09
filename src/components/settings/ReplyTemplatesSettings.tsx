import { useCallback, useEffect, useRef, useState } from 'react';
import { Edit2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { getApiErrorMessage, getErrorStatus } from '@/lib/errorMessages';
import { logger } from '@/lib/logger';
import { isBlankRichText } from '@/lib/stripHtml';
import { useAuthStore } from '@/stores/authStore';
import { Permission } from '@/types/roles';
import {
  replyTemplatesService,
  type ReplyTemplate,
  type ReplyTemplateAttachment,
  type TemplateUse,
} from '@/services/replyTemplates.service';

/**
 * Settings › Rules › Reply templates (owner, 2026-10-09; plan `REPLY-TEMPLATES-PLAN-2026-10-09.md`
 * T-1, P1–P4). Everyone who reads messages sees the templates they can use; creating needs
 * MANAGE_REPLY_TEMPLATES, and editing or archiving one needs the server's `canEdit` for it (the
 * permission AND, for a department's template, membership).
 */

/** The server's limits (build spec A3). */
export const MAX_NAME = 120;
export const MAX_TEMPLATE_FILES = 10;

export const USE_LABELS: Record<TemplateUse, string> = {
  thread: 'Thread replies',
  ticket: 'Ticket replies',
  both: 'Both',
};

const WHOLE_WORKSPACE = '';

type Form = {
  /** Null = a new template. */
  id: number | null;
  name: string;
  body: string;
  use: TemplateUse;
  departmentId: string;
  kept: ReplyTemplateAttachment[];
  removed: number[];
  added: File[];
};

const emptyForm = (): Form => ({
  id: null,
  name: '',
  body: '',
  use: 'both',
  departmentId: WHOLE_WORKSPACE,
  kept: [],
  removed: [],
  added: [],
});

export const ReplyTemplatesSettings = () => {
  const { hasPermission, isOrgAdmin } = usePermissions();
  const canCreate = hasPermission(Permission.MANAGE_REPLY_TEMPLATES);
  const myDepartmentIds = useAuthStore((state) => state.user?.departmentIds);
  const { data: departments = [] } = useDepartments();

  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'unavailable'>('loading');
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toArchive, setToArchive] = useState<ReplyTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await replyTemplatesService.list();
      if (result.unavailable) {
        setState('unavailable');
        return;
      }
      setTemplates(result.templates);
      setState('ready');
    } catch (err) {
      logger.error('Failed to read the reply templates', err);
      setState('failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const departmentName = (id: number | null) =>
    id === null
      ? 'Whole workspace'
      : (departments.find((dept) => dept.id === id)?.name ?? `Department #${id}`);

  // A non-admin may file a template only under the whole workspace or their own departments.
  const ownDepartments = isOrgAdmin
    ? departments
    : departments.filter((dept) => (myDepartmentIds ?? []).includes(dept.id));
  const departmentOptions = [
    { value: WHOLE_WORKSPACE, label: 'Whole workspace' },
    ...ownDepartments.map((dept) => ({ value: String(dept.id), label: dept.name })),
  ];
  // The template being edited keeps its department on the list even if it is not one of mine.
  if (form?.departmentId && !departmentOptions.some((opt) => opt.value === form.departmentId)) {
    departmentOptions.push({
      value: form.departmentId,
      label: departmentName(Number(form.departmentId)),
    });
  }

  const openEdit = (template: ReplyTemplate) => {
    setFormError(null);
    setForm({
      id: template.id,
      name: template.name,
      body: template.body,
      use: template.use,
      departmentId:
        template.departmentId === null ? WHOLE_WORKSPACE : String(template.departmentId),
      kept: template.attachments,
      removed: [],
      added: [],
    });
  };

  const fileCount = form ? form.kept.length + form.added.length : 0;
  const nameError =
    form && form.name.trim().length > MAX_NAME ? `At most ${MAX_NAME} characters.` : undefined;
  const canSave =
    form !== null && form.name.trim().length > 0 && !nameError && !isBlankRichText(form.body);

  const save = async () => {
    if (!form || !canSave) return;
    setSaving(true);
    setFormError(null);
    const input = {
      name: form.name.trim(),
      body: form.body,
      use: form.use,
      departmentId: form.departmentId === WHOLE_WORKSPACE ? null : Number(form.departmentId),
    };
    try {
      if (form.id === null) await replyTemplatesService.create(input, form.added);
      else await replyTemplatesService.update(form.id, input, form.removed, form.added);
      setForm(null);
      await load();
    } catch (err) {
      logger.error('Failed to save the reply template', err);
      setFormError(
        getErrorStatus(err) === 409
          ? 'A template with this name already exists.'
          : (getApiErrorMessage(err) ?? 'The template could not be saved.')
      );
    } finally {
      setSaving(false);
    }
  };

  const archive = async (template: ReplyTemplate) => {
    setToArchive(null);
    setError(null);
    try {
      await replyTemplatesService.archive(template.id);
      await load();
    } catch (err) {
      logger.error('Failed to archive the reply template', err);
      setError(getApiErrorMessage(err) ?? 'The template could not be archived.');
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }
  if (state === 'unavailable') {
    return (
      <p className="text-sm text-muted-foreground">
        Reply templates are not available on this server yet.
      </p>
    );
  }
  if (state === 'failed') {
    return (
      <p className="text-sm text-destructive">
        We could not read the reply templates just now. Reload the page to try again.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Reply templates</h3>
          <p className="text-sm text-muted-foreground">
            Saved replies agents insert from the Templates menu of a thread’s reply box, or turn
            into one draft per customer on a ticket. A department’s templates are listed only to its
            members.
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            onClick={() => {
              setFormError(null);
              setForm(emptyForm());
            }}
          >
            <Plus className="mr-1 w-4 h-4" aria-hidden />
            New template
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canCreate
            ? 'No templates yet — create the first one.'
            : 'No templates yet. An admin or moderator can create them.'}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Reply templates">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-border"
            >
              <span className="text-sm font-medium flex-1 min-w-0 truncate">{template.name}</span>
              <Badge variant="secondary">{USE_LABELS[template.use]}</Badge>
              <Badge variant="secondary">{departmentName(template.departmentId)}</Badge>
              {template.attachments.length > 0 && (
                <Badge variant="secondary">
                  {template.attachments.length}{' '}
                  {template.attachments.length === 1 ? 'file' : 'files'}
                </Badge>
              )}
              {template.canEdit && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(template)}
                    aria-label={`Edit ${template.name}`}
                  >
                    <Edit2 className="w-4 h-4" aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setToArchive(template)}
                    aria-label={`Archive ${template.name}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={form !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setForm(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form?.id === null ? 'New reply template' : 'Edit reply template'}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <Input
                label="Name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                error={nameError}
                placeholder="e.g. Refund approved"
              />
              <Select
                label="Use in"
                aria-label="Use in"
                options={(Object.keys(USE_LABELS) as TemplateUse[]).map((use) => ({
                  value: use,
                  label: USE_LABELS[use],
                }))}
                value={form.use}
                onChange={(value) => setForm({ ...form, use: value as TemplateUse })}
              />
              <Select
                label="Department"
                aria-label="Department"
                options={departmentOptions}
                value={form.departmentId}
                onChange={(value) => setForm({ ...form, departmentId: value })}
                hint="A department’s template is listed only to that department’s members."
              />
              <div className="space-y-1">
                <Label>Text</Label>
                <RichTextEditor
                  content={form.body}
                  onChange={(html) => setForm((prev) => (prev ? { ...prev, body: html } : prev))}
                  placeholder="The reply…"
                  minHeight="140px"
                  initiallyHidden={false}
                  editable={!saving}
                />
                <p className="text-xs text-muted-foreground">
                  Greet each customer by name with {'{first_name|there}'} — “there” is used when the
                  name is unknown. Also: {'{customer_name}'}, {'{ticket_id}'}, {'{thread_id}'},{' '}
                  {'{agent_name}'}.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Files</Label>
                {fileCount > 0 && (
                  <ul className="space-y-1">
                    {form.kept.map((file) => (
                      <li
                        key={`kept-${file.id}`}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md bg-muted"
                      >
                        <span className="truncate">
                          <Paperclip className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden />
                          {file.filename}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setForm({
                              ...form,
                              kept: form.kept.filter((row) => row.id !== file.id),
                              removed: [...form.removed, file.id],
                            })
                          }
                          className="p-0 w-auto h-auto"
                          aria-label={`Remove ${file.filename}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </li>
                    ))}
                    {form.added.map((file, index) => (
                      <li
                        key={`added-${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md bg-muted"
                      >
                        <span className="truncate">
                          <Paperclip className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden />
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setForm({
                              ...form,
                              added: form.added.filter((_, idx) => idx !== index),
                            })
                          }
                          className="p-0 w-auto h-auto"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  aria-label="Add files to the template"
                  onChange={(event) => {
                    const picked = Array.from(event.target.files ?? []);
                    // The server takes at most MAX_TEMPLATE_FILES per template.
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            added: [...prev.added, ...picked].slice(
                              0,
                              Math.max(0, MAX_TEMPLATE_FILES - prev.kept.length)
                            ),
                          }
                        : prev
                    );
                    event.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving || fileCount >= MAX_TEMPLATE_FILES}
                >
                  <Paperclip className="w-4 h-4 mr-1" aria-hidden />
                  Add files
                </Button>
              </div>
              {formError && <p className="text-sm text-destructive">{formError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} isLoading={saving} disabled={saving || !canSave}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toArchive !== null}
        onOpenChange={(open) => {
          if (!open) setToArchive(null);
        }}
        onConfirm={() => {
          if (toArchive) void archive(toArchive);
        }}
        title={toArchive ? `Archive “${toArchive.name}”?` : ''}
        description="It leaves every Templates menu. Replies and drafts already written from it are not changed."
        confirmText="Archive"
      />
    </div>
  );
};
