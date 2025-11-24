import { useState } from 'react';
import { Mail, Plus, MoreVertical, Trash2, TestTube2, Calendar, Save } from 'lucide-react';
import DepartmentBadge from '@/components/DepartmentBadge';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { gmailOAuthService } from '@/services/gmail-oauth.service';
import { integrationsService } from '@/services/integrations.service';

type GmailConfig = {
  clientId: string;
  clientSecret: string;
  isKnowledgeBase?: boolean;
  searchQuery: string; // Gmail search filter
  lookbackDays?: number; // Time-based limit (optional, adds to search)
  maxResults: number;
  pollingMaxPages: number;
  bulkImportDays: number;
  bulkImportMaxResults: number;
};

const searchQueryOptions = [
  { value: 'is:unread', label: 'Unread only (recommended)' },
  { value: 'in:inbox', label: 'All inbox messages' },
  { value: 'is:unread OR in:inbox', label: 'Unread + All inbox' },
  { value: '', label: 'Everything (all folders)' },
];

const lookbackOptions = [
  { value: 7, label: 'Last 7 Days' },
  { value: 30, label: 'Last 30 Days' },
  { value: 90, label: 'Last 90 Days' },
  { value: 180, label: 'Last 6 Months' },
  { value: 365, label: 'Last Year' },
  { value: 0, label: 'All Time (slow)' },
];

