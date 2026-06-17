import { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Plus,
  MoreVertical,
  Trash2,
  TestTube2,
  Calendar,
  Save,
  Building2,
  MessageSquareReply,
} from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { AckReplyEditor } from '@/components/settings/integrations/AckReplyEditor';
import { GmailForm } from '@/components/settings/integrations/GmailForm';
import { SourceDepartmentEditor } from '@/components/settings/integrations/SourceDepartmentEditor';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useCreateSourceDepartments } from '@/hooks/useCreateSourceDepartments';
import { detectBrowser, getPopupUnblockInstructions } from '@/lib/browserDetect';
import { logger } from '@/lib/logger';
import { gmailOAuthService } from '@/services/gmail-oauth.service';
import { integrationsService } from '@/services/integrations.service';

type GmailConfig = {
  isKnowledgeBase?: boolean;
  searchQuery: string;
  maxResults: number;
  pollingMaxPages: number;
  bulkImportDays: number;
};

const defaultConfig: GmailConfig = {
  isKnowledgeBase: false,
  searchQuery: '',
  maxResults: 500,
  pollingMaxPages: 50,
  bulkImportDays: 0,
};

export const GmailIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
  defaultKB,
}: IntegrationCardProps) => {
  const abortRef = useRef(false);
  useEffect(() => {
    abortRef.current = false;
    return () => {
      abortRef.current = true;
    };
  }, []);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [pollingPagesInput, setPollingPagesInput] = useState<string>('50');
  const [maxResultsInput, setMaxResultsInput] = useState<string>('500');
  const [editBulkImport, setEditBulkImport] = useState<{
    id: number;
    name: string;
    currentDays: number;
  } | null>(null);
  const [bulkImportDaysInput, setBulkImportDaysInput] = useState<string>('7');
  const [showMenu, setShowMenu] = useState<number | null>(null);
  const [editDepts, setEditDepts] = useState<number | null>(null);
  const [editAckReply, setEditAckReply] = useState<number | null>(null);
  const [config, setConfig] = useState<GmailConfig>(defaultConfig);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [manualAuthUrl, setManualAuthUrl] = useState<string | null>(null);

  // Centralized create-form department picker state (load + default + selection).
  const deptPicker = useCreateSourceDepartments();

  const gmailIntegrations = integrations.filter(
    (integ) =>
      integ.type === 'gmail' &&
      (defaultKB === undefined || (integ.isKnowledgeBase ?? false) === defaultKB)
  );

  const handleUpdateBulkImportDays = async () => {
    if (!editBulkImport) return;

    setSaving(true);
    try {
      const days = parseInt(bulkImportDaysInput) || 0;

      await integrationsService.update(editBulkImport.id, {
        config: { gmail: { bulkImportDays: days } },
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
      logger.error('Failed to update initial sync range:', error);
      onShowAlert({
        open: true,
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update initial sync range',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setConfig({ ...defaultConfig, isKnowledgeBase: !!defaultKB });
    setPollingPagesInput('50');
    setMaxResultsInput('500');
    setShowForm(false);
  };

  const handleOAuthSuccess = async (data: { email: string; id: number }) => {
    const newIntegrationId = data.id;
    if (newIntegrationId) {
      const assigned = await deptPicker.assignToNewSource(newIntegrationId);
      if (!assigned) {
        onShowAlert({
          open: true,
          title: 'Department assignment failed',
          description:
            'The Gmail account was connected, but department assignment failed. Edit departments from the source list.',
          variant: 'warning',
        });
      }
    }

    try {
      await onRefresh();
    } catch (fetchError) {
      logger.error('Failed to refresh integrations list:', fetchError);
    }

    if (abortRef.current) return;

    await new Promise((resolve) => setTimeout(resolve, 100));

    resetForm();

    onShowAlert({
      open: true,
      title: 'Success',
      description: `Gmail account connected successfully!\n\n${data.email ?? 'Account'} has been added.`,
      variant: 'success',
    });
  };

  const handleGmailOAuth = async () => {
    setSaving(true);
    setPopupBlocked(false);
    try {
      const response = await gmailOAuthService.connectWithPopup({
        searchQuery: config.searchQuery || '',
        maxResults: config.maxResults,
        pollingMaxPages: config.pollingMaxPages,
        bulkImportDays: config.bulkImportDays,
        isKnowledgeBase: config.isKnowledgeBase,
      });

      if (abortRef.current) return;

      if (response.success && response.data) {
        await handleOAuthSuccess(response.data);
      } else if (response.error === 'POPUP_BLOCKED') {
        // Surface the retry banner; don't show a generic alert.
        setPopupBlocked(true);
      } else {
        logger.error('Gmail OAuth failed:', response);
        onShowAlert({
          open: true,
          title: 'Gmail Connection Failed',
          description: `Failed to connect Gmail: ${response.error ?? 'Unknown error'}\n\nPlease check if you're logged in with a valid account.`,
          variant: 'error',
        });
      }
    } catch (error) {
      if (abortRef.current) return;
      logger.error('Failed to connect Gmail:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onShowAlert({
        open: true,
        title: 'Gmail Connection Failed',
        description: `Failed to connect Gmail: ${errorMsg}`,
        variant: 'error',
      });
    } finally {
      if (!abortRef.current) setSaving(false);
    }
  };

  const handleGmailRedirect = async () => {
    setRedirecting(true);
    const response = await gmailOAuthService.redirectToOAuth({
      searchQuery: config.searchQuery || '',
      maxResults: config.maxResults,
      pollingMaxPages: config.pollingMaxPages,
      bulkImportDays: config.bulkImportDays,
      isKnowledgeBase: config.isKnowledgeBase,
    });
    setRedirecting(false);
    if (response.success && response.data?.authUrl) {
      // Render a manual anchor as a safety net: if the scripted nav above is blocked
      // by a privacy extension, the user can click this link to navigate explicitly.
      // (When the redirect works, the page is gone before this state renders.)
      setManualAuthUrl(response.data.authUrl);
    } else {
      onShowAlert({
        open: true,
        title: 'Gmail Connection Failed',
        description: `Failed to start redirect flow: ${response.error ?? 'Unknown error'}`,
        variant: 'error',
      });
    }
  };

  // On mount, finish any redirect-flow OAuth that landed back here via OAuthCallbackPage.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await gmailOAuthService.consumePendingRedirectResult();
      if (cancelled || !result) return;
      if (result.success && result.data) {
        await handleOAuthSuccess(result.data);
      } else {
        onShowAlert({
          open: true,
          title: 'Gmail Connection Failed',
          description: `Failed to finish Gmail OAuth: ${result.error ?? 'Unknown error'}`,
          variant: 'error',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only run this on mount — the redirect result is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testConnection = async (id: number, name: string) => {
    try {
      const response = await integrationsService.test(id, 'gmail');
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
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

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
          <div className="flex justify-between items-center gap-1">
            <CardTitle className="flex gap-2 items-center text-md md:text-lg lg:text-xl ">
              <Mail className="w-5 h-5 text-red-600 " />
              {defaultKB ? 'Gmail KB Sources (OAuth2)' : 'Gmail Accounts (OAuth2)'}
            </CardTitle>
            <Button
              size="sm"
              className="py-5"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Gmail
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {gmailIntegrations.length > 0 && (
            <div className="space-y-2">
              {gmailIntegrations.map((integration) => (
                <div key={integration.id}>
                  <div className="flex justify-between items-center p-3 rounded-lg border">
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <div className="flex gap-2 items-center">
                          <p className="font-medium">
                            {(integration.config as { user?: string }).user ?? integration.name}
                          </p>
                          {typeof integration.departmentId === 'number' && (
                            <DepartmentBadge departmentId={integration.departmentId} size="sm" />
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
                            const query = gmailConfig?.searchQuery ?? '';
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
                              <span className="ml-2 text-muted-foreground">
                                📅 Bulk: {bulkDays}d
                              </span>
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
                              onKeyDown={(event) => event.key === 'Escape' && setShowMenu(null)}
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
                                  Initial Sync Range
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
                                  className="flex items-center px-3 py-2 w-full text-sm hover:bg-accent"
                                  onClick={() => {
                                    setEditDepts(integration.id);
                                    setShowMenu(null);
                                  }}
                                >
                                  <Building2 className="mr-2 w-4 h-4" />
                                  Assign Departments
                                </button>
                                <button
                                  className="flex items-center px-3 py-2 w-full text-sm hover:bg-accent"
                                  onClick={() => {
                                    setEditAckReply(integration.id);
                                    setShowMenu(null);
                                  }}
                                >
                                  <MessageSquareReply className="mr-2 w-4 h-4" />
                                  Auto-reply Template
                                </button>
                                <button
                                  className="flex items-center px-3 py-2 w-full text-sm text-red-600 hover:bg-accent"
                                  onClick={() => {
                                    setDeleteConfirm({
                                      id: integration.id,
                                      name: integration.name,
                                    });
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
                  {editDepts === integration.id && (
                    <SourceDepartmentEditor
                      sourceId={integration.id}
                      onClose={() => setEditDepts(null)}
                      onSaved={() => {
                        setEditDepts(null);
                        void onRefresh();
                      }}
                    />
                  )}
                  {editAckReply === integration.id && (
                    <AckReplyEditor
                      sourceId={integration.id}
                      initial={{
                        autoReplyEnabled: integration.autoReplyEnabled,
                        autoReplySubject: integration.autoReplySubject,
                        autoReplyBody: integration.autoReplyBody,
                      }}
                      onClose={() => setEditAckReply(null)}
                      onSaved={async () => {
                        setEditAckReply(null);
                        await onRefresh();
                      }}
                      onShowAlert={onShowAlert}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {popupBlocked && (
            <div className="p-3 mb-3 text-sm border rounded-md border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="font-medium">Your browser blocked the OAuth popup.</div>
              <div className="mt-1">{getPopupUnblockInstructions(detectBrowser())}</div>
              <div className="mt-2">
                <button
                  type="button"
                  onClick={handleGmailOAuth}
                  disabled={saving || redirecting}
                  className="font-medium underline hover:no-underline disabled:opacity-50"
                >
                  Try the popup again
                </button>
                {' or '}
                <button
                  type="button"
                  onClick={handleGmailRedirect}
                  disabled={saving || redirecting}
                  className="font-medium underline hover:no-underline disabled:opacity-50"
                >
                  continue without popup
                </button>
                {' (this redirects the whole page and may clear unsaved settings).'}
              </div>
              {manualAuthUrl && (
                <div className="pt-2 mt-2 border-t border-amber-300/60 dark:border-amber-700/60">
                  Page didn't navigate?{' '}
                  <a
                    href={manualAuthUrl}
                    className="font-medium underline hover:no-underline"
                  >
                    Open Google in this tab
                  </a>
                  {' — a manual click bypasses extensions that block scripted redirects.'}
                </div>
              )}
            </div>
          )}

          {showForm && (
            <GmailForm
              config={config}
              saving={saving}
              pollingPagesInput={pollingPagesInput}
              maxResultsInput={maxResultsInput}
              defaultKB={!!defaultKB}
              departments={deptPicker.departments}
              departmentsLoading={deptPicker.loading}
              selectedDepartmentIds={deptPicker.selectedIds}
              defaultDepartmentId={deptPicker.defaultId}
              onConfigChange={setConfig}
              onPollingPagesChange={setPollingPagesInput}
              onPollingPagesBlur={() => {
                const value = parseInt(pollingPagesInput) || 50;
                const validated = Math.min(Math.max(value, 1), 200);
                setConfig({ ...config, pollingMaxPages: validated });
                setPollingPagesInput(validated.toString());
              }}
              onMaxResultsChange={setMaxResultsInput}
              onMaxResultsBlur={() => {
                const value = parseInt(maxResultsInput) || 500;
                const validated = Math.min(Math.max(value, 1), 500);
                setConfig({ ...config, maxResults: validated });
                setMaxResultsInput(validated.toString());
              }}
              onSelectedDepartmentsChange={deptPicker.setSelectedIds}
              onDefaultDepartmentChange={deptPicker.setDefaultId}
              onConnect={handleGmailOAuth}
              onCancel={resetForm}
            />
          )}

          {gmailIntegrations.length === 0 && !showForm && (
            <p className="py-2 text-sm text-center text-muted-foreground">
              No Gmail accounts connected
            </p>
          )}

          {/* Initial Sync Range Edit Modal */}
          {editBulkImport && (
            <div className="flex fixed inset-0 z-50 justify-center items-center bg-black/50">
              <div className="p-6 w-full max-w-md rounded-lg border shadow-lg bg-card">
                <h3 className="mb-4 text-lg font-semibold">Change Initial Sync Range</h3>
                <p className="mb-4 text-sm text-muted-foreground">{editBulkImport.name}</p>
                <div className="space-y-4">
                  <div>
                    <ReactSelect
                      label="Historical Import Range"
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
                      How far back to fetch emails on first connect. Set to &quot;All Time&quot; to
                      fetch everything (may take a while).
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
