import { useState } from 'react';
import { ExternalLink, Plus, Save, TestTube2, Trash2, Edit, Star } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useIntegrationCard } from '@/hooks/useIntegrationCard';
import { integrationsService } from '@/services/integrations.service';

type JiraConfig = {
  apiUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
};

export const JiraIntegrationCard = ({
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
  } = useIntegrationCard<JiraConfig>({
    integrationType: 'jira',
    integrationDisplayName: 'Jira Integration',
    initialConfig: { apiUrl: '', email: '', apiToken: '', projectKey: '' },
    onRefresh,
    onShowAlert,
  });

  // Jira-specific state
  const [settingDefault, setSettingDefault] = useState<number | null>(null);

  const jiraIntegrations = integrations.filter((i) => i.type === 'jira');

  // Jira-specific: custom name includes project key
  const saveIntegration = () => saveIntegrationBase(`Jira-${config.projectKey}`);

  const handleDelete = () => {
    if (deleteConfirm) {
      void deleteIntegration(deleteConfirm.id, deleteConfirm.name);
    }
  };

  const handleSetDefault = async (id: number, name: string) => {
    setSettingDefault(id);
    try {
      const response = await integrationsService.setDefaultTicketing(id, 'jira');
      if (response.success) {
        await onRefresh();
        onShowAlert({
          open: true,
          title: 'Success',
          description: response.message ?? `${name} is now the default integration`,
          variant: 'success',
        });
      } else {
        onShowAlert({
          open: true,
          title: 'Error',
          description: `Failed to set default: ${response.error ?? 'Unknown error'}`,
          variant: 'error',
        });
      }
    } catch (error) {
      console.error(`Failed to set ${name} as default:`, error);
      onShowAlert({
        open: true,
        title: 'Error',
        description: `Failed to set ${name} as default integration`,
        variant: 'error',
      });
    } finally {
      setSettingDefault(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <ExternalLink className="w-5 h-5 text-blue-700" />
              Jira Instances
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4 hidden sm:block" />
              Add Jira
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {jiraIntegrations.length > 0 && (
            <div className="space-y-2">
              {jiraIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex justify-between items-center p-3 rounded-lg border"
                >
                  <div className="flex gap-3 items-center">
                    <div
                      className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {(integration.config as JiraConfig).projectKey ?? integration.name}
                        </p>
                        {integration.departmentRole && (
                          <DepartmentBadge department={integration.departmentRole} size="sm" />
                        )}
                        {integration.isDefault && (
                          <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-yellow-700 bg-yellow-100 rounded-full dark:bg-yellow-900/30 dark:text-yellow-500">
                            <Star className="w-3 h-3 fill-current" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(integration.config as JiraConfig).apiUrl ?? 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {!integration.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetDefault(integration.id, integration.name)}
                        isLoading={settingDefault === integration.id}
                        title="Set as default for this department"
                      >
                        <Star className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadForEdit(integration.id, integration.config as JiraConfig)}
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
                {editingId ? 'Edit Jira Instance' : 'Add New Jira Instance'}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="apiUrl" className="text-sm font-medium">
                    Jira URL
                  </label>
                  <input
                    type="url"
                    value={config.apiUrl}
                    onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="https://your-domain.atlassian.net"
                  />
                </div>
                <div>
                  <label htmlFor="projectKey" className="text-sm font-medium">
                    Project Key
                  </label>
                  <input
                    type="text"
                    value={config.projectKey}
                    onChange={(e) => setConfig({ ...config, projectKey: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="SUP"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    type="email"
                    value={config.email}
                    onChange={(e) => setConfig({ ...config, email: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="apiToken" className="text-sm font-medium">
                    API Token
                  </label>
                  <input
                    type="password"
                    value={config.apiToken}
                    onChange={(e) => setConfig({ ...config, apiToken: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="•••••••••"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={saveIntegration}
                  isLoading={saving}
                  disabled={
                    !config.apiUrl || !config.email || !config.apiToken || !config.projectKey
                  }
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Jira
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {jiraIntegrations.length === 0 && !showForm && (
            <p className="py-2 text-sm text-center text-muted-foreground">
              No Jira instances configured
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
