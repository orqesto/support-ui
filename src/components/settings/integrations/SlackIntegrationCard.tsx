import { useState } from 'react';
import { Zap, Plus, Save, TestTube2, Trash2, Edit, Building2 } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { DepartmentMultiPicker } from '@/components/settings/integrations/DepartmentMultiPicker';
import { SourceDepartmentEditor } from '@/components/settings/integrations/SourceDepartmentEditor';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useCreateSourceDepartments } from '@/hooks/useCreateSourceDepartments';
import { useIntegrationCard } from '@/hooks/useIntegrationCard';

type SlackConfig = {
  botToken: string;
  signingSecret: string;
};

export const SlackIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const [editDepts, setEditDepts] = useState<number | null>(null);
  const deptPicker = useCreateSourceDepartments();

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
    saveIntegration,
    testConnection,
    deleteIntegration,
  } = useIntegrationCard<SlackConfig>({
    integrationType: 'slack',
    integrationDisplayName: 'Slack Workspace',
    initialConfig: { botToken: '', signingSecret: '' },
    onRefresh,
    onShowAlert,
    onCreated: async (newIntegrationId) => {
      const assigned = await deptPicker.assignToNewSource(newIntegrationId);
      if (!assigned) {
        onShowAlert({
          open: true,
          title: 'Department assignment failed',
          description:
            'The Slack workspace was created, but department assignment failed. Edit departments from the source list.',
          variant: 'warning',
        });
      }
    },
  });

  const slackIntegrations = integrations.filter((integ) => integ.type === 'slack');

  const handleDelete = () => {
    if (deleteConfirm) {
      void deleteIntegration(deleteConfirm.id, deleteConfirm.name);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between">
            <CardTitle className="flex gap-2 items-center text-md md:text-lg lg:text-xl">
              <Zap className="w-5 h-5 text-purple-600" />
              Slack Workspaces
            </CardTitle>
            <Button
              size="sm"
              className="py-5"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              <Plus className="hidden mr-1 w-4 h-4 sm:block" />
              Add Slack
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {slackIntegrations.length > 0 && (
            <div className="space-y-2">
              {slackIntegrations.map((integration) => (
                <div key={integration.id}>
                  <div className="flex justify-between items-center p-3 rounded-lg border">
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <div className="flex gap-2 items-center">
                          <p className="font-medium">{integration.name}</p>
                          {typeof integration.departmentId === 'number' && (
                            <DepartmentBadge departmentId={integration.departmentId} size="sm" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {(integration.config as SlackConfig).botToken
                            ? 'Token configured'
                            : 'Not configured'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          loadForEdit(integration.id, integration.config as SlackConfig)
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
                        onClick={() => setEditDepts(integration.id)}
                        title="Assign departments"
                      >
                        <Building2 className="w-4 h-4" />
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
                </div>
              ))}
            </div>
          )}

          {showForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Slack Workspace' : 'Add New Slack Workspace'}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="botToken" className="text-sm font-medium">
                    Bot Token
                  </label>
                  <input
                    type="password"
                    value={config.botToken}
                    onChange={(event) => setConfig({ ...config, botToken: event.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="xoxb-..."
                  />
                </div>
                <div>
                  <label htmlFor="signingSecret" className="text-sm font-medium">
                    Signing Secret
                  </label>
                  <input
                    type="password"
                    value={config.signingSecret}
                    onChange={(event) => setConfig({ ...config, signingSecret: event.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="•••••••••"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Create a Slack app at{' '}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600"
                >
                  api.slack.com/apps
                </a>
              </p>

              {editingId === null && (
                <div className="space-y-2 pt-1 border-t">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> Departments
                  </label>
                  <DepartmentMultiPicker
                    allDepts={deptPicker.departments}
                    selected={deptPicker.selectedIds}
                    defaultId={deptPicker.defaultId}
                    loading={deptPicker.loading}
                    onSelectedChange={deptPicker.setSelectedIds}
                    onDefaultChange={deptPicker.setDefaultId}
                  />
                  {!deptPicker.loading && deptPicker.departments.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No active departments. Create one before adding a source.
                    </p>
                  )}
                  {!deptPicker.loading &&
                    deptPicker.departments.length > 0 &&
                    !deptPicker.isValid && (
                      <p className="text-xs text-muted-foreground">
                        Select at least one department to route messages from this source.
                      </p>
                    )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => saveIntegration()}
                  isLoading={saving}
                  disabled={
                    !config.botToken ||
                    !config.signingSecret ||
                    (editingId === null && !deptPicker.isValid)
                  }
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Slack
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {slackIntegrations.length === 0 && !showForm && (
            <p className="py-2 text-sm text-center text-muted-foreground">
              No Slack workspaces configured
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
