import { TestTube2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { detectImapConfig, isProviderSupported } from '@/utils/imapProviders';

type EmailConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
  isKnowledgeBase?: boolean;
  searchCriteria?: string;
  maxResults?: number;
  lookbackDays?: number;
  bulkImportDays?: number;
  bulkImportMaxResults?: number;
  smtp?: {
    host: string;
    port: number;
    user: string;
    password: string;
    secure: boolean;
  };
};

const searchCriteriaOptions = [
  { value: 'UNSEEN', label: 'Unread only (recommended)' },
  { value: 'ALL', label: 'All messages' },
  { value: 'SEEN', label: 'Read only' },
  { value: 'FLAGGED', label: 'Flagged/starred only' },
];

const lookbackOptions = [
  { value: 7, label: 'Last 7 Days' },
  { value: 30, label: 'Last 30 Days' },
  { value: 90, label: 'Last 90 Days' },
  { value: 180, label: 'Last 6 Months' },
  { value: 365, label: 'Last Year' },
  { value: 0, label: 'All Time (slow)' },
];

type EmailFormProps = {
  config: EmailConfig;
  editingId: number | null;
  saving: boolean;
  checkingCount: boolean;
  messageCount: number | null;
  showAdvanced: boolean;
  onConfigChange: (config: EmailConfig) => void;
  onToggleAdvanced: () => void;
  onCheckMessagesCount: () => void;
  onSave: () => void;
  onCancel: () => void;
};

