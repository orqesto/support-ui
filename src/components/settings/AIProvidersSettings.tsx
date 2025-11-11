import { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Sparkles,
  MessageCircle,
} from 'lucide-react';
import { AnthropicProviderCard } from '@/components/settings/providers/AnthropicProviderCard';
import { DeepSeekProviderCard } from '@/components/settings/providers/DeepSeekProviderCard';
import { OpenAIProviderCard } from '@/components/settings/providers/OpenAIProviderCard';
import { PerplexityProviderCard } from '@/components/settings/providers/PerplexityProviderCard';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { aiService } from '@/services/ai.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { organizationService } from '@/services/organization.service';
import type { AIModel, AIProvider } from '@/types/aiProviders';

export const AIProvidersSettings = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModels, setShowModels] = useState<Record<string, boolean>>({});
  const [showFeatureDetails, setShowFeatureDetails] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [requestMissingInfo, setRequestMissingInfo] = useState(true);
  const [suggestSolutions, setSuggestSolutions] = useState(true);
  const [highConfidenceThreshold, setHighConfidenceThreshold] = useState(0.9);
  const [tempThreshold, setTempThreshold] = useState(0.9);
  const [savingAutoReply, setSavingAutoReply] = useState(false);
  const [thresholdSaved, setThresholdSaved] = useState(false);

  const [openaiModels, setOpenaiModels] = useState<AIModel[]>([]);
  const [anthropicModels, setAnthropicModels] = useState<AIModel[]>([]);
  const [deepseekModels, setDeepseekModels] = useState<AIModel[]>([]);
  const [perplexityModels, setPerplexityModels] = useState<AIModel[]>([]);

  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string; type: string } | null>(null);

  useEffect(() => {
    Promise.all([
      fetchIntegrations(),
      loadModels(),
      fetchPreferredProvider(),
      fetchAutoReplySettings(),
    ]).catch((error) => {
      console.error('Failed to initialize:', error);
    });
  }, []);

  const fetchPreferredProvider = async () => {
    try {
      const provider = await organizationService.getAIProvider();
      setPreferredProvider(provider);
    } catch (error) {
      console.error('Failed to fetch preferred provider:', error);
    }
  };

  const fetchAutoReplySettings = async () => {
    try {
      const settings = await organizationService.getAutoReply();
      setAutoReplyEnabled(settings.enabled);
      setRequestMissingInfo(settings.requestMissingInfo);
      setSuggestSolutions(settings.suggestSolutions);
      setHighConfidenceThreshold(settings.highConfidenceThreshold);
      setTempThreshold(settings.highConfidenceThreshold);
    } catch (error) {
      console.error('Failed to fetch auto-reply settings:', error);
    }
  };

  const handleProviderChange = async (provider: string | null) => {
    setSavingProvider(true);
    try {
      await organizationService.updateAIProvider(provider);
      setPreferredProvider(provider);
      setAlertDialog({
        open: true,
        title: 'Success',
        description: `Preferred AI provider ${provider ? `set to ${provider}` : 'cleared'}. This will be used for translations and AI features.`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to update preferred provider:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update preferred provider',
        variant: 'error',
      });
    } finally {
      setSavingProvider(false);
    }
  };

  const handleAutoReplyChange = async (enabled: boolean) => {
    setSavingAutoReply(true);
    try {
      await organizationService.updateAutoReply({ enabled });
      setAutoReplyEnabled(enabled);
      setAlertDialog({
        open: true,
        title: 'Success',
        description: `AI Auto-Reply ${enabled ? 'enabled' : 'disabled'} successfully.`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to update auto-reply setting:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update auto-reply setting',
        variant: 'error',
      });
    } finally {
      setSavingAutoReply(false);
    }
  };

  const handleRequestMissingInfoChange = async (enabled: boolean) => {
    setRequestMissingInfo(enabled);
    setSavingAutoReply(true);
    try {
      await organizationService.updateAutoReply({ requestMissingInfo: enabled });
      setAlertDialog({
        open: true,
        title: 'Success',
        description: `Missing info requests ${enabled ? 'enabled' : 'disabled'} successfully`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to update requestMissingInfo:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update missing info setting',
        variant: 'error',
      });
    } finally {
      setSavingAutoReply(false);
    }
  };

  const handleSuggestSolutionsChange = async (enabled: boolean) => {
    setSuggestSolutions(enabled);
    setSavingAutoReply(true);
    try {
      await organizationService.updateAutoReply({ suggestSolutions: enabled });
      setAlertDialog({
        open: true,
        title: 'Success',
        description: `Solution suggestions ${enabled ? 'enabled' : 'disabled'} successfully`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to update suggestSolutions:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update solution suggestions setting',
        variant: 'error',
      });
    } finally {
      setSavingAutoReply(false);
    }
  };

  const handleThresholdChange = (threshold: number) => {
    // Just update temp value while dragging
    setTempThreshold(threshold);
  };

  const handleThresholdSave = async () => {
    // Save when slider is released
    if (tempThreshold === highConfidenceThreshold) {
      return;
    }

    setSavingAutoReply(true);
    try {
      await organizationService.updateAutoReply({ highConfidenceThreshold: tempThreshold });
      setHighConfidenceThreshold(tempThreshold);
      setThresholdSaved(true);
      setTimeout(() => setThresholdSaved(false), 2000);
    } catch (error) {
      console.error('Failed to update threshold:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update confidence threshold',
        variant: 'error',
      });
      setTempThreshold(highConfidenceThreshold); // Revert on error
    } finally {
      setSavingAutoReply(false);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const response = await integrationsService.getAll();
      if (response.success && response.data) {
        setIntegrations(
          response.data.filter(
            (i) =>
              i.type === 'openai' ||
              i.type === 'anthropic' ||
              i.type === 'deepseek' ||
              i.type === 'perplexity' ||
              i.type === 'local_embeddings'
          )
        );
      }
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const [openaiRes, anthropicRes, deepseekRes, perplexityRes] = await Promise.all([
        aiService.getModels('openai'),
        aiService.getModels('anthropic'),
        aiService.getModels('deepseek'),
        aiService.getModels('perplexity'),
      ]);

      if (openaiRes.success) {
        setOpenaiModels(openaiRes.data.all);
      }
      if (anthropicRes.success) {
        setAnthropicModels(anthropicRes.data.all);
      }
      if (deepseekRes.success) {
        setDeepseekModels(deepseekRes.data.all);
      }
      if (perplexityRes.success) {
        setPerplexityModels(perplexityRes.data.all);
      }
    } catch (error) {
      console.error('Failed to load AI models:', error);
    }
  };

  const saveIntegration = async (
    name: string,
    type: AIProvider,
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
        setEditingId(null);
        setAlertDialog({
          open: true,
          title: 'Success',
          description: `${name} integration saved successfully!`,
          variant: 'success',
        });
      }
    } catch (error) {
      console.error(`Failed to save ${name} integration:`, error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: `Failed to save ${name} integration`,
        variant: 'error',
      });
    } finally {
      setSaving(null);
    }
  };

  const handleDeleteClick = (id: number, name: string, type: string) => {
    setDeleteConfirm({ id, name, type });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) {
      return;
    }

    const { id, name, type } = deleteConfirm;
    setDeleting(id);
    setDeleteConfirm(null);

    try {
      const response = await integrationsService.delete(id, type);

      if (response.success) {
        await fetchIntegrations();
      } else {
        setAlertDialog({
          open: true,
          title: 'Error',
          description: `Failed to delete ${name}: ${response.error ?? 'Unknown error'}`,
          variant: 'error',
        });
      }
    } catch (error) {
      console.error(`Failed to delete ${name}:`, error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: `Failed to delete ${name}. Check console for details.`,
        variant: 'error',
      });
    } finally {
      setDeleting(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  const toggleEnabled = async (id: number, currentEnabled: boolean, name: string, type: string) => {
    setToggling(id);
    
    // Optimistic update - immediately update UI
    setIntegrations(prevIntegrations =>
      prevIntegrations.map(integration =>
        integration.id === id
          ? { ...integration, enabled: !currentEnabled }
          : integration
      )
    );
    
    try {
      // Include type to disambiguate which table to update (important when IDs overlap)
      const response = await integrationsService.update(id, { 
        enabled: !currentEnabled,
        type 
      });
      if (response.success) {
        // Confirm with server data
        await fetchIntegrations();
        setAlertDialog({
          open: true,
          title: 'Success',
          description: `${name} ${!currentEnabled ? 'enabled' : 'disabled'} successfully!`,
          variant: 'success',
        });
      } else {
        // Revert optimistic update on error
        setIntegrations(prevIntegrations =>
          prevIntegrations.map(integration =>
            integration.id === id
              ? { ...integration, enabled: currentEnabled }
              : integration
          )
        );
        setAlertDialog({
          open: true,
          title: 'Error',
          description: response.error ?? `Failed to ${!currentEnabled ? 'enable' : 'disable'} ${name}`,
          variant: 'error',
        });
      }
    } catch (error) {
      // Revert optimistic update on error
      setIntegrations(prevIntegrations =>
        prevIntegrations.map(integration =>
          integration.id === id
            ? { ...integration, enabled: currentEnabled }
            : integration
        )
      );
      console.error(`Failed to toggle ${name}:`, error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: `Failed to ${!currentEnabled ? 'enable' : 'disable'} ${name}`,
        variant: 'error',
      });
    } finally {
      setToggling(null);
    }
  };

  const testConnection = async (id: number, name: string) => {
    setTesting(id);
    try {
      const response = await integrationsService.test(id);
      if (response.success) {
        setAlertDialog({
          open: true,
          title: 'Test Successful',
          description: `${name} connection test successful!`,
          variant: 'success',
        });
      } else {
        setAlertDialog({
          open: true,
          title: 'Test Failed',
          description: `${name} connection test failed: ${response.message}`,
          variant: 'error',
        });
      }
    } catch (error) {
      console.error(`Failed to test ${name} connection:`, error);
      setAlertDialog({
        open: true,
        title: 'Test Failed',
        description: `Failed to test ${name} connection`,
        variant: 'error',
      });
    } finally {
      setTesting(null);
    }
  };

  const toggleModels = (integrationId: number) => {
    setShowModels((prev) => ({
      ...prev,
      [integrationId]: !prev[integrationId],
    }));
  };

  if (loading) {
    return <div className="py-12 text-center">Loading AI providers...</div>;
  }

  const openaiIntegrations = integrations.filter((i) => i.type === 'openai');
  const anthropicIntegrations = integrations.filter((i) => i.type === 'anthropic');
  const deepseekIntegrations = integrations.filter((i) => i.type === 'deepseek');
  const perplexityIntegrations = integrations.filter((i) => i.type === 'perplexity');

  // Only check for AI chat providers (not email, telegram, local embeddings, etc.)
  const hasAnyProvider =
    openaiIntegrations.length > 0 ||
    anthropicIntegrations.length > 0 ||
    deepseekIntegrations.length > 0 ||
    perplexityIntegrations.length > 0;

  const enabledProviders = integrations
    .filter(
      (i) =>
        i.type === 'openai' ||
        i.type === 'anthropic' ||
        i.type === 'deepseek' ||
        i.type === 'perplexity'
    )
    .map((i) => i.type);

  return (
    <div className="space-y-6">
      {/* Preferred AI Provider Selector - Show when multiple providers */}
      {enabledProviders.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2 items-center">
              <Sparkles className="w-5 h-5" />
              Preferred AI Provider
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select which AI provider to use by default for translations and AI features.
              </p>
              <div className="flex gap-3 items-center">
                <Select
                  value={preferredProvider ?? 'auto'}
                  onChange={(e) => {
                    const value = e.target.value === 'auto' ? null : e.target.value;
                    handleProviderChange(value).catch((err) => console.error(err));
                  }}
                  disabled={savingProvider}
                  className="flex-1 max-w-xs"
                >
                  <option value="auto">Auto (priority order)</option>
                  {enabledProviders.includes('openai') && <option value="openai">OpenAI</option>}
                  {enabledProviders.includes('anthropic') && (
                    <option value="anthropic">Anthropic</option>
                  )}
                  {enabledProviders.includes('deepseek') && (
                    <option value="deepseek">DeepSeek</option>
                  )}
                  {enabledProviders.includes('perplexity') && (
                    <option value="perplexity">Perplexity</option>
                  )}
                </Select>
                {savingProvider && <span className="text-sm text-muted-foreground">Saving...</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                {preferredProvider
                  ? `Currently using: ${preferredProvider}`
                  : 'Auto mode uses priority: OpenAI > Anthropic > DeepSeek > Perplexity'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Auto-Reply Toggle - Show when AI provider is configured */}
      {hasAnyProvider && (
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2 items-center">
              <MessageCircle className="w-5 h-5" />
              AI Auto-Reply
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                AI automatically replies to customer messages in two ways:
              </p>
              <div className="pl-4 space-y-1 text-sm text-muted-foreground">
                <p>
                  <strong>1. Request Missing Info:</strong> Asks customers for more details when
                  messages are incomplete
                </p>
                <p>
                  <strong>2. Suggest Solutions:</strong> Searches documentation, resolved tickets,
                  and previous messages to reply with solutions
                </p>
              </div>
              <div className="flex gap-3 items-center">
                <label className="flex gap-3 items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={autoReplyEnabled}
                      onChange={(e) => handleAutoReplyChange(e.target.checked)}
                      disabled={savingAutoReply}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                  </div>
                  <span className="text-sm font-medium">
                    {autoReplyEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
                {savingAutoReply && (
                  <span className="text-sm text-muted-foreground">Saving...</span>
                )}
              </div>

              {/* Request Missing Info Toggle */}
              {autoReplyEnabled && (
                <div className="pt-2 space-y-2 border-t">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">Request Missing Information</p>
                      <p className="text-xs text-muted-foreground">
                        AI asks customers for more details when messages are incomplete
                      </p>
                    </div>
                    <label className="flex gap-3 items-center cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={requestMissingInfo}
                          onChange={(e) => handleRequestMissingInfoChange(e.target.checked)}
                          disabled={savingAutoReply}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                      </div>
                      <span className="text-sm font-medium">
                        {requestMissingInfo ? 'On' : 'Off'}
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Suggest Solutions Toggle */}
              {autoReplyEnabled && (
                <div className="pt-2 space-y-2 border-t">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">Suggest Solutions</p>
                      <p className="text-xs text-muted-foreground">
                        AI searches docs, tickets, and messages to suggest solutions
                      </p>
                    </div>
                    <label className="flex gap-3 items-center cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={suggestSolutions}
                          onChange={(e) => handleSuggestSolutionsChange(e.target.checked)}
                          disabled={savingAutoReply}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                      </div>
                      <span className="text-sm font-medium">{suggestSolutions ? 'On' : 'Off'}</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Confidence Threshold Slider */}
              {autoReplyEnabled && suggestSolutions && (
                <div className="pt-2 space-y-2 border-t">
                  <div className="flex justify-between items-center">
                    <label htmlFor="highConfidenceThreshold" className="text-sm font-medium">
                      Auto-Send Confidence Threshold
                    </label>
                    <div className="flex gap-2 items-center">
                      <span className="text-sm font-medium text-primary">
                        {Math.round(tempThreshold * 100)}%
                      </span>
                      {thresholdSaved && (
                        <span className="text-xs text-green-600 dark:text-green-400 animate-fade-in">
                          ✓ Saved
                        </span>
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min="70"
                    max="100"
                    step="5"
                    value={Math.round(tempThreshold * 100)}
                    onChange={(e) => handleThresholdChange(Number(e.target.value) / 100)}
                    onMouseUp={handleThresholdSave}
                    onTouchEnd={handleThresholdSave}
                    disabled={savingAutoReply}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-primary"
                  />
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>
                      • <strong>≥{Math.round(tempThreshold * 100)}%:</strong> Auto-send email
                      immediately ✨
                    </p>
                    <p>
                      • <strong>70-{Math.round(tempThreshold * 100) - 1}%:</strong> Suggest answer
                      for agent review
                    </p>
                    <p>
                      • <strong>&lt;70%:</strong> Skip (not confident enough)
                    </p>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {autoReplyEnabled ? (
                  <>
                    AI{' '}
                    {requestMissingInfo &&
                      suggestSolutions &&
                      'requests missing details and suggests solutions'}
                    {requestMissingInfo && !suggestSolutions && 'requests missing details only'}
                    {!requestMissingInfo && suggestSolutions && 'suggests solutions only'}
                    {!requestMissingInfo &&
                      !suggestSolutions &&
                      'is enabled but no behaviors are active'}
                    . Max 1 AI reply per thread before human escalation.
                  </>
                ) : (
                  'AI auto-reply is currently disabled. All messages will require manual handling by support agents.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature Requirements Info - Only show when no AI provider */}
      {!hasAnyProvider && (
        <div className="p-3 bg-amber-50 rounded-lg border-2 border-amber-500 dark:bg-amber-950/50">
          <button
            onClick={() => setShowFeatureDetails(!showFeatureDetails)}
            className="flex justify-between items-center w-full text-left"
          >
            <div className="flex gap-2 items-center">
              <AlertCircle className="flex-shrink-0 w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                No AI provider configured. Some features unavailable.
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-amber-700 dark:text-amber-300">Details</span>
              {showFeatureDetails ? (
                <ChevronUp className="w-4 h-4 text-amber-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-amber-600" />
              )}
            </div>
          </button>

          {/* Accordion Content */}
          {showFeatureDetails && (
            <div className="grid grid-cols-1 gap-3 mt-3 text-xs md:grid-cols-2">
              {/* Features that work */}
              <div className="p-2 rounded border bg-background">
                <h4 className="flex gap-1.5 items-center mb-1.5 font-semibold text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  Works Without AI
                </h4>
                <ul className="space-y-0.5 text-muted-foreground text-xs">
                  <li>• Email ingestion</li>
                  <li>• Manual tickets</li>
                  <li>• Basic spam filter</li>
                  <li>• Local embeddings</li>
                </ul>
              </div>

              {/* Features that require AI */}
              <div className="p-2 rounded border bg-background">
                <h4 className="flex gap-1.5 items-center mb-1.5 font-semibold text-xs">
                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                  Requires AI Provider
                </h4>
                <ul className="space-y-0.5 text-muted-foreground text-xs">
                  <li>• Auto-reply</li>
                  <li>• Follow-up questions</li>
                  <li>• Smart priority</li>
                  <li>• Advanced spam detection</li>
                  <li>• AI summaries</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OpenAI Provider Card */}
      <OpenAIProviderCard
        integrations={openaiIntegrations}
        models={openaiModels}
        showModels={showModels}
        testing={testing}
        deleting={deleting}
        saving={saving}
        toggling={toggling}
        editingId={editingId}
        onToggleModels={toggleModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onTest={testConnection}
        onDelete={handleDeleteClick}
        onToggleEnabled={toggleEnabled}
        onSave={(config) =>
          saveIntegration('OpenAI', 'openai', config as Record<string, string | number | boolean>)
        }
        onCancel={() => setEditingId(null)}
      />

      {/* Anthropic Provider Card */}
      <AnthropicProviderCard
        integrations={anthropicIntegrations}
        models={anthropicModels}
        showModels={showModels}
        testing={testing}
        deleting={deleting}
        saving={saving}
        toggling={toggling}
        editingId={editingId}
        onToggleModels={toggleModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onTest={testConnection}
        onDelete={handleDeleteClick}
        onToggleEnabled={toggleEnabled}
        onSave={(config) =>
          saveIntegration(
            'Anthropic',
            'anthropic',
            config as Record<string, string | number | boolean>
          )
        }
        onCancel={() => setEditingId(null)}
      />

      {/* DeepSeek Provider Card */}
      <DeepSeekProviderCard
        integrations={deepseekIntegrations}
        models={deepseekModels}
        showModels={showModels}
        testing={testing}
        deleting={deleting}
        saving={saving}
        toggling={toggling}
        editingId={editingId}
        onToggleModels={toggleModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onTest={testConnection}
        onDelete={handleDeleteClick}
        onToggleEnabled={toggleEnabled}
        onSave={(config) =>
          saveIntegration(
            'DeepSeek',
            'deepseek',
            config as Record<string, string | number | boolean>
          )
        }
        onCancel={() => setEditingId(null)}
      />

      {/* Perplexity Provider Card */}
      <PerplexityProviderCard
        integrations={perplexityIntegrations}
        models={perplexityModels}
        showModels={showModels}
        testing={testing}
        deleting={deleting}
        saving={saving}
        toggling={toggling}
        editingId={editingId}
        onToggleModels={toggleModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onTest={testConnection}
        onDelete={handleDeleteClick}
        onToggleEnabled={toggleEnabled}
        onSave={(config) =>
          saveIntegration(
            'Perplexity',
            'perplexity',
            config as Record<string, string | number | boolean>
          )
        }
        onCancel={() => setEditingId(null)}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="flex fixed inset-0 z-50 justify-center items-center bg-black bg-opacity-50">
          <div className="p-6 mx-4 w-full max-w-md rounded-lg shadow-xl bg-card">
            <h3 className="mb-2 text-lg font-semibold">Delete AI Provider?</h3>
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

      {/* Alert Dialog */}
      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </div>
  );
};
