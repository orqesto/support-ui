import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  chatWidgetService,
  type ChatWidget,
  type CreateChatWidgetRequest,
} from '@/services/chatWidget.service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { departmentService, type Department } from '@/services/department.service';
import { logger } from '@/lib/logger';

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
  const [theme, setTheme] = useState({
    botBubbleColor: '#ffffff',
    botTextColor: '#1f2937',
    borderRadius: 'rounded',
    fontFamily: '',
  });

  useEffect(() => {
    if (open) {
      departmentService.getAll().then(setDepartments).catch(() => setDepartments([]));
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

      const data = {
        ...formData,
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
          <h2 className="text-xl font-semibold">
            {widget ? 'Edit Chat Widget' : 'Create Chat Widget'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
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
                    <button
                      key={dept.id}
                      type="button"
                      onClick={() => toggleDept(dept.id)}
                      className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
                      }`}
                    >
                      {dept.name}
                    </button>
                  );
                })
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {(formData.departmentIds ?? []).length === 0
                ? 'No departments selected — the widget serves the whole organization.'
                : 'The AI answers from the selected department(s); routing is scoped to this set.'}
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
            <textarea
              id="allowedDomains"
              value={domainsText}
              onChange={(event) => setDomainsText(event.target.value)}
              placeholder="example.com&#10;*.example.com&#10;app.example.com"
              className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="collectUserInfo" className="!mb-0">
              Collect user name and email before chat
            </Label>
          </div>

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
