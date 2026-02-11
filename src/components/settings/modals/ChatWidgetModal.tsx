import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { chatWidgetService, type ChatWidget, type CreateChatWidgetRequest } from '@/services/chatWidget.service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ReactSelect } from '@/components/ui/ReactSelect';

interface ChatWidgetModalProps {
  open: boolean;
  widget: ChatWidget | null;
  onClose: () => void;
  onSuccess: () => void;
  onShowAlert: (alert: { open: boolean; title: string; description: string; variant: 'info' | 'warning' | 'error' | 'success' }) => void;
}

export const ChatWidgetModal = ({ open, widget, onClose, onSuccess, onShowAlert }: ChatWidgetModalProps) => {
  const [formData, setFormData] = useState<CreateChatWidgetRequest>({
    name: '',
    departmentRole: 'support',
    welcomeMessage: 'Hi! How can I help you today?',
    placeholder: 'Type your message...',
    primaryColor: '#0070F3',
    position: 'bottom-right',
    collectUserInfo: true,
    allowedDomains: [],
  });
  const [domainsText, setDomainsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (widget) {
      setFormData({
        name: widget.name,
        departmentRole: widget.departmentRole,
        welcomeMessage: widget.welcomeMessage || '',
        placeholder: widget.placeholder || '',
        primaryColor: widget.primaryColor,
        position: widget.position,
        collectUserInfo: widget.collectUserInfo,
        allowedDomains: widget.allowedDomains,
      });
      setDomainsText(widget.allowedDomains.join('\n'));
    } else {
      setFormData({
        name: '',
        departmentRole: 'support',
        welcomeMessage: 'Hi! How can I help you today?',
        placeholder: 'Type your message...',
        primaryColor: '#0070F3',
        position: 'bottom-right',
        collectUserInfo: true,
        allowedDomains: [],
      });
      setDomainsText('');
    }
  }, [widget, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const domains = domainsText
        .split('\n')
        .map((d) => d.trim())
        .filter((d) => d.length > 0);

      const data = { ...formData, allowedDomains: domains };

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
      console.error('Failed to save widget:', error);
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
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Support Chat Widget"
              required
            />
          </div>

          <div>
            <ReactSelect
              label="Department"
              id="department"
              value={formData.departmentRole}
              onChange={(value) => setFormData({ ...formData, departmentRole: value as 'support' | 'sales' | 'billing' | 'general' | 'hr' })}
              options={[
                { value: 'support', label: 'Support' },
                { value: 'sales', label: 'Sales' },
                { value: 'billing', label: 'Billing' },
                { value: 'general', label: 'General' },
                { value: 'hr', label: 'HR' },
              ]}
            />
          </div>

          <div>
            <Label htmlFor="welcomeMessage">Welcome Message</Label>
            <Input
              id="welcomeMessage"
              value={formData.welcomeMessage}
              onChange={(e) => setFormData({ ...formData, welcomeMessage: e.target.value })}
              placeholder="Hi! How can I help you today?"
            />
          </div>

          <div>
            <Label htmlFor="placeholder">Input Placeholder</Label>
            <Input
              id="placeholder"
              value={formData.placeholder}
              onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                  className="h-10 w-20"
                />
                <Input
                  value={formData.primaryColor}
                  onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
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
                onChange={(value) => setFormData({ ...formData, position: value as 'bottom-right' | 'bottom-left' })}
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
              onChange={(e) => setDomainsText(e.target.value)}
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
              onChange={(e) => setFormData({ ...formData, collectUserInfo: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="collectUserInfo" className="!mb-0">
              Collect user name and email before chat
            </Label>
          </div>

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
