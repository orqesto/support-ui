import { useState } from 'react';
import { Mail, Plus, Save, TestTube2, Trash2 } from 'lucide-react';
import { gmailOAuthService } from '@/services/gmail-oauth.service';
import { integrationsService } from '@/services/integrations.service';
import { Button } from '../../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/Card';
import { Select } from '../../ui/Select';
import type { IntegrationCardProps } from './types';

type GmailConfig = {
  clientId: string;
  clientSecret: string;
  searchQuery: string;
  maxResults: number;
};

const searchQueryOptions = [
  { value: 'is:unread', label: 'Only Unread' },
  { value: 'in:inbox', label: 'All Inbox' },
  { value: 'is:unread OR label:inbox', label: 'Unread + Inbox' },
  { value: 'after:2024/01/01', label: 'After 2024' },
  { value: '', label: 'Everything' },
];

export const GmailIntegrationCard = ({
  integrations,
  onRefresh,
  onShowAlert,
}: IntegrationCardProps) => {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  const [config, setConfig] = useState<GmailConfig>({
    clientId: '',
    clientSecret: '',
    searchQuery: 'is:unread',
    maxResults: 10,
  });

  const gmailIntegrations = integrations.filter((i) => i.type === 'gmail');

  const resetForm = () => {
    setConfig({ clientId: '', clientSecret: '', searchQuery: 'is:unread', maxResults: 10 });
    setShowForm(false);
  };

  const handleGmailOAuth = async () => {
    setSaving(true);
    try {
      const response = await gmailOAuthService.connectWithPopup(
        config.clientId,
        config.clientSecret,
        config.searchQuery,
        config.maxResults
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
              <Mail className="w-5 h-5 text-red-600" />
              Gmail Accounts (OAuth2)
            </CardTitle>
            <Button
              size="sm"
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
                        {(integration.config as { user?: string }).user ?? integration.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        OAuth2 •{' '}
                        {(integration.config as { searchQuery?: string }).searchQuery ?? 'is:unread'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(integration.id, integration.name)}
                      isLoading={testing === integration.id}
                      disabled={!integration.hasCredentials}
                    >
                      <TestTube2 className="mr-1.5 w-4 h-4" />
                      Poke
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteConfirm({ id: integration.id, name: integration.name })}
                      isLoading={deleting === integration.id}
                    >
                      <Trash2 className="mr-1.5 w-4 h-4 text-red-600" />
                      Delete
                    </Button>
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
                <Select
                  label="Search Query"
                  value={config.searchQuery}
                  onChange={(e) => setConfig({ ...config, searchQuery: e.target.value })}
                >
                  {searchQueryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <p className="-mt-2 text-xs text-muted-foreground">
                  Select which emails to fetch from Gmail
                </p>
                <div>
                  <label htmlFor="maxResults" className="text-sm font-medium">
                    Max Results per Sync
                  </label>
                  <input
                    type="number"
                    value={config.maxResults}
                    onChange={(e) =>
                      setConfig({ ...config, maxResults: parseInt(e.target.value) || 10 })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="10"
                    min="1"
                    max="100"
                  />
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
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Gmail accounts connected
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
