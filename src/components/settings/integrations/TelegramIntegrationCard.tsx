import { useState } from 'react';
import { MessageSquare, Plus, Save, TestTube2, Trash2, Edit } from 'lucide-react';
import type { IntegrationCardProps } from '@/components/settings/integrations/types';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { integrationsService } from '@/services/integrations.service';

type TelegramConfig = {
  botToken: string;
};

export const TelegramIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [config, setConfig] = useState<TelegramConfig>({
    botToken: '',
  });

  const telegramIntegrations = integrations.filter((i) => i.type === 'telegram');

  const resetForm = () => {
    setConfig({ botToken: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const loadForEdit = (id: number, currentConfig: TelegramConfig) => {
    setEditingId(id);
    setConfig(currentConfig);
    setShowForm(true);
  };

  const saveIntegration = async () => {
    setSaving(true);
    try {
      const response = await integrationsService.upsert({
        name: editingId ? `Telegram-${editingId}` : 'Telegram Bot',
        type: 'telegram',
        enabled: true,
        config,
      });

      if (response.success) {
        await onRefresh();
        resetForm();
        onShowAlert({
          open: true,
          title: 'Success',
          description: 'Telegram integration saved successfully!',
          variant: 'success',
        });
      }
    } catch (error) {
      console.error('Failed to save Telegram integration:', error);
      onShowAlert({
        open: true,
        title: 'Error',
        description: 'Failed to save Telegram integration',
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
      console.error(`Failed to test ${name} connection:`, error);
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
      const response = await integrationsService.delete(id);
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
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <MessageSquare className="w-5 h-5 text-blue-500" />
              Telegram Bots
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setShowForm(!showForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Telegram
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {telegramIntegrations.length > 0 && (
            <div className="space-y-2">
              {telegramIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex justify-between items-center p-3 rounded-lg border"
                >
                  <div className="flex gap-3 items-center">
                    <div
                      className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <div>
                      <p className="font-medium">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(integration.config as TelegramConfig).botToken
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
                        loadForEdit(integration.id, integration.config as TelegramConfig)
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
                      onClick={() => setDeleteConfirm({ id: integration.id, name: integration.name })}
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
                {editingId ? 'Edit Telegram Bot' : 'Add New Telegram Bot'}
              </h4>
              <div>
                <label htmlFor="botToken" className="text-sm font-medium">
                  Bot Token
                </label>
                <input
                  type="password"
                  value={config.botToken}
                  onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  placeholder="123456789:ABCdefGhiJklMnoPqrsTuvWxyZ"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Get your bot token from{' '}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600"
                  >
                    @BotFather
                  </a>
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveIntegration} isLoading={saving} disabled={!config.botToken}>
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Telegram
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {telegramIntegrations.length === 0 && !showForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Telegram bots configured
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
