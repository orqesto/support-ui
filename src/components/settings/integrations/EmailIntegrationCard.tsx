import { useState } from 'react';
import { Mail, Plus, TestTube2, Trash2, Edit, Calendar, Building2, MessageSquareReply } from 'lucide-react';
import DepartmentBadge from '@/components/admin/DepartmentBadge';
import { AckReplyEditor } from '@/components/settings/integrations/AckReplyEditor';
import { EmailForm } from '@/components/settings/integrations/EmailForm';
import { SourceDepartmentEditor } from '@/components/settings/integrations/SourceDepartmentEditor';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useCreateSourceDepartments } from '@/hooks/useCreateSourceDepartments';
import { integrationsService } from '@/services/integrations.service';
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

const defaultConfig: EmailConfig = {
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
};

export const EmailIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
  defaultKB,
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
  const [config, setConfig] = useState<EmailConfig>(defaultConfig);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editBulkImport, setEditBulkImport] = useState<{
    id: number;
    name: string;
    currentDays: number;
  } | null>(null);
  const [bulkImportDaysInput, setBulkImportDaysInput] = useState<string>('7');
  const [editDepts, setEditDepts] = useState<number | null>(null);
  const [editAckReply, setEditAckReply] = useState<number | null>(null);

  // Centralized create-form department picker state.
  const deptPicker = useCreateSourceDepartments();

  const emailIntegrations = integrations.filter(
    (int) =>
      int.type === 'email' &&
      (defaultKB === undefined || (int.isKnowledgeBase ?? false) === defaultKB)
  );

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
    if (!editBulkImport) return;

    setSaving(true);
    try {
      const days = parseInt(bulkImportDaysInput) || 0;

      await integrationsService.update(editBulkImport.id, {
        config: {
          email: { bulkImportDays: days },
        },
      });

      await onRefresh();
      setEditBulkImport(null);

      onShowAlert({
        open: true,
        title: 'Sync Range Updated',
        description: `Will sync emails from ${days === 0 ? 'all time' : `last ${days} days`} on next polling cycle.`,
        variant: 'success',
      });
    } catch (error) {
      logger.error('Failed to update sync range:', error);
      onShowAlert({
        open: true,
        title: 'Update Failed',
        description: error instanceof Error ? error.message : 'Failed to update sync range',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setConfig({ ...defaultConfig, isKnowledgeBase: defaultKB ?? false });
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
    setEditingName(currentName);
    const emailConfig = (currentConfig as { email?: EmailConfig }).email ?? currentConfig;
    setConfig({ ...(emailConfig as EmailConfig), isKnowledgeBase: isKB });
    setShowForm(true);
  };

  const saveIntegration = async () => {
    setSaving(true);
    try {
      const integrationName =
        editingId !== null && editingName ? editingName : `Email-${config.user}`;
      const { isKnowledgeBase, ...emailConfigOnly } = config;

      const response = await integrationsService.upsert({
        name: integrationName,
        type: 'email',
        enabled: true,
        isKnowledgeBase: isKnowledgeBase ?? false,
        config: { email: emailConfigOnly },
      });

      if (response.success) {
        // On CREATE only: assign departments via the M:N table. Updates leave them alone
        // — those are managed via the per-source editor.
        const isCreate = response.action !== 'updated';
        const newIntegrationId = response.data?.id;
        if (isCreate && newIntegrationId) {
          const assigned = await deptPicker.assignToNewSource(newIntegrationId);
          if (!assigned) {
            onShowAlert({
              open: true,
              title: 'Department assignment failed',
              description:
                'The email account was created, but department assignment failed. Edit departments from the source list.',
              variant: 'warning',
            });
          }
        }

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
    if (!deleteConfirm) return;

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
              {defaultKB ? 'Email KB Sources (IMAP)' : 'Email Accounts (IMAP)'}
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
                <div key={integration.id}>
                  <div className="flex justify-between items-center p-3 rounded-lg border">
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
                          {typeof integration.departmentId === 'number' && (
                            <DepartmentBadge departmentId={integration.departmentId} size="sm" />
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
                        onClick={() => setEditDepts(integration.id)}
                        title="Assign departments"
                      >
                        <Building2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditAckReply(integration.id)}
                        title="Auto-reply template"
                      >
                        <MessageSquareReply className="w-4 h-4" />
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
                      onSaved={() => { setEditDepts(null); void onRefresh(); }}
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

          {showForm && (
            <EmailForm
              config={config}
              editingId={editingId}
              saving={saving}
              checkingCount={checkingCount}
              messageCount={messageCount}
              showAdvanced={showAdvanced}
              departments={deptPicker.departments}
              departmentsLoading={deptPicker.loading}
              selectedDepartmentIds={deptPicker.selectedIds}
              defaultDepartmentId={deptPicker.defaultId}
              onConfigChange={setConfig}
              onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
              onCheckMessagesCount={handleCheckMessagesCount}
              onSelectedDepartmentsChange={deptPicker.setSelectedIds}
              onDefaultDepartmentChange={deptPicker.setDefaultId}
              onSave={saveIntegration}
              onCancel={resetForm}
            />
          )}

          {emailIntegrations.length === 0 && !showForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No email accounts configured
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
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

      {/* Initial Sync Range Modal */}
      {editBulkImport && (
        <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
          <div className="p-6 mx-4 w-full max-w-md rounded-lg shadow-xl bg-card">
            <h3 className="mb-2 text-lg font-semibold">Initial Sync Range</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Configure historical import range for <strong>{editBulkImport.name}</strong>
            </p>

            <div className="mb-4">
              <ReactSelect
                label="Fetch emails from:"
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
                How far back to fetch emails on first connect. After the initial sync, normal incremental polling resumes.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setEditBulkImport(null)}
                disabled={saving}
              >
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