export const GmailIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [pollingPagesInput, setPollingPagesInput] = useState<string>('200');
  const [maxResultsInput, setMaxResultsInput] = useState<string>('500');
  const [bulkImportMaxResultsInput, setBulkImportMaxResultsInput] = useState<string>('500');
  const [editBulkImport, setEditBulkImport] = useState<{
    id: number;
    name: string;
    currentDays: number;
  } | null>(null);
  const [bulkImportDaysInput, setBulkImportDaysInput] = useState<string>('7');
  const [showMenu, setShowMenu] = useState<number | null>(null);

  const [config, setConfig] = useState<GmailConfig>({
    clientId: '',
    clientSecret: '',
    isKnowledgeBase: false,
    searchQuery: 'is:unread',
    lookbackDays: 30,
    maxResults: 500,
    pollingMaxPages: 200,
    bulkImportDays: 0,
    bulkImportMaxResults: 500,
  });

  const gmailIntegrations = integrations.filter((i) => i.type === 'gmail');

  const handleUpdateBulkImportDays = async () => {
    if (!editBulkImport) {
      return;
    }

    setSaving(true);
    try {
      const days = parseInt(bulkImportDaysInput) || 0;

      await integrationsService.update(editBulkImport.id, {
        config: {
          gmail: {
            bulkImportDays: days,
          },
        },
      });

      await onRefresh();
      setEditBulkImport(null);

      onShowAlert({
        open: true,
        title: 'Success',
        description: `Bulk import days updated to ${days === 0 ? 'All time' : `${days} days`}`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to update bulk import days:', error);
      onShowAlert({
        open: true,
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update bulk import days',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setConfig({
      clientId: '',
      clientSecret: '',
      isKnowledgeBase: false,
      searchQuery: 'is:unread',
      lookbackDays: 30,
      maxResults: 500,
      pollingMaxPages: 200,
      bulkImportDays: 0,
      bulkImportMaxResults: 500,
    });
    setPollingPagesInput('200');
    setMaxResultsInput('500');
    setBulkImportMaxResultsInput('500');
    setShowForm(false);
  };

  const handleGmailOAuth = async () => {
    setSaving(true);
    try {
      // Combine search query with time range
      let finalQuery = config.searchQuery || '';
      if (config.lookbackDays && config.lookbackDays > 0) {
        const timestamp = Math.floor(Date.now() / 1000 - config.lookbackDays * 86400);
        const timeFilter = `after:${timestamp}`;
        finalQuery = finalQuery ? `${finalQuery} ${timeFilter}` : timeFilter;
      }

      const response = await gmailOAuthService.connectWithPopup(
        config.clientId,
        config.clientSecret,
        finalQuery,
        config.maxResults,
        config.pollingMaxPages,
        config.bulkImportDays,
        config.bulkImportMaxResults
      );

      if (response.success) {
        try {
          await onRefresh();
        } catch (fetchError) {
          console.error('Failed to refresh integrations list:', fetchError);
        }

        await new Promise((resolve) => setTimeout(resolve, 100));

        resetForm();

        onShowAlert({
          open: true,
          title: 'Success',
          description: `Gmail account connected successfully!\n\n${response.data?.email ?? 'Account'} has been added.`,
          variant: 'success',
        });
      } else {
        console.error('Gmail OAuth failed:', response);
        onShowAlert({
          open: true,
          title: 'Gmail Connection Failed',
          description: `Failed to connect Gmail: ${response.error ?? 'Unknown error'}\n\nPlease check if you're logged in with a valid account.`,
          variant: 'error',
        });
      }
    } catch (error) {
      console.error('Failed to connect Gmail:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onShowAlert({
        open: true,
        title: 'Gmail Connection Failed',
        description: `Failed to connect Gmail: ${errorMsg}`,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (id: number, name: string) => {
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
      console.error(`Failed to test ${name} connection:`, error);
      onShowAlert({
        open: true,
        title: 'Test Failed',
        description: `Failed to test ${name} connection`,
        variant: 'error',
      });
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
      const response = await integrationsService.delete(id, 'gmail');
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
      console.error(`Failed to delete ${name}:`, error);
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
          <div className="flex justify-between items-center gap-1">
          <CardTitle className="flex gap-2 items-center text-md md:text-lg lg:text-xl ">
              <Mail className="w-5 h-5 text-red-600 " />
              Gmail Accounts (OAuth2)
            </CardTitle>
            <Button
              size="sm"
              className='py-5'
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4 hidden block:sm" />
              Add Gmail
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {gmailIntegrations.length > 0 && (
            <div className="space-y-2">
              {gmailIntegrations.map((integration) => (
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
                          {(integration.config as { user?: string }).user ?? integration.name}
                        </p>
                        {integration.departmentRole && (
                          <DepartmentBadge department={integration.departmentRole} size="sm" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        OAuth2 •{' '}
                        {(() => {
                          const gmailConfig = (
                            integration.config as {
                              gmail?: { lookbackDays?: number; searchQuery?: string };
                            }
                          ).gmail;
                          const lookbackDays = gmailConfig?.lookbackDays;
                          if (lookbackDays !== undefined) {
                            if (lookbackDays === 0) return 'All Time';
                            if (lookbackDays === 7) return 'Last 7 Days';
                            if (lookbackDays === 30) return 'Last 30 Days';
                            if (lookbackDays === 90) return 'Last 90 Days';
                            if (lookbackDays === 180) return 'Last 6 Months';
                            if (lookbackDays === 365) return 'Last Year';
                            return `${lookbackDays} days`;
                          }
                          // Fallback to old searchQuery for backward compatibility
                          const query = gmailConfig?.searchQuery ?? 'is:unread';
                          return query === '' ? 'Everything' : query;
                        })()}
                        {(() => {
                          const gmailConfig = (
                            integration.config as { gmail?: { bulkImportDays?: number } }
                          ).gmail;
                          const bulkDays = gmailConfig?.bulkImportDays ?? 0;
                          return bulkDays === 0 ? (
                            <span className="ml-2 font-medium text-orange-600">
                              ⚠️ Bulk: All time
                            </span>
                          ) : (
                            <span className="ml-2 text-muted-foreground">📅 Bulk: {bulkDays}d</span>
                          );
                        })()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="relative">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setShowMenu(showMenu === integration.id ? null : integration.id)
                        }
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                      {showMenu === integration.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setShowMenu(null)}
                            onKeyDown={(e) => e.key === 'Escape' && setShowMenu(null)}
                            role="button"
                            tabIndex={0}
                            aria-label="Close menu"
                          />
                          <div className="absolute right-0 z-20 mt-1 w-48 bg-white rounded-md border shadow-lg dark:bg-gray-800">
                            <div className="py-1">
                              <button
                                className="flex items-center px-3 py-2 w-full text-sm hover:bg-accent"
                                onClick={() => {
                                  const gmailConfig = (
                                    integration.config as { gmail?: { bulkImportDays?: number } }
                                  ).gmail;
                                  const bulkDays = gmailConfig?.bulkImportDays ?? 0;
                                  setEditBulkImport({
                                    id: integration.id,
                                    name: integration.name,
                                    currentDays: bulkDays,
                                  });
                                  setBulkImportDaysInput(bulkDays.toString());
                                  setShowMenu(null);
                                }}
                              >
                                <Calendar className="mr-2 w-4 h-4" />
                                Bulk Import Days
                              </button>
                              <button
                                className="flex items-center px-3 py-2 w-full text-sm hover:bg-accent"
                                onClick={() => {
                                  void testConnection(integration.id, integration.name);
                                  setShowMenu(null);
                                }}
                              >
                                <TestTube2 className="mr-2 w-4 h-4" />
                                Test Connection
                              </button>
                              <button
                                className="flex items-center px-3 py-2 w-full text-sm text-red-600 hover:bg-accent"
                                onClick={() => {
                                  setDeleteConfirm({ id: integration.id, name: integration.name });
                                  setShowMenu(null);
                                }}
                              >
                                <Trash2 className="mr-2 w-4 h-4" />
                                Delete
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">Add Gmail Account via OAuth2</h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="clientId" className="text-sm font-medium">
                    Google OAuth2 Client ID
                  </label>
                  <input
                    type="text"
                    value={config.clientId}
                    onChange={(e) => setConfig({ ...config, clientId: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="123456789-abc.apps.googleusercontent.com"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    From Google Cloud Console → APIs & Services → Credentials
                  </p>
                </div>
                <div>
                  <label htmlFor="clientSecret" className="text-sm font-medium">
                    Google OAuth2 Client Secret
                  </label>
                  <input
                    type="password"
                    value={config.clientSecret}
                    onChange={(e) => setConfig({ ...config, clientSecret: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="GOCSPX-..."
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Client secret from the same OAuth2 credentials
                  </p>
                </div>

                <div className="flex gap-2 items-center pt-2">
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
                  Extract Q&A pairs and documents from conversations for AI-powered support
                  responses
                </p>

                <div>
                  <ReactSelect
                    label="Email Filter"
                    value={config.searchQuery}
                    onChange={(value) => setConfig({ ...config, searchQuery: value })}
                    options={searchQueryOptions}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Which emails to sync (unread, inbox, etc.)
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
                    How far back in time (combines with filter above)
                  </p>
                </div>
                <div>
                  <label htmlFor="maxResults" className="text-sm font-medium">
                    Max Results per Sync
                  </label>
                  <input
                    id="maxResults"
                    type="number"
                    value={maxResultsInput}
                    onChange={(e) => setMaxResultsInput(e.target.value)}
                    onBlur={() => {
                      const value = parseInt(maxResultsInput) || 500;
                      const validated = Math.min(Math.max(value, 1), 500);
                      setConfig({ ...config, maxResults: validated });
                      setMaxResultsInput(validated.toString());
                    }}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="500"
                    min="1"
                    max="500"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Messages fetched per page during regular polling
                  </p>
                </div>

                {/* Polling Settings */}
                <div className="pt-3 border-t">
                  <h5 className="mb-3 text-sm font-semibold">Regular Polling Settings</h5>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="pollingMaxPages" className="text-sm font-medium">
                        Max Pages to Poll
                      </label>
                      <input
                        id="pollingMaxPages"
                        type="number"
                        value={pollingPagesInput}
                        onChange={(e) => {
                          setPollingPagesInput(e.target.value);
                        }}
                        onBlur={() => {
                          // Validate and update config on blur
                          const value = parseInt(pollingPagesInput) || 50;
                          const validated = Math.min(Math.max(value, 1), 200);
                          setConfig({ ...config, pollingMaxPages: validated });
                          setPollingPagesInput(validated.toString());
                        }}
                        className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                        placeholder="50"
                        min="1"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Maximum pages per polling cycle (max: 200). Example: 100 pages × 10/page =
                        1,000 messages.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bulk Import Settings */}
                <div className="pt-3 border-t">
                  <h5 className="mb-3 text-sm font-semibold">Bulk Import Settings</h5>
                  <div className="space-y-3">
                    <div>
                      <ReactSelect
                        label="Import Time Range (Days)"
                        value={config.bulkImportDays.toString()}
                        onChange={(value) =>
                          setConfig({ ...config, bulkImportDays: parseInt(value) })
                        }
                        options={[
                          { value: '0', label: 'All Time' },
                          { value: '7', label: 'Last 7 Days' },
                          { value: '30', label: 'Last 30 Days' },
                          { value: '90', label: 'Last 90 Days' },
                          { value: '180', label: 'Last 6 Months' },
                          { value: '365', label: 'Last Year' },
                        ]}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        How far back to import emails when using bulk import (0 = all emails)
                      </p>
                    </div>
                    <div>
                      <label htmlFor="bulkImportMaxResults" className="text-sm font-medium">
                        Bulk Import Page Size
                      </label>
                      <input
                        id="bulkImportMaxResults"
                        type="number"
                        value={bulkImportMaxResultsInput}
                        onChange={(e) => setBulkImportMaxResultsInput(e.target.value)}
                        onBlur={() => {
                          const value = parseInt(bulkImportMaxResultsInput) || 500;
                          const validated = Math.min(Math.max(value, 100), 500);
                          setConfig({ ...config, bulkImportMaxResults: validated });
                          setBulkImportMaxResultsInput(validated.toString());
                        }}
                        className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                        placeholder="500"
                        min="100"
                        max="500"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Messages per page during bulk import (max: 500, recommended for large
                        imports)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-3 text-xs bg-yellow-50 rounded border border-yellow-200">
                <p className="font-medium text-yellow-900">ℹ️ OAuth2 Setup Required</p>
                <p className="mt-1 text-yellow-700">
                  You need to create OAuth2 credentials in Google Cloud Console first.
                </p>
                <a
                  href="https://developers.google.com/gmail/api/quickstart/nodejs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-yellow-700 hover:underline"
                >
                  📖 Setup Guide →
                </a>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleGmailOAuth}
                  isLoading={saving}
                  disabled={!config.clientId || !config.clientSecret}
                >
                  <Save className="mr-2 w-4 h-4" />
                  Connect with Google
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {gmailIntegrations.length === 0 && !showForm && (
            <p className="py-2 text-sm text-center text-muted-foreground">
              No Gmail accounts connected
            </p>
          )}

          {/* Bulk Import Days Edit Modal */}
          {editBulkImport && (
            <div className="flex fixed inset-0 z-50 justify-center items-center bg-black/50">
              <div className="p-6 w-full max-w-md rounded-lg border shadow-lg bg-card">
                <h3 className="mb-4 text-lg font-semibold">Change Bulk Import Days</h3>
                <p className="mb-4 text-sm text-muted-foreground">{editBulkImport.name}</p>
                <div className="space-y-4">
                  <div>
                    <ReactSelect
                      label="Import Time Range"
                      value={bulkImportDaysInput}
                      onChange={(value) => setBulkImportDaysInput(value)}
                      options={[
                        { value: '0', label: 'All Time' },
                        { value: '1', label: 'Last 1 Day' },
                        { value: '7', label: 'Last 7 Days' },
                        { value: '30', label: 'Last 30 Days' },
                        { value: '90', label: 'Last 90 Days' },
                        { value: '180', label: 'Last 6 Months' },
                        { value: '365', label: 'Last Year' },
                      ]}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      How far back to fetch emails during bulk import. Set to &quot;All Time&quot;
                      to fetch everything (may take a while).
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleUpdateBulkImportDays} isLoading={saving}>
                      <Save className="mr-2 w-4 h-4" />
                      Update
                    </Button>
                    <Button variant="outline" onClick={() => setEditBulkImport(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
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
    </>
  );
};
