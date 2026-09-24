import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  chatWidgetService,
  type ChatWidget,
  type CreateChatWidgetRequest,
} from '@/services/chatWidget.service';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useAiDraftsOff } from '@/hooks/useAiDraftsOff';
import { departmentService, type Department } from '@/services/department.service';
import { messageService, type MessageSourceOption } from '@/services/message.service';
import { logger } from '@/lib/logger';

/**
 * Source types an agent's reply can go out from as an email. The backend escalates a chat into a
 * conversation on this source, and answers it through the source's own transport.
 */
const EMAIL_SOURCE_TYPES = new Set(['email', 'gmail']);

/** Mirrors the backend's defaults (chatWidgetNoAiHandoff.ts) — shown as placeholders. */
const DEFAULT_EMAIL_REQUEST_MESSAGE =
  'Thanks for your message. Please leave your email address so our team can reply to you.';
const DEFAULT_HANDOFF_MESSAGE =
  "Thanks — we've passed your message to our team. We'll reply by email to {email}.";
const DEFAULT_HANDOFF_MESSAGE_NO_ACCOUNT = "Thanks — we've passed your message to our team.";
const MAX_WIDGET_TEXT = 1000;

interface ChatWidgetModalProps {
  open: boolean;
  widget: ChatWidget | null;
  onClose: () => void;
  onSuccess: () => void;
  onShowAlert: (alert: {
    open: boolean;
    title: string;
    description: string;
    variant: 'info' | 'warning' | 'error' | 'success';
  }) => void;
}

