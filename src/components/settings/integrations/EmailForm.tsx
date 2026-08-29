import { TestTube2, Save, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toggle } from '@/components/ui/Toggle';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { detectImapConfig, deriveSmtpDefaults, isProviderSupported } from '@/utils/imapProviders';
import { SourceKbToggle } from '@/components/settings/integrations/SourceKbToggle';
import { DepartmentMultiPicker } from '@/components/shared/DepartmentMultiPicker';
import {
  emailSourceErrors,
  hostError,
  mailboxError,
  portError,
} from '@/utils/mailboxValidation';
import type { Department } from '@/services/department.service';

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

// "All messages" is the default and the recommendation, matching Gmail sources, which fetch
// everything. "Unread only" made the mailbox's read state decide what the product ever saw:
// anyone opening the inbox from Outlook, webmail or a phone marked a message read, and it was
// then never ingested at all. It stays available for anyone who deliberately wants that.
const searchCriteriaOptions = [
  { value: 'ALL', label: 'All messages (recommended)' },
  { value: 'UNSEEN', label: 'Unread only' },
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
  /** Create-only — when editing an existing source, departments are managed via the per-source editor. */
  departments: Department[];
  departmentsLoading?: boolean;
  selectedDepartmentIds: number[];
  defaultDepartmentId: number | undefined;
  /**
   * Which section opened this form ("Active Sources" vs "Knowledge Base Sources").
   * When `true`, the "Use as Knowledge Base Source" checkbox is hidden because
   * the section the user clicked Add in already encodes the choice — leaving
   * the toggle visible makes it look like a contradictory second selector.
   */
  defaultKB?: boolean;
  onConfigChange: (config: EmailConfig) => void;
  onToggleAdvanced: () => void;
  onCheckMessagesCount: () => void;
  onSelectedDepartmentsChange: (next: number[]) => void;
  onDefaultDepartmentChange: (id: number | undefined) => void;
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
  departments,
  departmentsLoading,
  selectedDepartmentIds,
  defaultDepartmentId,
  defaultKB,
  onConfigChange,
  onToggleAdvanced,
  onCheckMessagesCount,
  onSelectedDepartmentsChange,
  onDefaultDepartmentChange,
  onSave,
  onCancel,
}: EmailFormProps) => {
  const isCreating = editingId === null;
  const deptsValid = !isCreating || selectedDepartmentIds.length > 0;
  // What the server will use for replies when the SMTP block below is left empty: this
  // mailbox's own credentials, submitted to the matching host. Shown rather than written
  // into the fields on purpose — an empty block stays a *derived* config, which the backend
  // is allowed to fall back on if the provider refuses it. Typing values in makes them an
  // explicit instruction that is never second-guessed.
  const smtpPreview = deriveSmtpDefaults(config.host);
  // An empty string means "not set" for these fields, so the preview has to win over it —
  // spelled out rather than leaning on `||`, which the nullish-coalescing rule flags.
  const sendingHost = config.smtp?.host?.trim() ? config.smtp.host : smtpPreview?.host;
  const sendingPort = config.smtp?.port ?? smtpPreview?.port;

  /*
   * Block both actions while any field is WRONG — distinct from incomplete, which the
   * presence checks below already cover. Without this the buttons stayed live on a value the
   * server now rejects, which is the round trip this change exists to remove.
   *
   * SMTP is included: it is optional, but a filled-in SMTP host with a scheme prefix is just
   * as broken as an IMAP one, and replies would fail later instead of here.
   */
  const hasFieldErrors =
    emailSourceErrors({
      host: config.host,
      port: Number.isFinite(config.port) ? config.port : '',
      user: config.user,
      password: config.password,
    }).length > 0 ||
    hostError(config.smtp?.host ?? '') !== null ||
    portError(config.smtp?.port ?? 587) !== null ||
    mailboxError(config.smtp?.user ?? '') !== null;

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
      <h4 className="font-medium">{editingId ? 'Edit Email Account' : 'Add New Email Account'}</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Input
            id="host"
            label="IMAP Host"
            type="text"
            value={config.host}
            onChange={(event) => onConfigChange({ ...config, host: event.target.value })}
            error={hostError(config.host) ?? undefined}
            placeholder="imap.gmail.com"
          />
        </div>
        <div>
          <Input
            id="port"
            label="Port"
            type="number"
            // `parseInt('')` is NaN, and the old field stored that — a NaN port reached the
            // API as `null` and the source was saved anyway. Keep an empty box empty.
            value={Number.isFinite(config.port) ? config.port : ''}
            onChange={(event) => {
              const next = event.target.value;
              onConfigChange({ ...config, port: next === '' ? Number.NaN : Number(next) });
            }}
            error={portError(Number.isFinite(config.port) ? config.port : '') ?? undefined}
            placeholder="993"
          />
        </div>
        <div>
          <div className="flex gap-2 items-center mb-1">
            <span className="text-sm font-medium">Email</span>
            {isProviderSupported(config.user) && (
              <span className="text-xs text-green-500">✓ Auto-detected</span>
            )}
          </div>
          {/*
            ⚠️ This was a raw `<input type="email">`. Browsers only enforce `type="email"` on a
            NATIVE FORM SUBMIT, and this screen saves from a button handler with no <form>
            around it — so the attribute validated nothing, and `mailto:support@example.com`
            was accepted, stored, and used as the source's display name. The check is explicit
            now, and the server enforces the same rule independently.
          */}
          <Input
            id="user"
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
            error={mailboxError(config.user) ?? undefined}
            placeholder="support@gmail.com"
          />
          {mailboxError(config.user) === null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Supported: Gmail, Outlook, Yahoo, iCloud, and more
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password / App Password
          </label>
          <PasswordInput
            value={config.password}
            onChange={(event) => onConfigChange({ ...config, password: event.target.value })}
            placeholder="•••••••••"
          />
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <div className="pt-2 border-t">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleAdvanced}
          className="gap-1 items-center p-0 h-auto text-sm text-muted-foreground hover:text-foreground hover:bg-transparent"
        >
          {showAdvanced ? '▼' : '▶'} Advanced Settings
        </Button>
      </div>

      {/* Advanced Settings Panel */}
      {showAdvanced && (
        <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
          <div>
            <ReactSelect
              label="Email Filter"
              value={config.searchCriteria ?? 'ALL'}
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
              onChange={(value) => onConfigChange({ ...config, lookbackDays: parseInt(value) })}
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
            <Input
              id="maxResults"
              label="Max Results per Sync"
              type="number"
              value={config.maxResults ?? 500}
              onChange={(event) =>
                onConfigChange({ ...config, maxResults: parseInt(event.target.value) || 500 })
              }
              min="1"
              max="1000"
            />
            <p className="mt-1 text-xs text-muted-foreground">Limit emails per sync</p>
          </div>

          <div>
            <Input
              id="bulkImportMaxResults"
              label="Initial Sync Page Size"
              type="number"
              value={config.bulkImportMaxResults ?? 500}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  bulkImportMaxResults: parseInt(event.target.value) || 500,
                })
              }
              min="1"
              max="2000"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Max results per page on first connect
            </p>
          </div>

          {/* SMTP Configuration for Sending Replies */}
          <div className="col-span-2 pt-4 border-t">
            <h5 className="mb-3 text-sm font-semibold">📤 SMTP Settings (For Sending Replies)</h5>
            <p className="mb-2 text-xs text-muted-foreground">
              Replies go out from this mailbox using its own credentials — customers reply to the
              address they wrote to. Fill these in only if your provider needs different settings
              for sending than for receiving.
            </p>
            {smtpPreview && config.user && (
              <p className="mb-3 text-xs text-muted-foreground">
                Currently sending as{' '}
                <span className="font-medium text-foreground">{config.user}</span> via{' '}
                <span className="font-medium text-foreground">
                  {sendingHost}:{sendingPort}
                </span>
                .
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="SMTP Host"
                  type="text"
                  value={config.smtp?.host ?? ''}
                  onChange={(event) => setSmtpField({ host: event.target.value })}
                  error={hostError(config.smtp?.host ?? '') ?? undefined}
                  placeholder={smtpPreview?.host ?? 'smtp.gmail.com or mail.privateemail.com'}
                />
              </div>
              <div>
                <Input
                  label="SMTP Port"
                  type="number"
                  value={config.smtp?.port ?? 587}
                  onChange={(event) => setSmtpField({ port: parseInt(event.target.value) || 587 })}
                  error={portError(config.smtp?.port ?? 587) ?? undefined}
                  placeholder="587 or 465"
                />
              </div>
              <div>
                <Input
                  label="SMTP Username"
                  type="email"
                  value={config.smtp?.user ?? ''}
                  onChange={(event) => setSmtpField({ user: event.target.value })}
                  error={mailboxError(config.smtp?.user ?? '') ?? undefined}
                  placeholder={config.user || 'Same as email above'}
                />
              </div>
              <div>
                <label className="text-sm font-medium">SMTP Password</label>
                <PasswordInput
                  value={config.smtp?.password ?? ''}
                  onChange={(event) => setSmtpField({ password: event.target.value })}
                  placeholder="•••••••••"
                />
              </div>
              <div className="col-span-2">
                <Toggle
                  checked={config.smtp?.secure ?? false}
                  onChange={(next) => setSmtpField({ secure: next })}
                  label="Use SSL (port 465) instead of TLS (port 587)"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <Toggle
          checked={config.secure}
          onChange={(next) => onConfigChange({ ...config, secure: next })}
          label="Use SSL/TLS"
        />
      </div>

      {/* Same control as Gmail — see SourceKbToggle. Hidden only when a caller still
          passes defaultKB, which no live caller does since the KB section was merged away. */}
      {!defaultKB && (
        <SourceKbToggle
          checked={config.isKnowledgeBase ?? false}
          onChange={(next) => onConfigChange({ ...config, isKnowledgeBase: next })}
        />
      )}

      {/* Message Count Display */}
      {messageCount !== null && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200">
            ✅ Found {messageCount} message{messageCount !== 1 ? 's' : ''} matching your criteria
          </p>
        </div>
      )}

      {isCreating && (
        <div className="space-y-2 pt-1 border-t">
          <label className="text-sm font-medium flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Departments
          </label>
          <DepartmentMultiPicker
            allDepts={departments}
            selected={selectedDepartmentIds}
            defaultId={defaultDepartmentId}
            loading={departmentsLoading}
            onSelectedChange={onSelectedDepartmentsChange}
            onDefaultChange={onDefaultDepartmentChange}
          />
          {!departmentsLoading && departments.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No active departments. Create one before connecting a source.
            </p>
          )}
          {!departmentsLoading && departments.length > 0 && !deptsValid && (
            <p className="text-xs text-muted-foreground">
              Select at least one department to route messages from this source.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={onCheckMessagesCount}
          isLoading={checkingCount}
          disabled={!config.host || !config.user || !config.password || hasFieldErrors || saving}
        >
          <TestTube2 className="mr-2 w-4 h-4" />
          Check Messages Count
        </Button>
        <Button
          onClick={onSave}
          isLoading={saving}
          disabled={
            !config.host || !config.user || !config.password || !deptsValid || hasFieldErrors
          }
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
