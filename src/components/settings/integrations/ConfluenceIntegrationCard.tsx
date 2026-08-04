import { BookOpen, Plus, RefreshCw, Save, TestTube2, Trash2, Edit } from 'lucide-react';
import { useState } from 'react';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useIntegrationCard } from '@/hooks/useIntegrationCard';
import { integrationsService, type ConfluenceConfig } from '@/services/integrations.service';

// Parse a raw "SUP, DOCS ENG" input into a clean string[] of space keys. The saved
// config MUST carry spaceKeys as an array (the backend sync expects string[]).
const parseSpaceKeys = (raw: string): string[] =>
  raw
    .split(/[\s,]+/)
    .map((key) => key.trim())
    .filter(Boolean);

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

  // No project key like Jira — name the connection after its first space (or a fixed label).
  const saveIntegration = () =>
    saveIntegrationBase(config.spaceKeys[0] ? `Confluence-${config.spaceKeys[0]}` : 'Confluence');

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
                setShowForm(!showForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4 hidden sm:block" />
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
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadForEdit(integration.id, cfg)}
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
                        onClick={() => void handleSyncNow(integration.id)}
                        isLoading={syncingId === integration.id}
                        disabled={!integration.enabled || !integration.hasCredentials}
                        title="Sync pages from Confluence into the Knowledge Base now"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Sync now
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
                    value={config.spaceKeys.join(', ')}
                    onChange={(event) =>
                      setConfig({ ...config, spaceKeys: parseSpaceKeys(event.target.value) })
                    }
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
                <div>
                  <label htmlFor="syncIntervalMinutes" className="text-sm font-medium">
                    Sync Interval (minutes)
                  </label>
                  <input
                    id="syncIntervalMinutes"
                    type="number"
                    min={1}
                    value={config.syncIntervalMinutes ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      setConfig({
                        ...config,
                        syncIntervalMinutes: raw === '' ? undefined : Number(raw),
                      });
                    }}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="360"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={saveIntegration}
                  isLoading={saving}
                  disabled={
                    !config.baseUrl ||
                    !config.email ||
                    !config.apiToken ||
                    config.spaceKeys.length === 0
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