export const EmailForm = ({
  config,
  editingId,
  saving,
  checkingCount,
  messageCount,
  showAdvanced,
  onConfigChange,
  onToggleAdvanced,
  onCheckMessagesCount,
  onSave,
  onCancel,
}: EmailFormProps) => {
  const setSmtpField = (field: Partial<NonNullable<EmailConfig['smtp']>>) => {
    onConfigChange({
      ...config,
      smtp: {
        host: config.smtp?.host ?? '',
        port: config.smtp?.port ?? 587,
        user: config.smtp?.user ?? '',
        password: config.smtp?.password ?? '',
        secure: config.smtp?.secure ?? false,
        ...field,
      },
    });
  };

  return (
    <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
      <h4 className="font-medium">
        {editingId ? 'Edit Email Account' : 'Add New Email Account'}
      </h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="host" className="text-sm font-medium">
            IMAP Host
          </label>
          <input
            type="text"
            value={config.host}
            onChange={(event) => onConfigChange({ ...config, host: event.target.value })}
            className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            placeholder="imap.gmail.com"
          />
        </div>
        <div>
          <label htmlFor="port" className="text-sm font-medium">
            Port
          </label>
          <input
            type="number"
            value={config.port}
            onChange={(event) => onConfigChange({ ...config, port: parseInt(event.target.value) })}
            className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            placeholder="993"
          />
        </div>
        <div>
          <label htmlFor="user" className="text-sm font-medium">
            Email{' '}
            {isProviderSupported(config.user) && (
              <span className="text-xs text-green-500">✓ Auto-detected</span>
            )}
          </label>
          <input
            type="email"
            value={config.user}
            onChange={(event) => {
              const email = event.target.value;
              const detected = detectImapConfig(email);
              if (detected) {
                onConfigChange({
                  ...config,
                  user: email,
                  host: detected.host,
                  port: detected.port,
                  secure: detected.secure,
                });
              } else {
                onConfigChange({ ...config, user: email });
              }
            }}
            className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            placeholder="support@gmail.com"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Supported: Gmail, Outlook, Yahoo, iCloud, and more
          </p>
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password / App Password
          </label>
          <input
            type="password"
            value={config.password}
            onChange={(event) => onConfigChange({ ...config, password: event.target.value })}
            className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            placeholder="•••••••••"
          />
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className="flex gap-1 items-center text-sm text-muted-foreground hover:text-foreground"
        >
          {showAdvanced ? '▼' : '▶'} Advanced Settings
        </button>
      </div>

      {/* Advanced Settings Panel */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
          <div>
            <ReactSelect
              label="Email Filter"
              value={config.searchCriteria ?? 'UNSEEN'}
              onChange={(value) => onConfigChange({ ...config, searchCriteria: value })}
              options={searchCriteriaOptions}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Which emails to sync (read/unread status)
            </p>
          </div>

          <div>
            <ReactSelect
              label="Time Range"
              value={(config.lookbackDays ?? 30).toString()}
              onChange={(value) =>
                onConfigChange({ ...config, lookbackDays: parseInt(value) })
              }
              options={lookbackOptions.map((opt) => ({
                value: opt.value.toString(),
                label: opt.label,
              }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              How far back in time (combines with filter)
            </p>
          </div>

          <div>
            <label htmlFor="maxResults" className="text-sm font-medium">
              Max Results per Sync
            </label>
            <input
              type="number"
              value={config.maxResults ?? 500}
              onChange={(event) =>
                onConfigChange({ ...config, maxResults: parseInt(event.target.value) || 500 })
              }
              className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
              min="1"
              max="1000"
            />
            <p className="mt-1 text-xs text-muted-foreground">Limit emails per sync</p>
          </div>

          <div>
            <label htmlFor="bulkImportMaxResults" className="text-sm font-medium">
              Bulk Import Max Results
            </label>
            <input
              type="number"
              value={config.bulkImportMaxResults ?? 500}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  bulkImportMaxResults: parseInt(event.target.value) || 500,
                })
              }
              className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
              min="1"
              max="2000"
            />
            <p className="mt-1 text-xs text-muted-foreground">Max for bulk imports</p>
          </div>

          {/* SMTP Configuration for Sending Replies */}
          <div className="col-span-2 pt-4 border-t">
            <h5 className="mb-3 text-sm font-semibold">
              📤 SMTP Settings (For Sending Replies)
            </h5>
            <p className="mb-3 text-xs text-muted-foreground">
              Configure SMTP to send replies from this email address. Leave empty to use
              global SMTP settings.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">SMTP Host</label>
                <input
                  type="text"
                  value={config.smtp?.host ?? ''}
                  onChange={(event) => setSmtpField({ host: event.target.value })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  placeholder="smtp.gmail.com or mail.privateemail.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium">SMTP Port</label>
                <input
                  type="number"
                  value={config.smtp?.port ?? 587}
                  onChange={(event) => setSmtpField({ port: parseInt(event.target.value) || 587 })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="587 or 465"
                />
              </div>
              <div>
                <label className="text-sm font-medium">SMTP Username</label>
                <input
                  type="email"
                  value={config.smtp?.user ?? ''}
                  onChange={(event) => setSmtpField({ user: event.target.value })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  placeholder="Same as email above"
                />
              </div>
              <div>
                <label className="text-sm font-medium">SMTP Password</label>
                <input
                  type="password"
                  value={config.smtp?.password ?? ''}
                  onChange={(event) => setSmtpField({ password: event.target.value })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  placeholder="•••••••••"
                />
              </div>
              <div className="col-span-2">
                <div className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={config.smtp?.secure ?? false}
                    onChange={(event) => setSmtpField({ secure: event.target.checked })}
                    className="rounded"
                  />
                  <label className="text-sm">
                    Use SSL (port 465) instead of TLS (port 587)
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="checkbox"
          checked={config.secure}
          onChange={(event) => onConfigChange({ ...config, secure: event.target.checked })}
          className="rounded"
        />
        <label htmlFor="secure" className="text-sm">
          Use SSL/TLS
        </label>
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="checkbox"
          checked={config.isKnowledgeBase ?? false}
          onChange={(event) => onConfigChange({ ...config, isKnowledgeBase: event.target.checked })}
          className="rounded"
        />
        <label htmlFor="isKnowledgeBase" className="text-sm font-medium">
          📚 Use as Knowledge Base Source
        </label>
      </div>
      <p className="-mt-2 ml-6 text-xs text-muted-foreground">
        Extract Q&A pairs and documents from conversations for AI-powered support responses
      </p>

      {/* Message Count Display */}
      {messageCount !== null && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200">
            ✅ Found {messageCount} message{messageCount !== 1 ? 's' : ''} matching your
            criteria
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={onCheckMessagesCount}
          isLoading={checkingCount}
          disabled={!config.host || !config.user || !config.password || saving}
        >
          <TestTube2 className="mr-2 w-4 h-4" />
          Check Messages Count
        </Button>
        <Button
          onClick={onSave}
          isLoading={saving}
          disabled={!config.host || !config.user || !config.password}
        >
          <Save className="mr-2 w-4 h-4" />
          {editingId ? 'Update' : 'Save'} Email
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};
