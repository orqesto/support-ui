import { useState } from 'react';
import { Mail, Plus, Save, TestTube2, Trash2, Edit, Calendar } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { integrationsService } from '@/services/integrations.service';
import { detectImapConfig, isProviderSupported } from '@/utils/imapProviders';
import { logger } from '@/lib/logger';

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

export const EmailIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [checkingCount, setCheckingCount] = useState(false);
  const [messageCount, setMessageCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);

  const [config, setConfig] = useState<EmailConfig>({
    host: '',
    port: 993,
    user: '',
    password: '',
    secure: true,
    isKnowledgeBase: false,
    searchCriteria: 'UNSEEN',
    maxResults: 500,
    lookbackDays: 30,
    bulkImportDays: 0,
    bulkImportMaxResults: 500,
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editBulkImport, setEditBulkImport] = useState<{
    id: number;
    name: string;
    currentDays: number;
  } | null>(null);
  const [bulkImportDaysInput, setBulkImportDaysInput] = useState<string>('7');

  const emailIntegrations = integrations.filter((int) => int.type === 'email');

  const handleCheckMessagesCount = async () => {
    setCheckingCount(true);
    setMessageCount(null);
    try {
      const result = await integrationsService.testImapConfig({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        secure: config.secure,
        searchCriteria: config.searchCriteria,
        lookbackDays: config.lookbackDays,
      });

      if (result.success && result.data) {
        setMessageCount(result.data.details?.messageCount ?? null);
        onShowAlert({
          open: true,
          title: 'Connection Successful',
          description: result.data.message,
          variant: 'success',
        });
      } else {
        onShowAlert({
          open: true,
          title: 'Connection Failed',
          description: result.data?.message ?? 'Failed to connect to IMAP server',
          variant: 'error',
        });
      }
    } catch (error) {
      onShowAlert({
        open: true,
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to test IMAP connection',
        variant: 'error',
      });
    } finally {
      setCheckingCount(false);
    }
  };

  const handleUpdateBulkImportDays = async () => {
    if (!editBulkImport) {
      return;
    }

    setSaving(true);
    try {
      const days = parseInt(bulkImportDaysInput) || 0;

      await integrationsService.update(editBulkImport.id, {
        config: {
          email: {
            bulkImportDays: days,
          },
        },
      });

      await onRefresh();
      setEditBulkImport(null);

      onShowAlert({
        open: true,
        title: 'Bulk Import Started',
        description: `Will import emails from last ${days === 0 ? 'all time' : `${days} days`}. Check the dashboard for progress.`,
        variant: 'success',
      });
    } catch (error) {
      logger.error('Failed to start bulk import:', error);
      onShowAlert({
        open: true,
        title: 'Bulk Import Failed',
        description: error instanceof Error ? error.message : 'Failed to start bulk import',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setConfig({
      host: '',
      port: 993,
      user: '',
      password: '',
      secure: true,
      isKnowledgeBase: false,
      searchCriteria: 'UNSEEN',
      maxResults: 500,
      lookbackDays: 30,
      bulkImportDays: 0,
      bulkImportMaxResults: 500,
    });
    setShowForm(false);
    setEditingId(null);
    setEditingName(null);
    setMessageCount(null);
    setShowAdvanced(false);
  };

  const loadForEdit = (
    id: number,
    currentConfig: Record<string, unknown>,
    currentName: string,
    isKB: boolean
  ) => {
    setEditingId(id);
    setEditingName(currentName); // Store original name
    // Extract email config from wrapper (backend stores as { email: { host, port, ... } })
    const emailConfig = (currentConfig as { email?: EmailConfig }).email ?? currentConfig;
    // isKnowledgeBase is stored as top-level field in DB, not in config
    setConfig({ ...(emailConfig as EmailConfig), isKnowledgeBase: isKB });
    setShowForm(true);
  };

  const saveIntegration = async () => {
    setSaving(true);
    try {
      // When editing, use existing name; when creating, generate new name
      const integrationName =
        editingId !== null && editingName ? editingName : `Email-${config.user}`;

      // Extract isKnowledgeBase from config (stored separately in DB)
      const { isKnowledgeBase, ...emailConfigOnly } = config;

      const response = await integrationsService.upsert({
        name: integrationName,
        type: 'email',
        enabled: true,
        isKnowledgeBase: isKnowledgeBase ?? false, // Top-level field in DB
        config: {
          email: emailConfigOnly, // Backend expects config wrapped in 'email' key
        },
      });

      if (response.success) {
        await onRefresh();
        resetForm();

        const actionMessage =
          response.action === 'updated'
            ? 'Email integration updated successfully! (Credentials refreshed for existing integration)'
            : 'Email integration created successfully!';

        onShowAlert({
          open: true,
          title: response.action === 'updated' ? 'Updated' : 'Created',
          description: actionMessage,
          variant: response.action === 'updated' ? 'info' : 'success',
        });
      }
    } catch (error) {
      logger.error('Failed to save Email integration:', error);
      onShowAlert({
        open: true,
        title: 'Error',
        description: 'Failed to save Email integration',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (id: number, name: string) => {
    setTesting(id);
    try {
      const response = await integrationsService.test(id);
      if (response.success) {
        onShowAlert({
          open: true,
          title: 'Test Successful',
          description: `${name} connection test successful!`,
          variant: 'success',
        });
      } else {
        onShowAlert({
          open: true,
          title: 'Test Failed',
          description: `${name} connection test failed: ${response.message}`,
          variant: 'error',
        });
      }
    } catch (error) {
      logger.error(`Failed to test ${name} connection:`, error);
      onShowAlert({
        open: true,
        title: 'Test Failed',
        description: `Failed to test ${name} connection`,
        variant: 'error',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) {
      return;
    }

    const { id, name } = deleteConfirm;
    setDeleting(id);
    setDeleteConfirm(null);

    try {
      const response = await integrationsService.delete(id, 'email');
      if (response.success) {
        await onRefresh();
      } else {
        onShowAlert({
          open: true,
          title: 'Error',
          description: `Failed to delete ${name}: ${response.error ?? 'Unknown error'}`,
          variant: 'error',
        });
      }
    } catch (error) {
      logger.error(`Failed to delete ${name}:`, error);
      onShowAlert({
        open: true,
        title: 'Error',
        description: `Failed to delete ${name}. Check console for details.`,
        variant: 'error',
      });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <Mail className="w-5 h-5 text-blue-600" />
              Email Accounts (IMAP)
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Email
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailIntegrations.length > 0 && (
            <div className="space-y-2">
              {emailIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex justify-between items-center p-3 rounded-lg border"
                >
                  <div className="flex gap-3 items-center">
                    <div
                      className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <div>
                      <div className="flex gap-2 items-center">
                        <p className="font-medium">
                          {(integration.config as { email?: EmailConfig }).email?.user ??
                            integration.name}
                        </p>
                        {integration.departmentRole && (
                          <DepartmentBadge department={integration.departmentRole} size="sm" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(integration.config as { email?: EmailConfig }).email?.host ??
                          'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const emailConfig = (integration.config as { email?: EmailConfig }).email;
                        const currentDays = emailConfig?.bulkImportDays ?? 0;
                        setEditBulkImport({
                          id: integration.id,
                          name: integration.name,
                          currentDays,
                        });
                        setBulkImportDaysInput('7');
                      }}
                      title="Bulk import historical emails"
                    >
                      <Calendar className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        loadForEdit(
                          integration.id,
                          integration.config as Record<string, unknown>,
                          integration.name,
                          integration.isKnowledgeBase ?? false
                        )
                      }
                      disabled={editingId === integration.id}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(integration.id, integration.name)}
                      isLoading={testing === integration.id}
                      disabled={!integration.hasCredentials}
                    >
                      <TestTube2 className="w-4 h-4" />
                      Poke
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDeleteConfirm({ id: integration.id, name: integration.name })
                      }
                      isLoading={deleting === integration.id}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showForm && (
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
                    onChange={(e) => setConfig({ ...config, host: e.target.value })}
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
                    onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
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
                    onChange={(e) => {
                      const email = e.target.value;
                      const detected = detectImapConfig(email);
                      if (detected) {
                        // Auto-fill IMAP settings for recognized providers
                        setConfig({
                          ...config,
                          user: email,
                          host: detected.host,
                          port: detected.port,
                          secure: detected.secure,
                        });
                      } else {
                        // Just update email if provider not recognized
                        setConfig({ ...config, user: email });
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
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="•••••••••"
                  />
                </div>
              </div>

              {/* Advanced Settings Toggle */}
              <div className="pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
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
                      onChange={(value) => setConfig({ ...config, searchCriteria: value })}
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
                      onChange={(value) => setConfig({ ...config, lookbackDays: parseInt(value) })}
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
                      onChange={(e) =>
                        setConfig({ ...config, maxResults: parseInt(e.target.value) || 500 })
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
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          bulkImportMaxResults: parseInt(e.target.value) || 500,
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
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              smtp: {
                                ...config.smtp,
                                host: e.target.value,
                                port: config.smtp?.port ?? 587,
                                user: config.smtp?.user ?? '',
                                password: config.smtp?.password ?? '',
                                secure: config.smtp?.secure ?? false,
                              },
                            })
                          }
                          className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                          placeholder="smtp.gmail.com or mail.privateemail.com"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">SMTP Port</label>
                        <input
                          type="number"
                          value={config.smtp?.port ?? 587}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              smtp: {
                                ...config.smtp,
                                host: config.smtp?.host ?? '',
                                port: parseInt(e.target.value) || 587,
                                user: config.smtp?.user ?? '',
                                password: config.smtp?.password ?? '',
                                secure: config.smtp?.secure ?? false,
                              },
                            })
                          }
                          className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="587 or 465"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">SMTP Username</label>
                        <input
                          type="email"
                          value={config.smtp?.user ?? ''}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              smtp: {
                                ...config.smtp,
                                host: config.smtp?.host ?? '',
                                port: config.smtp?.port ?? 587,
                                user: e.target.value,
                                password: config.smtp?.password ?? '',
                                secure: config.smtp?.secure ?? false,
                              },
                            })
                          }
                          className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                          placeholder="Same as email above"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">SMTP Password</label>
                        <input
                          type="password"
                          value={config.smtp?.password ?? ''}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              smtp: {
                                ...config.smtp,
                                host: config.smtp?.host ?? '',
                                port: config.smtp?.port ?? 587,
                                user: config.smtp?.user ?? '',
                                password: e.target.value,
                                secure: config.smtp?.secure ?? false,
                              },
                            })
                          }
                          className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                          placeholder="•••••••••"
                        />
                      </div>
                      <div className="col-span-2">
                        <div className="flex gap-2 items-center">
                          <input
                            type="checkbox"
                            checked={config.smtp?.secure ?? false}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                smtp: {
                                  ...config.smtp,
                                  host: config.smtp?.host ?? '',
                                  port: config.smtp?.port ?? 587,
                                  user: config.smtp?.user ?? '',
                                  password: config.smtp?.password ?? '',
                                  secure: e.target.checked,
                                },
                              })
                            }
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
                  onChange={(e) => setConfig({ ...config, secure: e.target.checked })}
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
                  onChange={(e) => setConfig({ ...config, isKnowledgeBase: e.target.checked })}
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
                  onClick={handleCheckMessagesCount}
                  isLoading={checkingCount}
                  disabled={!config.host || !config.user || !config.password || saving}
                >
                  <TestTube2 className="mr-2 w-4 h-4" />
                  Check Messages Count
                </Button>
                <Button
                  onClick={saveIntegration}
                  isLoading={saving}
                  disabled={!config.host || !config.user || !config.password}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Email
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {emailIntegrations.length === 0 && !showForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No email accounts configured
            </p>
          )}
        </CardContent>
      </Card>

      {deleteConfirm && (
        <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
          <div className="p-6 mx-4 w-full max-w-md rounded-lg shadow-xl bg-card">
            <h3 className="mb-2 text-lg font-semibold">Delete Integration?</h3>
            <p className="mb-4 text-muted-foreground">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p className="mb-6 text-sm text-red-600">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting === deleteConfirm.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                isLoading={deleting === deleteConfirm.id}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {editBulkImport && (
        <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
          <div className="p-6 mx-4 w-full max-w-md rounded-lg shadow-xl bg-card">
            <h3 className="mb-2 text-lg font-semibold">Bulk Import Emails</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Import historical emails for <strong>{editBulkImport.name}</strong>
            </p>

            <div className="mb-4">
              <ReactSelect
                label="Import emails from:"
                value={bulkImportDaysInput}
                onChange={(value) => setBulkImportDaysInput(value)}
                options={[
                  { value: '7', label: 'Last 7 days' },
                  { value: '30', label: 'Last 30 days' },
                  { value: '90', label: 'Last 90 days' },
                  { value: '0', label: 'All time (may take long)' },
                ]}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                This will temporarily override the checkpoint and import historical emails. After
                completion, normal syncing will resume.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setEditBulkImport(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleUpdateBulkImportDays} isLoading={saving}>
                Start Import
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
