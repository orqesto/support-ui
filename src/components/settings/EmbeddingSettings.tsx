import { useState, useEffect } from 'react';
import {
  Sparkles,
  Save,
  Zap,
  Cloud,
  AlertCircle,
  Lock,
  Package,
  Star,
  Globe,
  BarChart3,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { AlertDialog } from '../ui/AlertDialog';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

type EmbeddingProvider = 'openai' | 'local';

type EmbeddingSettings = {
  provider: EmbeddingProvider;
  preferLocal: boolean;
};

export const EmbeddingSettings = () => {
  const [settings, setSettings] = useState<EmbeddingSettings>({
    provider: 'local',
    preferLocal: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasOpenAI, setHasOpenAI] = useState(false);
  const [openAIEmbeddingModel, setOpenAIEmbeddingModel] =
    useState<string>('text-embedding-3-small');
  const [localIntegration, setLocalIntegration] = useState<Integration | null>(null);
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  useEffect(() => {
    Promise.all([fetchSettings(), checkIntegrations()]).catch((error) => {
      console.error('Failed to initialize:', error);
    });
  }, []);

  const checkIntegrations = async () => {
    try {
      const response = await integrationsService.getAll();
      if (response.success && response.data) {
        // Check for OpenAI
        const openAIIntegration = response.data.find((i) => i.type === 'openai' && i.enabled);
        if (openAIIntegration) {
          setHasOpenAI(true);
          const config = openAIIntegration.config as { defaultEmbeddingModel?: string };
          if (config.defaultEmbeddingModel) {
            setOpenAIEmbeddingModel(config.defaultEmbeddingModel);
          }
        } else {
          setHasOpenAI(false);
        }

        // Check for Local Embeddings
        const localEmbedding = response.data.find((i) => i.type === 'local_embeddings');
        if (localEmbedding) {
          setLocalIntegration(localEmbedding);
        }
      }
    } catch (error) {
      console.error('Failed to check integrations:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await apiClient.get<{ success: boolean; data: EmbeddingSettings }>(
        '/api/embedding-settings'
      );
      if (response.data.success && response.data.data) {
        setSettings(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await apiClient.put<{ success: boolean; data: EmbeddingSettings }>(
        '/api/embedding-settings',
        settings
      );

      if (response.data.success) {
        setAlertDialog({
          open: true,
          title: 'Settings Saved',
          description: `Embedding provider set to ${settings.provider === 'local' ? 'Local (all-MiniLM-L6-v2)' : `OpenAI (${openAIEmbeddingModel})`}`,
          variant: 'success',
        });
      }
    } catch (error) {
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleLocalIntegration = async () => {
    if (!localIntegration) {
      return;
    }

    try {
      await integrationsService.update(localIntegration.id, {
        enabled: !localIntegration.enabled,
      });

      setAlertDialog({
        open: true,
        title: 'Success',
        description: `Local Embeddings ${!localIntegration.enabled ? 'enabled' : 'disabled'} successfully`,
        variant: 'success',
      });

      await checkIntegrations();
    } catch (error) {
      console.error('Failed to toggle local embeddings:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update local embeddings status',
        variant: 'error',
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Sparkles className="w-5 h-5" />
            Embedding Provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex gap-2 items-center">
            <Sparkles className="w-5 h-5" />
            Embedding Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="mb-4 text-sm text-muted-foreground">
              Choose which embedding provider to use for ticket similarity search and
              categorization.
            </p>
          </div>

          {/* Provider Selection */}
          <div className="space-y-4">
            {/* Local Embeddings Option */}
            <div
              className={`border rounded-lg p-4 transition-colors ${
                !localIntegration?.enabled
                  ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                  : settings.provider === 'local'
                    ? 'border-primary bg-primary/5 cursor-pointer'
                    : 'border-border hover:border-primary/50 cursor-pointer'
              }`}
              onClick={() => {
                if (localIntegration?.enabled) {
                  setSettings({ provider: 'local', preferLocal: true });
                }
              }}
            >
              <div className="flex gap-3 items-start">
                <input
                  type="radio"
                  checked={settings.provider === 'local'}
                  onChange={() => {
                    if (localIntegration?.enabled) {
                      setSettings({ provider: 'local', preferLocal: true });
                    }
                  }}
                  disabled={!localIntegration?.enabled}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex gap-2 items-center mb-1">
                    <Zap className="w-4 h-4 text-green-500" />
                    <h3 className="font-semibold">Local Embeddings</h3>
                    {localIntegration?.enabled ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        Enabled
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    all-MiniLM-L6-v2 model running on your server
                  </p>
                  {!localIntegration?.enabled && (
                    <div className="p-2 mb-2 bg-amber-50 rounded border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                      <div className="flex gap-2 items-start">
                        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Enable the integration below to use local embeddings
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="flex gap-1 items-center px-2 py-1 text-blue-700 bg-blue-50 rounded">
                      <Lock className="w-3 h-3" />
                      Private
                    </span>
                    <span className="flex gap-1 items-center px-2 py-1 text-purple-700 bg-purple-50 rounded">
                      <Zap className="w-3 h-3" />
                      Fast (~60-120ms)
                    </span>
                    <span className="flex gap-1 items-center px-2 py-1 text-orange-700 bg-orange-50 rounded">
                      <Package className="w-3 h-3" />
                      ~470MB
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* OpenAI Option */}
            <div
              className={`border rounded-lg p-4 transition-colors ${
                !hasOpenAI
                  ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                  : settings.provider === 'openai'
                    ? 'border-primary bg-primary/5 cursor-pointer'
                    : 'border-border hover:border-primary/50 cursor-pointer'
              }`}
              onClick={() => {
                if (hasOpenAI) {
                  setSettings({ provider: 'openai', preferLocal: false });
                }
              }}
            >
              <div className="flex gap-3 items-start">
                <input
                  type="radio"
                  checked={settings.provider === 'openai'}
                  onChange={() => {
                    if (hasOpenAI) {
                      setSettings({ provider: 'openai', preferLocal: false });
                    }
                  }}
                  disabled={!hasOpenAI}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex gap-2 items-center mb-1">
                    <Cloud className="w-4 h-4 text-blue-500" />
                    <h3 className="font-semibold">OpenAI Embeddings</h3>
                    {!hasOpenAI && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        Not Configured
                      </span>
                    )}
                  </div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    {openAIEmbeddingModel} via OpenAI API
                  </p>
                  {!hasOpenAI && (
                    <div className="p-2 mb-2 bg-amber-50 rounded border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                      <div className="flex gap-2 items-start">
                        <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          Configure OpenAI in <strong>AI Providers</strong> settings first
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="flex gap-1 items-center px-2 py-1 text-blue-700 bg-blue-50 rounded">
                      <Star className="w-3 h-3" />
                      Best Quality
                    </span>
                    <span className="flex gap-1 items-center px-2 py-1 text-gray-700 bg-gray-50 rounded">
                      <Globe className="w-3 h-3" />
                      API Required
                    </span>
                    <span className="flex gap-1 items-center px-2 py-1 text-purple-700 bg-purple-50 rounded">
                      <BarChart3 className="w-3 h-3" />
                      1536 dimensions
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
            <div className="flex gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                {settings.provider === 'local' ? (
                  <>
                    <p className="mb-1 font-medium">Local embeddings are perfect for:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-800 dark:text-blue-200">
                      <li>Getting started without API costs</li>
                      <li>Processing sensitive data privately</li>
                      <li>High volume operations (1000s per day)</li>
                      <li>English-language support tickets</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="mb-1 font-medium">OpenAI embeddings are best for:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-800 dark:text-blue-200">
                      <li>Highest quality semantic search</li>
                      <li>Low to medium volume (&lt; 10k per month)</li>
                      <li>When you&apos;re already using OpenAI for chat</li>
                      <li>Organizations with API budget</li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Local Embeddings Analytics Info */}
          {localIntegration?.enabled && !hasOpenAI && (
            <div className="p-4 bg-green-50 rounded-lg border border-green-200 dark:bg-green-950/20 dark:border-green-900">
              <div className="flex gap-2">
                <Zap className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-green-900 dark:text-green-100">
                  <p className="mb-1 font-medium">💡 Local embeddings provide basic AI analysis:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs text-green-800 dark:text-green-200">
                    <li>Category matching via semantic similarity</li>
                    <li>Ticket-worthiness detection (spam/promo filtering)</li>
                    <li>Priority detection based on keywords</li>
                    <li>Works without any AI Provider configured</li>
                  </ul>
                  <p className="mt-2 text-xs text-green-700 dark:text-green-300">
                    For advanced analysis (summarization, custom prompts), configure an AI Provider
                    in <strong>Settings → AI Providers</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Local Embeddings Integration Status */}
          {localIntegration && (
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                <div className="flex flex-1 gap-3 items-center">
                  <div
                    className={`w-2 h-2 rounded-full ${localIntegration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Local Embeddings Integration</p>
                    <p className="text-xs text-muted-foreground">
                      Xenova/all-MiniLM-L6-v2 • 384 dimensions • ~80MB
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs font-medium text-muted-foreground">
                    {localIntegration.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={localIntegration.enabled}
                    onClick={toggleLocalIntegration}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                      localIntegration.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        localIntegration.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 w-4 h-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </>
  );
};
