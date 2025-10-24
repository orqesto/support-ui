import { useState, useEffect } from 'react';
import {
  Brain,
  Plus,
  Save,
  Trash2,
  Edit,
  TestTube2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { aiService } from '@/services/ai.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import type { AIModel, AIProvider } from '@/types/aiProviders';
import { AlertDialog } from '../ui/AlertDialog';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Select } from '../ui/Select';

export const AIProvidersSettings = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showOpenAIForm, setShowOpenAIForm] = useState(false);
  const [showAnthropicForm, setShowAnthropicForm] = useState(false);
  const [showDeepSeekForm, setShowDeepSeekForm] = useState(false);
  const [showPerplexityForm, setShowPerplexityForm] = useState(false);
  const [showModels, setShowModels] = useState<Record<string, boolean>>({});
  const [showFeatureDetails, setShowFeatureDetails] = useState(false);

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

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);

  const [openaiConfig, setOpenaiConfig] = useState({
    apiKey: '',
    baseUrl: '',
    organization: '',
    defaultChatModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-small',
  });

  const [anthropicConfig, setAnthropicConfig] = useState({
    apiKey: '',
    baseUrl: '',
    defaultModel: 'claude-3-5-sonnet-20241022',
  });

  const [deepseekConfig, setDeepseekConfig] = useState({
    apiKey: '',
    baseUrl: '',
    defaultModel: 'deepseek-chat',
  });

  const [perplexityConfig, setPerplexityConfig] = useState({
    apiKey: '',
    baseUrl: '',
    defaultModel: 'llama-3.1-sonar-large-128k-online',
  });

  useEffect(() => {
    Promise.all([fetchIntegrations(), loadModels()]).catch((error) => {
      console.error('Failed to initialize:', error);
    });
  }, []);

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

  const resetForm = (type: AIProvider) => {
    if (type === 'openai') {
      setOpenaiConfig({
        apiKey: '',
        baseUrl: '',
        organization: '',
        defaultChatModel: 'gpt-4o-mini',
        defaultEmbeddingModel: 'text-embedding-3-small',
      });
      setShowOpenAIForm(false);
    } else if (type === 'anthropic') {
      setAnthropicConfig({
        apiKey: '',
        baseUrl: '',
        defaultModel: 'claude-3-5-sonnet-20241022',
      });
      setShowAnthropicForm(false);
    } else if (type === 'deepseek') {
      setDeepseekConfig({
        apiKey: '',
        baseUrl: '',
        defaultModel: 'deepseek-chat',
      });
      setShowDeepSeekForm(false);
    } else if (type === 'perplexity') {
      setPerplexityConfig({
        apiKey: '',
        baseUrl: '',
        defaultModel: 'llama-3.1-sonar-large-128k-online',
      });
      setShowPerplexityForm(false);
    }
    setEditingId(null);
  };

  const loadForEdit = (integration: Integration) => {
    setEditingId(integration.id);
    const config = integration.config;
    if (integration.type === 'openai') {
      setOpenaiConfig(config as typeof openaiConfig);
      setShowOpenAIForm(true);
    } else if (integration.type === 'anthropic') {
      setAnthropicConfig(config as typeof anthropicConfig);
      setShowAnthropicForm(true);
    } else if (integration.type === 'deepseek') {
      setDeepseekConfig(config as typeof deepseekConfig);
      setShowDeepSeekForm(true);
    } else if (integration.type === 'perplexity') {
      setPerplexityConfig(config as typeof perplexityConfig);
      setShowPerplexityForm(true);
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
        resetForm(type);
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

  const hasAnyProvider = integrations.length > 0;

  return (
    <div className="space-y-6">
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
      {/* OpenAI Integration */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <Brain className="w-5 h-5 text-green-600" />
              OpenAI
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm('openai');
                setShowOpenAIForm(!showOpenAIForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              {openaiIntegrations.length > 0 ? 'Update' : 'Add'} OpenAI
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of OpenAI integrations */}
          {openaiIntegrations.length > 0 && (
            <div className="space-y-2">
              {openaiIntegrations.map((integration) => (
                <div key={integration.id} className="rounded-lg border">
                  <div className="flex justify-between items-center p-3">
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <p className="font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Chat:{' '}
                          {(integration.config as { defaultChatModel?: string }).defaultChatModel} •
                          Embedding:{' '}
                          {
                            (integration.config as { defaultEmbeddingModel?: string })
                              .defaultEmbeddingModel
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleModels(integration.id)}
                      >
                        {showModels[integration.id] ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
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
                        <TestTube2 className="mr-2 w-4 h-4" />
                        Poke
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(integration.id, integration.name)}
                        isLoading={deleting === integration.id}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {/* Show available models */}
                  {showModels[integration.id] && (
                    <div className="p-3 border-t bg-muted/30">
                      <h5 className="mb-2 text-sm font-medium">Available Models:</h5>
                      <div className="grid grid-cols-2 gap-2">
                        {openaiModels.map((model) => (
                          <div key={model.id} className="p-2 text-xs rounded border bg-background">
                            <p className="font-medium">{model.name}</p>
                            <p className="text-muted-foreground">
                              {model.type} • {model.contextWindow.toLocaleString()} tokens
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showOpenAIForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit OpenAI Configuration' : 'Add OpenAI Configuration'}
              </h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="apiKey" className="text-sm font-medium">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={openaiConfig.apiKey}
                    onChange={(e) => setOpenaiConfig({ ...openaiConfig, apiKey: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="sk-..."
                  />
                </div>
                <Select
                  label="Default Chat Model"
                  value={openaiConfig.defaultChatModel}
                  onChange={(e) =>
                    setOpenaiConfig({ ...openaiConfig, defaultChatModel: e.target.value })
                  }
                >
                  {openaiModels
                    .filter((m) => m.type === 'chat')
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                </Select>
                <Select
                  label="Default Embedding Model"
                  value={openaiConfig.defaultEmbeddingModel}
                  onChange={(e) =>
                    setOpenaiConfig({ ...openaiConfig, defaultEmbeddingModel: e.target.value })
                  }
                >
                  {openaiModels
                    .filter((m) => m.type === 'embedding')
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                </Select>
                <div>
                  <label htmlFor="organization" className="text-sm font-medium">
                    Organization ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={openaiConfig.organization}
                    onChange={(e) =>
                      setOpenaiConfig({ ...openaiConfig, organization: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="org-..."
                  />
                </div>
                <div>
                  <label htmlFor="baseUrl" className="text-sm font-medium">
                    Base URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={openaiConfig.baseUrl}
                    onChange={(e) => setOpenaiConfig({ ...openaiConfig, baseUrl: e.target.value })}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="https://api.openai.com"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `OpenAI-${editingId}` : 'OpenAI',
                      'openai',
                      openaiConfig
                    )
                  }
                  isLoading={saving === 'openai'}
                  disabled={!openaiConfig.apiKey}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} OpenAI
                </Button>
                <Button variant="outline" onClick={() => resetForm('openai')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {openaiIntegrations.length === 0 && !showOpenAIForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No OpenAI configuration
            </p>
          )}
        </CardContent>
      </Card>

      {/* Anthropic Integration */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <Brain className="w-5 h-5 text-orange-600" />
              Anthropic (Claude)
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm('anthropic');
                setShowAnthropicForm(!showAnthropicForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              {anthropicIntegrations.length > 0 ? 'Update' : 'Add'} Anthropic
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of Anthropic integrations */}
          {anthropicIntegrations.length > 0 && (
            <div className="space-y-2">
              {anthropicIntegrations.map((integration) => (
                <div key={integration.id} className="rounded-lg border">
                  <div className="flex justify-between items-center p-3">
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <p className="font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Model: {(integration.config as { defaultModel?: string }).defaultModel}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleModels(integration.id)}
                      >
                        {showModels[integration.id] ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
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
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(integration.id, integration.name)}
                        isLoading={deleting === integration.id}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {/* Show available models */}
                  {showModels[integration.id] && (
                    <div className="p-3 border-t bg-muted/30">
                      <h5 className="mb-2 text-sm font-medium">Available Models:</h5>
                      <div className="grid grid-cols-2 gap-2">
                        {anthropicModels.map((model) => (
                          <div key={model.id} className="p-2 text-xs rounded border bg-background">
                            <p className="font-medium">{model.name}</p>
                            <p className="text-muted-foreground">
                              {model.type} • {model.contextWindow.toLocaleString()} tokens
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showAnthropicForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Anthropic Configuration' : 'Add Anthropic Configuration'}
              </h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="apiKey" className="text-sm font-medium">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={anthropicConfig.apiKey}
                    onChange={(e) =>
                      setAnthropicConfig({ ...anthropicConfig, apiKey: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="sk-ant-..."
                  />
                </div>
                <Select
                  label="Default Model"
                  value={anthropicConfig.defaultModel}
                  onChange={(e) =>
                    setAnthropicConfig({ ...anthropicConfig, defaultModel: e.target.value })
                  }
                >
                  {anthropicModels
                    .filter((m) => m.type === 'chat')
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                </Select>
                <div>
                  <label htmlFor="baseUrl" className="text-sm font-medium">
                    Base URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={anthropicConfig.baseUrl}
                    onChange={(e) =>
                      setAnthropicConfig({ ...anthropicConfig, baseUrl: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="https://api.anthropic.com"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `Anthropic-${editingId}` : 'Anthropic',
                      'anthropic',
                      anthropicConfig
                    )
                  }
                  isLoading={saving === 'anthropic'}
                  disabled={!anthropicConfig.apiKey}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Anthropic
                </Button>
                <Button variant="outline" onClick={() => resetForm('anthropic')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {anthropicIntegrations.length === 0 && !showAnthropicForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Anthropic configuration
            </p>
          )}
        </CardContent>
      </Card>

      {/* DeepSeek Integration */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <Brain className="w-5 h-5 text-blue-600" />
              DeepSeek
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm('deepseek');
                setShowDeepSeekForm(!showDeepSeekForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              {deepseekIntegrations.length > 0 ? 'Update' : 'Add'} DeepSeek
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of DeepSeek integrations */}
          {deepseekIntegrations.length > 0 && (
            <div className="space-y-2">
              {deepseekIntegrations.map((integration) => (
                <div key={integration.id} className="rounded-lg border">
                  <div className="flex justify-between items-center p-3">
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <p className="font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Model: {(integration.config as { defaultModel?: string }).defaultModel}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleModels(integration.id)}
                      >
                        {showModels[integration.id] ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
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
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(integration.id, integration.name)}
                        isLoading={deleting === integration.id}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {/* Show available models */}
                  {showModels[integration.id] && (
                    <div className="p-3 border-t bg-muted/30">
                      <h5 className="mb-2 text-sm font-medium">Available Models:</h5>
                      <div className="grid grid-cols-2 gap-2">
                        {deepseekModels.map((model) => (
                          <div key={model.id} className="p-2 text-xs rounded border bg-background">
                            <p className="font-medium">{model.name}</p>
                            <p className="text-muted-foreground">
                              {model.type} • {model.contextWindow.toLocaleString()} tokens
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showDeepSeekForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit DeepSeek Configuration' : 'Add DeepSeek Configuration'}
              </h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="apiKey" className="text-sm font-medium">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={deepseekConfig.apiKey}
                    onChange={(e) =>
                      setDeepseekConfig({ ...deepseekConfig, apiKey: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="sk-..."
                  />
                </div>
                <Select
                  label="Default Model"
                  value={deepseekConfig.defaultModel}
                  onChange={(e) =>
                    setDeepseekConfig({ ...deepseekConfig, defaultModel: e.target.value })
                  }
                >
                  {deepseekModels
                    .filter((m) => m.type === 'chat')
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                </Select>
                <div>
                  <label htmlFor="baseUrl" className="text-sm font-medium">
                    Base URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={deepseekConfig.baseUrl}
                    onChange={(e) =>
                      setDeepseekConfig({ ...deepseekConfig, baseUrl: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="https://api.deepseek.com"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `DeepSeek-${editingId}` : 'DeepSeek',
                      'deepseek',
                      deepseekConfig
                    )
                  }
                  isLoading={saving === 'deepseek'}
                  disabled={!deepseekConfig.apiKey}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} DeepSeek
                </Button>
                <Button variant="outline" onClick={() => resetForm('deepseek')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {deepseekIntegrations.length === 0 && !showDeepSeekForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No DeepSeek configuration
            </p>
          )}
        </CardContent>
      </Card>

      {/* Perplexity Integration */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex gap-2 items-center">
              <Brain className="w-5 h-5 text-purple-600" />
              Perplexity
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                resetForm('perplexity');
                setShowPerplexityForm(!showPerplexityForm);
              }}
            >
              <Plus className="mr-1 w-4 h-4" />
              {perplexityIntegrations.length > 0 ? 'Update' : 'Add'} Perplexity
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* List of Perplexity integrations */}
          {perplexityIntegrations.length > 0 && (
            <div className="space-y-2">
              {perplexityIntegrations.map((integration) => (
                <div key={integration.id} className="rounded-lg border">
                  <div className="flex justify-between items-center p-3">
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <p className="font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Model: {(integration.config as { defaultModel?: string }).defaultModel}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleModels(integration.id)}
                      >
                        {showModels[integration.id] ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
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
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(integration.id, integration.name)}
                        isLoading={deleting === integration.id}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {/* Show available models */}
                  {showModels[integration.id] && (
                    <div className="p-3 border-t bg-muted/30">
                      <h5 className="mb-2 text-sm font-medium">Available Models:</h5>
                      <div className="grid grid-cols-2 gap-2">
                        {perplexityModels.map((model) => (
                          <div key={model.id} className="p-2 text-xs rounded border bg-background">
                            <p className="font-medium">{model.name}</p>
                            <p className="text-muted-foreground">
                              {model.type} • {model.contextWindow.toLocaleString()} tokens
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit form */}
          {showPerplexityForm && (
            <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium">
                {editingId ? 'Edit Perplexity Configuration' : 'Add Perplexity Configuration'}
              </h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="apiKey" className="text-sm font-medium">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={perplexityConfig.apiKey}
                    onChange={(e) =>
                      setPerplexityConfig({ ...perplexityConfig, apiKey: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="pplx-..."
                  />
                </div>
                <Select
                  label="Default Model"
                  value={perplexityConfig.defaultModel}
                  onChange={(e) =>
                    setPerplexityConfig({ ...perplexityConfig, defaultModel: e.target.value })
                  }
                >
                  {perplexityModels
                    .filter((m) => m.type === 'chat')
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                </Select>
                <div>
                  <label htmlFor="baseUrl" className="text-sm font-medium">
                    Base URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={perplexityConfig.baseUrl}
                    onChange={(e) =>
                      setPerplexityConfig({ ...perplexityConfig, baseUrl: e.target.value })
                    }
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                    placeholder="https://api.perplexity.ai"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveIntegration(
                      editingId ? `Perplexity-${editingId}` : 'Perplexity',
                      'perplexity',
                      perplexityConfig
                    )
                  }
                  isLoading={saving === 'perplexity'}
                  disabled={!perplexityConfig.apiKey}
                >
                  <Save className="mr-2 w-4 h-4" />
                  {editingId ? 'Update' : 'Save'} Perplexity
                </Button>
                <Button variant="outline" onClick={() => resetForm('perplexity')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {perplexityIntegrations.length === 0 && !showPerplexityForm && (
            <p className="py-4 text-sm text-center text-muted-foreground">
              No Perplexity configuration
            </p>
          )}
        </CardContent>
      </Card>

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
