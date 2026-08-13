import { BookOpen, Plus, Power, RefreshCw, Save, TestTube2, Trash2, Edit } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  parseSpaceKeys,
  syncMeta,
} from '@/components/settings/integrations/confluenceCardHelpers';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { useIntegrationCard } from '@/hooks/useIntegrationCard';
import {
  integrationsService,
  type ConfluenceConfig,
} from '@/services/integrations.service';

export const ConfluenceIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const {
    showForm,
    saving,
    testing,
    deleting,
    deleteConfirm,
    editingId,
    config,
    setShowForm,
    setConfig,
    setDeleteConfirm,
    resetForm,
    loadForEdit,
    saveIntegration: saveIntegrationBase,
    testConnection,
    deleteIntegration,
  } = useIntegrationCard<ConfluenceConfig>({
    integrationType: 'confluence',
    integrationDisplayName: 'Confluence Integration',
    initialConfig: {
      baseUrl: '',
      email: '',
      apiToken: '',
      spaceKeys: [],
      syncIntervalMinutes: undefined,
    },
    onRefresh,
    onShowAlert,
  });

  const confluenceIntegrations = integrations.filter((integ) => integ.type === 'confluence');

  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  // Self-hosted: a shared Confluence service account may be configured in backend env. When it
  // is, offer a no-credentials "use the server service account" flow (both options remain).
  const [envConfigured, setEnvConfigured] = useState(false);
  const [useServerAccount, setUseServerAccount] = useState(false);
  // A FAILED status check is not the same as "no service account configured", but both leave
  // envConfigured false and silently hide the toggle. Keep the error so the form can say which
  // it is — a missing org context (platform scope strips X-Organization-Context) 400s here and
  // is otherwise indistinguishable from an unconfigured backend.
  const [envStatusError, setEnvStatusError] = useState<string | null>(null);
  useEffect(() => {
    integrationsService
      .getConfluenceEnvStatus()
      .then((res) => {
        setEnvConfigured(Boolean(res.data?.envConfigured));
        setEnvStatusError(null);
      })
      .catch((error: unknown) => {
        setEnvConfigured(false);
        const status = (error as { response?: { status?: number } })?.response?.status;
        setEnvStatusError(
          status
            ? `Could not check for a server service account (HTTP ${status}).`
            : 'Could not check for a server service account.'
        );
      });
  }, []);
  const envMode = envConfigured && useServerAccount;
  // A one-shot timer to re-check status shortly after "Sync now": the worker sets
  // lastSyncStatus='syncing' asynchronously, so an immediate refresh can miss it and the
  // poll effect never engages. Cleared on unmount (no leak).
  const kickTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (kickTimerRef.current) window.clearTimeout(kickTimerRef.current);
    },
    []
  );
  // Raw text mirror of the Space Keys field. A controlled input bound to
  // config.spaceKeys.join(', ') re-parses every keystroke and eats the separator, making
  // multi-key entry by typing impossible. Keep the raw string here and parse into the
  // config array in parallel, so the field renders exactly what the user types.
  const [spaceKeysRaw, setSpaceKeysRaw] = useState('');

  // "Sync now" — enqueue an immediate re-sync instead of waiting for the poller.
  const handleSyncNow = async (id: number) => {
    setSyncingId(id);
    try {
      const res = await integrationsService.syncNow(id);
      onShowAlert({
        open: true,
        title: res.success ? 'Sync started' : 'Sync failed',
        description:
          res.data?.message ??
          (res.success
            ? 'Pages will appear in the Knowledge Base shortly.'
            : 'Could not start the sync.'),
        variant: res.success ? 'success' : 'error',
      });
      // Surface 'syncing' immediately; the poll effect below refreshes until it resolves.
      void onRefresh();
      // Re-check ~1.5s later to catch the worker flipping the row to 'syncing' (the
      // immediate refresh can land first), which engages the poll effect.
      if (kickTimerRef.current) window.clearTimeout(kickTimerRef.current);
      kickTimerRef.current = window.setTimeout(() => void onRefresh(), 1500);
    } catch {
      onShowAlert({
        open: true,
        title: 'Sync failed',
        description: 'Could not start the sync. Check the connection and try again.',
        variant: 'error',
      });
    } finally {
      setSyncingId(null);
    }
  };

  // While any space is mid-sync, poll so the status line resolves to Synced/Failed without
  // a manual reload — capped and cleaned up (no unmount leak). The deadline lives in a ref
  // (not a local counter) so the cap survives effect re-runs when onRefresh isn't memoized.
  const anySyncing = confluenceIntegrations.some((integ) => integ.lastSyncStatus === 'syncing');
  const pollDeadlineRef = useRef(0);
  useEffect(() => {
    if (!anySyncing) {
      pollDeadlineRef.current = 0;
      return;
    }
    if (pollDeadlineRef.current === 0) pollDeadlineRef.current = Date.now() + 2 * 60 * 1000; // 2 min cap
    const id = window.setInterval(() => {
      if (Date.now() >= pollDeadlineRef.current) {
        window.clearInterval(id);
        return;
      }
      void onRefresh();
    }, 4000);
    return () => window.clearInterval(id);
  }, [anySyncing, onRefresh]);


  // Pause/resume a source. Disabling stops syncing and (via the PATCH handler) soft-deletes
  // its docs so they leave AI answers; re-enabling re-syncs and restores them.
  const handleToggleEnabled = async (id: number, currentlyEnabled: boolean, name: string) => {
    setTogglingId(id);
    try {
      // `type` is REQUIRED by the PATCH handler (guards against cross-table id-collision);
      // without it the request 400s before the enable/disable KB branch runs.
      const res = await integrationsService.update(id, {
        enabled: !currentlyEnabled,
        type: 'confluence',
      });
      onShowAlert({
        open: true,
        title: res.success
          ? currentlyEnabled
            ? 'Source paused'
            : 'Source enabled'
          : 'Update failed',
        description: res.success
          ? currentlyEnabled
            ? `“${name}” paused — its pages are excluded from AI answers.`
            : `“${name}” enabled — syncing its pages back into the Knowledge Base.`
          : 'Could not update the source. Try again.',
        variant: res.success ? 'success' : 'error',
      });
      void onRefresh();
    } catch {
      onShowAlert({
        open: true,
        title: 'Update failed',
        description: 'Could not update the source. Try again.',
        variant: 'error',
      });
    } finally {
      setTogglingId(null);
    }
  };

  // No project key like Jira — name the connection after its first space (or a fixed label).
  // On EDIT, reuse the EXISTING name: the upsert matches by (org,type,name), so a name that
  // shifts when the first space key changes would miss → create a DUPLICATE (via the
  // restore-less CREATE branch, corrupting the masked token too). A stable name → UPDATE.
  const saveIntegration = () => {
    const existingName = editingId
      ? confluenceIntegrations.find((integ) => integ.id === editingId)?.name
      : undefined;
    const name =
      existingName ??
      (config.spaceKeys[0]
        ? `Confluence-${config.spaceKeys[0]}`
        : envMode
          ? 'Confluence (server account)'
          : 'Confluence');
    void saveIntegrationBase(name);
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      void deleteIntegration(deleteConfirm.id, deleteConfirm.name);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <BookOpen className="w-5 h-5 text-blue-700" />
              Confluence Spaces
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setSpaceKeysRaw('');
                setUseServerAccount(envConfigured); // default to the server account when available
                setShowForm(!showForm);
              }}
            >
              <Plus className="hidden mr-1 w-4 h-4 sm:block" />
              Add Confluence
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {confluenceIntegrations.length > 0 && (
            <div className="space-y-2">
              {confluenceIntegrations.map((integration) => {
                const cfg = integration.config;
                return (
                  <div
                    key={integration.id}
                    className="flex justify-between items-center p-3 rounded-lg border"
                  >
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <p className="font-medium">
                          {cfg.spaceKeys?.length ? cfg.spaceKeys.join(', ') : integration.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cfg.baseUrl ?? 'Not configured'}
                        </p>
                        {(() => {
                          const meta = syncMeta(integration);
                          return <p className={`text-xs mt-0.5 ${meta.cls}`}>{meta.text}</p>;
                        })()}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          loadForEdit(integration.id, cfg);
                          setSpaceKeysRaw((cfg.spaceKeys ?? []).join(', '));
                          // An env-backed row has no stored baseUrl → keep it on the server account.
                          setUseServerAccount(envConfigured && !cfg.baseUrl);
                        }}
                        aria-label="Edit Confluence source"
                        title="Edit"
                        disabled={editingId === integration.id}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => testConnection(integration.id, integration.name)}
                        isLoading={testing === integration.id}
                        disabled={!integration.hasCredentials || testing === integration.id}
                        aria-label="Test Confluence connection"
                        title={
                          integration.hasCredentials
                            ? 'Test the connection'
                            : 'Add credentials first'
                        }
                      >
                        <TestTube2 className="w-4 h-4" />
                        Test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleSyncNow(integration.id)}
                        isLoading={syncingId === integration.id}
                        disabled={
                          !integration.enabled ||
                          !integration.hasCredentials ||
                          syncingId === integration.id
                        }
                        aria-label="Sync now"
                        title={
                          !integration.enabled
                            ? 'Enable this source first'
                            : !integration.hasCredentials
                              ? 'Add credentials to sync'
                              : 'Sync pages from Confluence into the Knowledge Base now'
                        }
                      >
                        <RefreshCw className="w-4 h-4" />
                        Sync now
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleToggleEnabled(
                            integration.id,
                            integration.enabled,
                            integration.name
                          )
                        }
                        isLoading={togglingId === integration.id}
                        disabled={togglingId === integration.id}
                        aria-label={integration.enabled ? 'Pause source' : 'Enable source'}
                        title={
                          integration.enabled
                            ? 'Pause — stop syncing and exclude its pages from AI answers'
                            : 'Enable — resume syncing its pages'
                        }
                        className={integration.enabled ? 'text-green-600' : 'text-gray-400'}
                      >
                        <Power className="w-4 h-4" />
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
                );
              })}
            </div>
          )}

          {showForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Confluence Space' : 'Add Confluence Space'}
              </h4>

              {envStatusError && (
                <Alert variant="warning">
                  {envStatusError} If this server has a shared Confluence service account, it
                  cannot be offered right now — enter credentials below, or reload the page with a
                  workspace selected and try again.
                </Alert>
              )}

              {envConfigured && (
                <Toggle
                  checked={useServerAccount}
                  onChange={(next) => {
                    setUseServerAccount(next);
                    // Server account = no per-workspace creds; clear any typed ones.
                    if (next) setConfig({ ...config, baseUrl: '', email: '', apiToken: '' });
                  }}
                  label="Use the server's Confluence service account (no credentials needed)"
                />
              )}

              {envMode ? (
                <>
                  <Alert variant="info">
                    Using this server&apos;s shared Confluence service account — no credentials
                    needed. Save to add the source, then pick folders or pages on the Knowledge Base
                    page. Optionally scope it to specific spaces below.
                  </Alert>
                  <div>
                    <label htmlFor="spaceKeys" className="text-sm font-medium">
                      Spaces <span className="text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      id="spaceKeys"
                      type="text"
                      value={spaceKeysRaw}
                      onChange={(event) => {
                        setSpaceKeysRaw(event.target.value);
                        setConfig({ ...config, spaceKeys: parseSpaceKeys(event.target.value) });
                      }}
                      className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                      placeholder="Leave blank to browse all spaces, or e.g. ODL, DOCS"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="baseUrl" className="text-sm font-medium">
                        Base URL
                      </label>
                      <input
                        id="baseUrl"
                        type="url"
                        value={config.baseUrl}
                        onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
                        className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                        placeholder="https://your-domain.atlassian.net"
                      />
                    </div>
                    <div>
                      <label htmlFor="spaceKeys" className="text-sm font-medium">
                        Space Keys
                      </label>
                      <input
                        id="spaceKeys"
                        type="text"
                        value={spaceKeysRaw}
                        onChange={(event) => {
                          setSpaceKeysRaw(event.target.value);
                          setConfig({ ...config, spaceKeys: parseSpaceKeys(event.target.value) });
                        }}
                        className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                        placeholder="SUP, DOCS"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="text-sm font-medium">
                        Email
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={config.email}
                        onChange={(event) => setConfig({ ...config, email: event.target.value })}
                        className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                        placeholder="admin@example.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="apiToken" className="text-sm font-medium">
                        API Token
                      </label>
                      <input
                        id="apiToken"
                        type="password"
                        value={config.apiToken}
                        onChange={(event) => setConfig({ ...config, apiToken: event.target.value })}
                        className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                        placeholder="•••••••••"
                      />
                    </div>
                  </div>

                  {/* Page selection lives on the Knowledge Base page (per-page / per-folder). */}
                  <div className="p-3 text-xs rounded-md border text-muted-foreground border-border">
                    Once connected, choose which folders or pages go into the Knowledge Base on the{' '}
                    <span className="font-medium text-foreground">Knowledge Base</span> page.
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={saveIntegration}
                  isLoading={saving}
                  disabled={
                    saving ||
                    (!envMode &&
                      (!config.baseUrl ||
                        !config.email ||
                        !config.apiToken ||
                        config.spaceKeys.length === 0))
                  }
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Confluence
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {confluenceIntegrations.length === 0 && !showForm && (
            <p className="py-2 text-sm text-center text-muted-foreground">
              No Confluence spaces configured
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
    </>
  );
};