export const ChatWidgetModal = ({
  open,
  widget,
  onClose,
  onSuccess,
  onShowAlert,
}: ChatWidgetModalProps) => {
  const [formData, setFormData] = useState<CreateChatWidgetRequest>({
    name: '',
    departmentIds: [],
    welcomeMessage: 'Hi! How can I help you today?',
    placeholder: 'Type your message...',
    primaryColor: '#0070F3',
    position: 'bottom-right',
    collectUserInfo: true,
    allowedDomains: [],
  });
  const [domainsText, setDomainsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [emailSources, setEmailSources] = useState<MessageSourceOption[]>([]);
  const { off: aiDraftsOff } = useAiDraftsOff();
  const accountId = formData.escalationSourceId ?? null;
  const hasEmailAccount = accountId !== null;
  const [theme, setTheme] = useState({
    botBubbleColor: '#ffffff',
    botTextColor: '#1f2937',
    borderRadius: 'rounded',
    fontFamily: '',
  });

  useEffect(() => {
    if (open) {
      departmentService.getAll().then(setDepartments).catch(() => setDepartments([]));
      messageService
        .getMessageSourcesForFilter()
        .then((sources) => setEmailSources(sources.filter((src) => EMAIL_SOURCE_TYPES.has(src.type))))
        .catch(() => setEmailSources([]));
    }
  }, [open]);

  useEffect(() => {
    if (widget) {
      setFormData({
        name: widget.name,
        departmentIds: widget.departmentIds ?? [],
        welcomeMessage: widget.welcomeMessage ?? '',
        placeholder: widget.placeholder ?? '',
        primaryColor: widget.primaryColor,
        position: widget.position,
        collectUserInfo: widget.collectUserInfo,
        allowedDomains: widget.allowedDomains,
        // Carried only when the backend sent them: an older one omits the fields, and sending
        // undefined leaves the stored values alone.
        escalationSourceId: widget.escalationSourceId,
        handoffMessage: widget.handoffMessage,
        emailRequestMessage: widget.emailRequestMessage,
      });
      setDomainsText(widget.allowedDomains.join('\n'));
      const themeData = (widget.metadata?.theme as typeof theme) ?? {};
      setTheme({
        botBubbleColor: themeData.botBubbleColor ?? '#ffffff',
        botTextColor: themeData.botTextColor ?? '#1f2937',
        borderRadius: themeData.borderRadius ?? 'rounded',
        fontFamily: themeData.fontFamily ?? '',
      });
    } else {
      setFormData({
        name: '',
        departmentIds: [],
        welcomeMessage: 'Hi! How can I help you today?',
        placeholder: 'Type your message...',
        primaryColor: '#0070F3',
        position: 'bottom-right',
        collectUserInfo: true,
        allowedDomains: [],
      });
      setDomainsText('');
      setTheme({
        botBubbleColor: '#ffffff',
        botTextColor: '#1f2937',
        borderRadius: 'rounded',
        fontFamily: '',
      });
    }
  }, [widget, open]);

  const toggleDept = (deptId: number) =>
    setFormData((prev) => {
      const current = prev.departmentIds ?? [];
      return {
        ...prev,
        departmentIds: current.includes(deptId)
          ? current.filter((id) => id !== deptId)
          : [...current, deptId],
      };
    });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const domains = domainsText
        .split('\n')
        .map((domain) => domain.trim())
        .filter((domain) => domain.length > 0);

      // An emptied text box means "use the default" — stored as null, never as ''.
      const orDefault = (text: string | null | undefined) => {
        if (text === undefined) return undefined;
        const trimmed = text?.trim() ?? '';
        return trimmed.length > 0 ? trimmed : null;
      };
      const data = {
        ...formData,
        handoffMessage: orDefault(formData.handoffMessage),
        emailRequestMessage: orDefault(formData.emailRequestMessage),
        allowedDomains: domains,
        metadata: { theme },
      };

      if (widget) {
        await chatWidgetService.update(widget.id, data);
        onShowAlert({
          open: true,
          title: 'Success',
          description: 'Widget updated successfully',
          variant: 'success',
        });
      } else {
        await chatWidgetService.create(data);
        onShowAlert({
          open: true,
          title: 'Success',
          description: 'Widget created successfully',
          variant: 'success',
        });
      }

      onSuccess();
    } catch (error) {
      logger.error('Failed to save widget:', error);
      onShowAlert({
        open: true,
        title: 'Error',
        description: 'Failed to save widget',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">
            {widget ? 'Edit Chat Widget' : 'Create Chat Widget'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="p-0 w-auto h-auto text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Widget Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              placeholder="Support Chat Widget"
              required
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Departments</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {departments.length === 0 ? (
                <span className="text-xs text-muted-foreground">Loading…</span>
              ) : (
                departments.map((dept) => {
                  const selected = (formData.departmentIds ?? []).includes(dept.id);
                  return (
                    <Button
                      key={dept.id}
                      type="button"
                      size="sm"
                      variant={selected ? 'primary' : 'secondary'}
                      onClick={() => toggleDept(dept.id)}
                      className="px-2 py-1 h-auto text-xs rounded-full"
                    >
                      {dept.name}
                    </Button>
                  );
                })
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {(formData.departmentIds ?? []).length === 0
                ? 'No departments selected — the widget serves the whole workspace.'
                : 'The widget is scoped to the selected department(s).'}
            </p>
          </div>

          <div>
            <Label htmlFor="welcomeMessage">Welcome Message</Label>
            <Input
              id="welcomeMessage"
              value={formData.welcomeMessage}
              onChange={(event) => setFormData({ ...formData, welcomeMessage: event.target.value })}
              placeholder="Hi! How can I help you today?"
            />
          </div>

          <div>
            <Label htmlFor="placeholder">Input Placeholder</Label>
            <Input
              id="placeholder"
              value={formData.placeholder}
              onChange={(event) => setFormData({ ...formData, placeholder: event.target.value })}
              placeholder="Type your message..."
            />
          </div>

          <div>
            <ReactSelect
              label="Email account for replies"
              id="escalationSourceId"
              value={hasEmailAccount ? String(accountId) : ''}
              onChange={(value) =>
                setFormData({ ...formData, escalationSourceId: value ? Number(value) : null })
              }
              options={[
                { value: '', label: 'None' },
                ...emailSources.map((src) => ({
                  value: String(src.id),
                  label: src.enabled ? src.name : `${src.name} (disabled)`,
                })),
                // Keep a stored account visible even if it is disabled or no longer listed.
                ...(hasEmailAccount && !emailSources.some((src) => src.id === accountId)
                  ? [{ value: String(accountId), label: 'Current account' }]
                  : []),
              ]}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              When a chat is handed to your team, replies to the visitor go out by email from this
              account.
            </p>
          </div>

          {aiDraftsOff && (
            <div className="space-y-3 p-3 rounded-md border">
              <p className="text-xs text-muted-foreground">
                AI drafts are switched off for this workspace, so the widget does not answer with
                AI: it asks the visitor for an email address and hands the chat to your team. These
                are the two things it says — leave a box empty to use the default.
              </p>
              {!hasEmailAccount && (
                <Alert variant="warning">
                  No email account is selected, so your team cannot reply to visitors by email.
                  Choose one above.
                </Alert>
              )}
              <div>
                <Label htmlFor="emailRequestMessage">Asking for an email</Label>
                <Textarea
                  id="emailRequestMessage"
                  value={formData.emailRequestMessage ?? ''}
                  maxLength={MAX_WIDGET_TEXT}
                  onChange={(event) =>
                    setFormData({ ...formData, emailRequestMessage: event.target.value })
                  }
                  placeholder={DEFAULT_EMAIL_REQUEST_MESSAGE}
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="handoffMessage">After handing the chat to your team</Label>
                <Textarea
                  id="handoffMessage"
                  value={formData.handoffMessage ?? ''}
                  maxLength={MAX_WIDGET_TEXT}
                  onChange={(event) =>
                    setFormData({ ...formData, handoffMessage: event.target.value })
                  }
                  placeholder={
                    hasEmailAccount
                      ? DEFAULT_HANDOFF_MESSAGE
                      : DEFAULT_HANDOFF_MESSAGE_NO_ACCOUNT
                  }
                  rows={2}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {'{email}'} is replaced with the visitor&apos;s address.
                  {!hasEmailAccount &&
                    ' Without an email account, do not promise a reply by email.'}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  id="primaryColor"
                  value={formData.primaryColor}
                  onChange={(event) => setFormData({ ...formData, primaryColor: event.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.primaryColor}
                  onChange={(event) => setFormData({ ...formData, primaryColor: event.target.value })}
                  placeholder="#0070F3"
                  className="flex-1 font-mono"
                />
              </div>
            </div>

            <div>
              <ReactSelect
                label="Position"
                id="position"
                value={formData.position}
                onChange={(value) =>
                  setFormData({ ...formData, position: value as 'bottom-right' | 'bottom-left' })
                }
                options={[
                  { value: 'bottom-right', label: 'Bottom Right' },
                  { value: 'bottom-left', label: 'Bottom Left' },
                ]}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="allowedDomains">
              Allowed Domains (one per line, leave empty for all)
            </Label>
            <Textarea
              id="allowedDomains"
              value={domainsText}
              onChange={(event) => setDomainsText(event.target.value)}
              placeholder="example.com&#10;*.example.com&#10;app.example.com"
              className="min-h-[100px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Restrict widget to specific domains. Use * for wildcards.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="collectUserInfo"
              checked={formData.collectUserInfo}
              onChange={(event) => setFormData({ ...formData, collectUserInfo: event.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="collectUserInfo" className="!mb-0">
              Ask visitors for name &amp; email in the chat
            </Label>
          </div>
          <p className="-mt-2 ml-6 text-xs text-muted-foreground">
            When on, the assistant asks for the visitor&apos;s name then email as the first
            chat messages (they can type &quot;skip&quot;). Off = straight to chat.
          </p>

          <details className="rounded-md border border-input">
            <summary className="cursor-pointer px-4 py-3">
              <span className="font-medium">Appearance</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Customize the widget look to match your website
              </span>
            </summary>
            <div className="space-y-4 px-4 pb-4 pt-2">
              <div>
                <ReactSelect
                  label="Border Radius"
                  id="borderRadius"
                  value={theme.borderRadius}
                  onChange={(value) => setTheme({ ...theme, borderRadius: value })}
                  options={[
                    { value: 'rounded', label: 'Rounded - default' },
                    { value: 'sharp', label: 'Sharp' },
                    { value: 'pill', label: 'Pill' },
                  ]}
                />
              </div>

              <div>
                <Label htmlFor="botBubbleColor">Bot Bubble Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    id="botBubbleColor"
                    value={theme.botBubbleColor}
                    onChange={(event) => setTheme({ ...theme, botBubbleColor: event.target.value })}
                    className="h-10 w-20"
                  />
                  <Input
                    value={theme.botBubbleColor}
                    onChange={(event) => setTheme({ ...theme, botBubbleColor: event.target.value })}
                    placeholder="#ffffff"
                    className="flex-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="botTextColor">Bot Text Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    id="botTextColor"
                    value={theme.botTextColor}
                    onChange={(event) => setTheme({ ...theme, botTextColor: event.target.value })}
                    className="h-10 w-20"
                  />
                  <Input
                    value={theme.botTextColor}
                    onChange={(event) => setTheme({ ...theme, botTextColor: event.target.value })}
                    placeholder="#1f2937"
                    className="flex-1 font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="fontFamily">Font Family</Label>
                <Input
                  id="fontFamily"
                  value={theme.fontFamily}
                  onChange={(event) => setTheme({ ...theme, fontFamily: event.target.value })}
                  placeholder="inherit from website"
                />
                <p className="mt-1 text-xs text-muted-foreground">e.g. Inter, Arial, Georgia</p>
              </div>
            </div>
          </details>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : widget ? 'Update Widget' : 'Create Widget'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
