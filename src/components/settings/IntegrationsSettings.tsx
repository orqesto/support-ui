import { useEffect, useState } from 'react';
import {
  Mail,
  ExternalLink,
  Zap,
  MessageSquare,
  Save,
  TestTube2,
  Plus,
  Trash2,
  Edit,
} from 'lucide-react';
import { gmailOAuthService } from '@/services/gmail-oauth.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

export const IntegrationsSettings = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Show/hide add forms
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showGmailForm, setShowGmailForm] = useState(false);
  const [showJiraForm, setShowJiraForm] = useState(false);
  const [showTelegramForm, setShowTelegramForm] = useState(false);
  const [showSlackForm, setShowSlackForm] = useState(false);

  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  // Form states
  const [emailConfig, setEmailConfig] = useState({
    host: '',
    port: 993,
    user: '',
    password: '',
    secure: true,
  });

  const [jiraConfig, setJiraConfig] = useState({
    apiUrl: '',
    email: '',
    apiToken: '',
    projectKey: '',
  });

  const [telegramConfig, setTelegramConfig] = useState({
    botToken: '',
  });

  const [slackConfig, setSlackConfig] = useState({
    botToken: '',
    signingSecret: '',
  });

  const [gmailConfig, setGmailConfig] = useState({
    clientId: '',
    clientSecret: '',
    searchQuery: 'is:unread',
    maxResults: 10,
  });

  const searchQueryOptions = [
    { value: 'is:unread', label: 'Only Unread' },
    { value: 'in:inbox', label: 'All Inbox' },
    { value: 'is:unread OR label:inbox', label: 'Unread + Inbox' },
    { value: 'after:2024/01/01', label: 'After 2024' },
    { value: '', label: 'Everything' },
  ];

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const response = await integrationsService.getAll();
      if (response.success && response.data) {
        console.log('📊 Fetched integrations:', response.data);
        // Force React to recognize the state change with fresh array
        setIntegrations(response.data.map((i) => ({ ...i })));
      } else {
        console.error('Failed to fetch integrations:', response.error);
        throw new Error(response.error || 'Failed to fetch integrations');
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
      throw error; // Re-throw to let caller handle it
    } finally {
      setLoading(false);
    }
  };

  const resetForm = (type: string) => {
    if (type === 'email') {
      setEmailConfig({ host: '', port: 993, user: '', password: '', secure: true });
      setShowEmailForm(false);
    } else if (type === 'gmail') {
      setGmailConfig({ clientId: '', clientSecret: '', searchQuery: 'is:unread', maxResults: 10 });
      setShowGmailForm(false);
    } else if (type === 'jira') {
      setJiraConfig({ apiUrl: '', email: '', apiToken: '', projectKey: '' });
      setShowJiraForm(false);
    } else if (type === 'telegram') {
      setTelegramConfig({ botToken: '' });
      setShowTelegramForm(false);
    } else if (type === 'slack') {
      setSlackConfig({ botToken: '', signingSecret: '' });
      setShowSlackForm(false);
    }
    setEditingId(null);
  };

  const loadForEdit = (integration: Integration) => {
    setEditingId(integration.id);
    const config = integration.config;
    if (integration.type === 'email') {
      setEmailConfig(config as typeof emailConfig);
      setShowEmailForm(true);
    } else if (integration.type === 'gmail') {
      setGmailConfig(config as typeof gmailConfig);
      setShowGmailForm(true);
    } else if (integration.type === 'jira') {
      setJiraConfig(config as typeof jiraConfig);
      setShowJiraForm(true);
    } else if (integration.type === 'telegram') {
      setTelegramConfig(config as typeof telegramConfig);
      setShowTelegramForm(true);
    } else if (integration.type === 'slack') {
      setSlackConfig(config as typeof slackConfig);
      setShowSlackForm(true);
    }
  };

  const saveIntegration = async (
    name: string,
    type: string,
    config: Record<string, string | number | boolean>
  ) => {
    setSaving(type);
    try {
      const response = await integrationsService.upsert({
        name,
        type,
        enabled: true,
        config,
      });

      if (response.success) {
        await fetchIntegrations();
        resetForm(type);
        alert(`${name} integration saved successfully!`);
      }
    } catch (error) {
      console.error(`Failed to save ${name} integration:`, error);
      alert(`Failed to save ${name} integration`);
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteClick = (id: number, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) {
      return;
    }

    const { id, name } = deleteConfirm;
    setDeleting(id);
    setDeleteConfirm(null);

    try {
      const response = await integrationsService.delete(id);

      if (response.success) {
        await fetchIntegrations();
      } else {
        alert(`Failed to delete ${name}: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Failed to delete ${name}:`, error);
      alert(`Failed to delete ${name}. Check console for details.`);
    } finally {
      setDeleting(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  const handleGmailOAuth = async () => {
    setSaving('gmail');
    try {
      const response = await gmailOAuthService.connectWithPopup(
        gmailConfig.clientId,
        gmailConfig.clientSecret,
        gmailConfig.searchQuery,
        gmailConfig.maxResults
      );

      if (response.success) {
        console.log('✅ Gmail connected successfully:', response.data);

        // Refresh integrations list FIRST (before hiding form)
        try {
          await fetchIntegrations();
          console.log('📊 Integrations refreshed successfully');
          console.log('Current integrations count:', integrations.length);
        } catch (fetchError) {
          console.error('Failed to refresh integrations list:', fetchError);
        }

        // Small delay to ensure state update propagates
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Hide the form
        resetForm('gmail');

        // Show success message (non-blocking)
        setTimeout(() => {
          alert(
            `✅ Gmail account connected successfully!\n\n${response.data?.email || 'Account'} has been added.`
          );
        }, 50);
      } else {
        console.error('Gmail OAuth failed:', response);
        alert(
          `❌ Failed to connect Gmail: ${response.error || 'Unknown error'}\n\nPlease check if you're logged in with a valid account.`
        );
      }
    } catch (error) {
      console.error('Failed to connect Gmail:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`❌ Failed to connect Gmail: ${errorMsg}`);
    } finally {
      setSaving(null);
    }
  };

  const testConnection = async (id: number, name: string) => {
    setTesting(id);
    try {
      const response = await integrationsService.test(id);
      if (response.success) {
        alert(`${name} connection test successful!`);
      } else {
        alert(`${name} connection test failed: ${response.message}`);
      }
    } catch (error) {
      console.error(`Failed to test ${name} connection:`, error);
      alert(`Failed to test ${name} connection`);
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return <div className="py-12 text-center">Loading integrations...</div>;
  }

  const emailIntegrations = integrations.filter((i) => i.type === 'email');
  const gmailIntegrations = integrations.filter((i) => i.type === 'gmail');
  const jiraIntegrations = integrations.filter((i) => i.type === 'jira');
  const telegramIntegrations = integrations.filter((i) => i.type === 'telegram');
  const slackIntegrations = integrations.filter((i) => i.type === 'slack');

  return (
    <div className="space-y-6">
      {/* Email Integration */}
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
                resetForm('email');
                setShowEmailForm(!showEmailForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Email
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of existing email accounts */}
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
                      <p className="font-medium">
                        {(integration.config as { user?: string }).user || integration.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(integration.config as { host?: string }).host || 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadForEdit(integration)}
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
                      onClick={() => handleDeleteClick(integration.id, integration.name)}
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

          {/* Add/Edit form */}
          {showEmailForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Email Account' : 'Add New Email Account'}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">IMAP Host</label>
                  <input
                    type="text"
                    value={emailConfig.host}
                    onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="imap.gmail.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Port</label>
                  <input
                    type="number"
                    value={emailConfig.port}
                    onChange={(e) =>
                      setEmailConfig({ ...emailConfig, port: parseInt(e.target.value) })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="993"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={emailConfig.user}
                    onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="support@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Password / App Password</label>
                  <input
                    type="password"
                    value={emailConfig.password}
                    onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="•••••••••"
                  />
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={emailConfig.secure}
                  onChange={(e) => setEmailConfig({ ...emailConfig, secure: e.target.checked })}
                  className="rounded"
                />
                <label className="text-sm">Use SSL/TLS</label>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `Email-${editingId}` : `Email-${emailConfig.user}`,
                      'email',
                      emailConfig
                    )
                  }
                  isLoading={saving === 'email'}
                  disabled={!emailConfig.host || !emailConfig.user || !emailConfig.password}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Email
                </Button>
                <Button variant="outline" onClick={() => resetForm('email')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {emailIntegrations.length === 0 && !showEmailForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No email accounts configured
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gmail Integration */}
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
                resetForm('gmail');
                setShowGmailForm(!showGmailForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Gmail
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of existing Gmail accounts */}
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
                        {(integration.config as { user?: string }).user || integration.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        OAuth2 •{' '}
                        {(integration.config as { searchQuery?: string }).searchQuery ||
                          'is:unread'}
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
                      onClick={() => handleDeleteClick(integration.id, integration.name)}
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

          {/* Add/Edit form */}
          {showGmailForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">Add Gmail Account via OAuth2</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">Google OAuth2 Client ID</label>
                  <input
                    type="text"
                    value={gmailConfig.clientId}
                    onChange={(e) => setGmailConfig({ ...gmailConfig, clientId: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="123456789-abc.apps.googleusercontent.com"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    From Google Cloud Console → APIs & Services → Credentials
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Google OAuth2 Client Secret</label>
                  <input
                    type="password"
                    value={gmailConfig.clientSecret}
                    onChange={(e) =>
                      setGmailConfig({ ...gmailConfig, clientSecret: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="GOCSPX-..."
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Client secret from the same OAuth2 credentials
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Search Query</label>
                  <select
                    value={gmailConfig.searchQuery}
                    onChange={(e) =>
                      setGmailConfig({ ...gmailConfig, searchQuery: e.target.value })
                    }
                    className="px-3 py-2 w-full bg-input text-foreground rounded-md border border-border"
                  >
                    {searchQueryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select which emails to fetch from Gmail
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Max Results per Sync</label>
                  <input
                    type="number"
                    value={gmailConfig.maxResults}
                    onChange={(e) =>
                      setGmailConfig({ ...gmailConfig, maxResults: parseInt(e.target.value) || 10 })
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
                  isLoading={saving === 'gmail'}
                  disabled={!gmailConfig.clientId || !gmailConfig.clientSecret}
                >
                  <Save className="mr-2 w-4 h-4" />
                  Connect with Google
                </Button>
                <Button variant="outline" onClick={() => resetForm('gmail')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {gmailIntegrations.length === 0 && !showGmailForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Gmail accounts connected
            </p>
          )}
        </CardContent>
      </Card>

      {/* Jira Integration */}
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
                resetForm('jira');
                setShowJiraForm(!showJiraForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Jira
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of existing jira instances */}
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
                      <p className="font-medium">
                        {(integration.config as { projectKey?: string }).projectKey ||
                          integration.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(integration.config as { apiUrl?: string }).apiUrl || 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadForEdit(integration)}
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
                      onClick={() => handleDeleteClick(integration.id, integration.name)}
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

          {/* Add/Edit form */}
          {showJiraForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Jira Instance' : 'Add New Jira Instance'}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Jira URL</label>
                  <input
                    type="url"
                    value={jiraConfig.apiUrl}
                    onChange={(e) => setJiraConfig({ ...jiraConfig, apiUrl: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="https://your-domain.atlassian.net"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Project Key</label>
                  <input
                    type="text"
                    value={jiraConfig.projectKey}
                    onChange={(e) => setJiraConfig({ ...jiraConfig, projectKey: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="SUP"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={jiraConfig.email}
                    onChange={(e) => setJiraConfig({ ...jiraConfig, email: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="admin@example.com"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">API Token</label>
                  <input
                    type="password"
                    value={jiraConfig.apiToken}
                    onChange={(e) => setJiraConfig({ ...jiraConfig, apiToken: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="•••••••••"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `Jira-${editingId}` : `Jira-${jiraConfig.projectKey}`,
                      'jira',
                      jiraConfig
                    )
                  }
                  isLoading={saving === 'jira'}
                  disabled={
                    !jiraConfig.apiUrl ||
                    !jiraConfig.email ||
                    !jiraConfig.apiToken ||
                    !jiraConfig.projectKey
                  }
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Jira
                </Button>
                <Button variant="outline" onClick={() => resetForm('jira')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {jiraIntegrations.length === 0 && !showJiraForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Jira instances configured
            </p>
          )}
        </CardContent>
      </Card>

      {/* Telegram Integration */}
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
                resetForm('telegram');
                setShowTelegramForm(!showTelegramForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Telegram
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of existing telegram bots */}
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
                        {(integration.config as { botToken?: string }).botToken
                          ? 'Token configured'
                          : 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadForEdit(integration)}
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
                      onClick={() => handleDeleteClick(integration.id, integration.name)}
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

          {/* Add/Edit form */}
          {showTelegramForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Telegram Bot' : 'Add New Telegram Bot'}
              </h4>
              <div>
                <label className="text-sm font-medium">Bot Token</label>
                <input
                  type="password"
                  value={telegramConfig.botToken}
                  onChange={(e) =>
                    setTelegramConfig({ ...telegramConfig, botToken: e.target.value })
                  }
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
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `Telegram-${editingId}` : 'Telegram Bot',
                      'telegram',
                      telegramConfig
                    )
                  }
                  isLoading={saving === 'telegram'}
                  disabled={!telegramConfig.botToken}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Telegram
                </Button>
                <Button variant="outline" onClick={() => resetForm('telegram')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {telegramIntegrations.length === 0 && !showTelegramForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Telegram bots configured
            </p>
          )}
        </CardContent>
      </Card>

      {/* Slack Integration */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <Zap className="w-5 h-5 text-purple-600" />
              Slack Workspaces
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm('slack');
                setShowSlackForm(!showSlackForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              Add Slack
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of existing slack workspaces */}
          {slackIntegrations.length > 0 && (
            <div className="space-y-2">
              {slackIntegrations.map((integration) => (
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
                        {(integration.config as { botToken?: string }).botToken
                          ? 'Token configured'
                          : 'Not configured'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadForEdit(integration)}
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
                      onClick={() => handleDeleteClick(integration.id, integration.name)}
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

          {/* Add/Edit form */}
          {showSlackForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Slack Workspace' : 'Add New Slack Workspace'}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Bot Token</label>
                  <input
                    type="password"
                    value={slackConfig.botToken}
                    onChange={(e) => setSlackConfig({ ...slackConfig, botToken: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="xoxb-..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Signing Secret</label>
                  <input
                    type="password"
                    value={slackConfig.signingSecret}
                    onChange={(e) =>
                      setSlackConfig({ ...slackConfig, signingSecret: e.target.value })
                    }
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
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `Slack-${editingId}` : 'Slack Workspace',
                      'slack',
                      slackConfig
                    )
                  }
                  isLoading={saving === 'slack'}
                  disabled={!slackConfig.botToken || !slackConfig.signingSecret}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Slack
                </Button>
                <Button variant="outline" onClick={() => resetForm('slack')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {slackIntegrations.length === 0 && !showSlackForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Slack workspaces configured
            </p>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
          <div className="p-6 mx-4 w-full max-w-md bg-card rounded-lg shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Delete Integration?</h3>
            <p className="mb-4 text-muted-foreground">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
            </p>
            <p className="mb-6 text-sm text-red-600">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={cancelDelete}
                disabled={deleting === deleteConfirm.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                isLoading={deleting === deleteConfirm.id}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
