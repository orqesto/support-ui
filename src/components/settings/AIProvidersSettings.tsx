import { useState, useEffect } from 'react';
import { AIProviderHealthCheck } from '@/components/settings/AIProviderHealthCheck';
import { AIAutoReplyCard } from '@/components/settings/AIAutoReplyCard';
import { AINoProviderBanner } from '@/components/settings/AINoProviderBanner';
import { AnthropicProviderCard } from '@/components/settings/providers/AnthropicProviderCard';
import { DeepSeekProviderCard } from '@/components/settings/providers/DeepSeekProviderCard';
import { OpenAIProviderCard } from '@/components/settings/providers/OpenAIProviderCard';
import { PerplexityProviderCard } from '@/components/settings/providers/PerplexityProviderCard';
import { QwenProviderCard } from '@/components/settings/providers/QwenProviderCard';
import { OllamaProviderCard } from '@/components/settings/providers/OllamaProviderCard';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { aiService } from '@/services/ai.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { organizationService } from '@/services/organization.service';
import type { AIModel, AIProvider } from '@/types/aiProviders';
import { logger } from '@/lib/logger';

export const AIProvidersSettings = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModels, setShowModels] = useState<Record<string, boolean>>({});
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
  const [qwenModels, setQwenModels] = useState<AIModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<AIModel[]>([]);

  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: number;
    name: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([fetchIntegrations(), loadModels(), fetchAutoReplySettings()]).catch((error) => {
      logger.error('Failed to initialize:', error);
    });
  }, []);

  const fetchAutoReplySettings = async () => {
    try {
      const settings = await organizationService.getAutoReply();
      setAutoReplyEnabled(settings.enabled);
      setRequestMissingInfo(settings.requestMissingInfo);
      setSuggestSolutions(settings.suggestSolutions);
      setHighConfidenceThreshold(settings.highConfidenceThreshold);
      setTempThreshold(settings.highConfidenceThreshold);
    } catch (error) {
      logger.error('Failed to fetch auto-reply settings:', error);
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
      logger.error('Failed to update auto-reply setting:', error);
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
      logger.error('Failed to update requestMissingInfo:', error);
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
      logger.error('Failed to update suggestSolutions:', error);
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
    setTempThreshold(threshold);
  };

  const handleThresholdSave = async () => {
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
      logger.error('Failed to update threshold:', error);
      setAlertDialog({
        open: true,
        title: 'Error',
        description: 'Failed to update confidence threshold',
        variant: 'error',
      });
      setTempThreshold(highConfidenceThreshold);
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
              i.type === 'qwen' ||
              i.type === 'ollama' ||
              i.type === 'local_embeddings'
          )
        );
      }
    } catch (error) {
      logger.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const [openaiRes, anthropicRes, deepseekRes, perplexityRes, qwenRes, ollamaRes] =
        await Promise.all([
          aiService.getModels('openai'),
          aiService.getModels('anthropic'),
          aiService.getModels('deepseek'),
          aiService.getModels('perplexity'),
          aiService.getModels('qwen'),
          aiService.getModels('ollama'),
        ]);

      if (openaiRes.success) setOpenaiModels(openaiRes.data.all);
      if (anthropicRes.success) setAnthropicModels(anthropicRes.data.all);
      if (deepseekRes.success) setDeepseekModels(deepseekRes.data.all);
      if (perplexityRes.success) setPerplexityModels(perplexityRes.data.all);
      if (qwenRes.success) setQwenModels(qwenRes.data.all);
      if (ollamaRes.success) setOllamaModels(ollamaRes.data.all);
    } catch (error) {
      logger.error('Failed to load AI models:', error);
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
      logger.error(`Failed to save ${name} integration:`, error);
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
    if (!deleteConfirm) return;

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
      logger.error(`Failed to delete ${name}:`, error);
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

  const toggleEnabled = async (
    id: number,
    currentEnabled: boolean,
    name: string,
    type: string
  ) => {
    setToggling(id);
    const isEnabling = !currentEnabled;

    setIntegrations((prevIntegrations) =>
      prevIntegrations.map((integration) => {
        if (integration.id === id) {
          return { ...integration, enabled: isEnabling };
        }
        const isAIProvider = ['openai', 'anthropic', 'deepseek', 'perplexity', 'qwen', 'ollama'].includes(
          integration.type
        );
        if (isEnabling && isAIProvider) {
          return { ...integration, enabled: false };
        }
        return integration;
      })
    );

    try {
      const updatePayload: Partial<{
        name: string;
        enabled: boolean;
        config: Record<string, unknown>;
        type: string;
      }> & { disableOtherAIProviders?: boolean } = {
        enabled: isEnabling,
        type,
        disableOtherAIProviders: isEnabling,
      };

      const response = await integrationsService.update(id, updatePayload);
      if (response.success) {
        await fetchIntegrations();
        const successMessage = isEnabling
          ? `${name} enabled successfully! Other AI providers have been disabled.`
          : `${name} disabled successfully!`;
        setAlertDialog({
          open: true,
          title: 'Success',
          description: successMessage,
          variant: 'success',
        });
      } else {
        setIntegrations((prevIntegrations) =>
          prevIntegrations.map((integration) =>
            integration.id === id ? { ...integration, enabled: currentEnabled } : integration
          )
        );
        setAlertDialog({
          open: true,
          title: 'Error',
          description:
            response.error ?? `Failed to ${!currentEnabled ? 'enable' : 'disable'} ${name}`,
          variant: 'error',
        });
      }
    } catch (error) {
      setIntegrations((prevIntegrations) =>
        prevIntegrations.map((integration) =>
          integration.id === id ? { ...integration, enabled: currentEnabled } : integration
        )
      );
      logger.error(`Failed to toggle ${name}:`, error);
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
      logger.error(`Failed to test ${name} connection:`, error);
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
  const qwenIntegrations = integrations.filter((i) => i.type === 'qwen');
  const ollamaIntegrations = integrations.filter((i) => i.type === 'ollama');

  const hasAnyProvider =
    openaiIntegrations.length > 0 ||
    anthropicIntegrations.length > 0 ||
    deepseekIntegrations.length > 0 ||
    perplexityIntegrations.length > 0 ||
    qwenIntegrations.length > 0 ||
    ollamaIntegrations.length > 0;

  const commonProviderProps = {
    showModels,
    testing,
    deleting,
    saving,
    toggling,
    editingId,
    onToggleModels: toggleModels,
    onTest: testConnection,
    onDelete: handleDeleteClick,
    onToggleEnabled: toggleEnabled,
    onCancel: () => setEditingId(null),
  };

  return (
    <div className="space-y-6">
      {hasAnyProvider && <AIProviderHealthCheck />}

      {hasAnyProvider && (
        <AIAutoReplyCard
          autoReplyEnabled={autoReplyEnabled}
          requestMissingInfo={requestMissingInfo}
          suggestSolutions={suggestSolutions}
          highConfidenceThreshold={highConfidenceThreshold}
          tempThreshold={tempThreshold}
          savingAutoReply={savingAutoReply}
          thresholdSaved={thresholdSaved}
          onAutoReplyChange={handleAutoReplyChange}
          onRequestMissingInfoChange={handleRequestMissingInfoChange}
          onSuggestSolutionsChange={handleSuggestSolutionsChange}
          onThresholdChange={handleThresholdChange}
          onThresholdSave={handleThresholdSave}
        />
      )}

      {!hasAnyProvider && <AINoProviderBanner />}

      <OpenAIProviderCard
        {...commonProviderProps}
        integrations={openaiIntegrations}
        models={openaiModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onSave={(config) =>
          saveIntegration('OpenAI', 'openai', config as Record<string, string | number | boolean>)
        }
      />

      <AnthropicProviderCard
        {...commonProviderProps}
        integrations={anthropicIntegrations}
        models={anthropicModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onSave={(config) =>
          saveIntegration(
            'Anthropic',
            'anthropic',
            config as Record<string, string | number | boolean>
          )
        }
      />

      <DeepSeekProviderCard
        {...commonProviderProps}
        integrations={deepseekIntegrations}
        models={deepseekModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onSave={(config) =>
          saveIntegration(
            'DeepSeek',
            'deepseek',
            config as Record<string, string | number | boolean>
          )
        }
      />

      <PerplexityProviderCard
        {...commonProviderProps}
        integrations={perplexityIntegrations}
        models={perplexityModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onSave={(config) =>
          saveIntegration(
            'Perplexity',
            'perplexity',
            config as Record<string, string | number | boolean>
          )
        }
      />

      <QwenProviderCard
        {...commonProviderProps}
        integrations={qwenIntegrations}
        models={qwenModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onSave={(config) =>
          saveIntegration('Qwen', 'qwen', config as Record<string, string | number | boolean>)
        }
      />

      <OllamaProviderCard
        {...commonProviderProps}
        integrations={ollamaIntegrations}
        models={ollamaModels}
        onEdit={(integration) => setEditingId(integration.id)}
        onSave={(config) =>
          saveIntegration('Ollama', 'ollama', config as Record<string, string | number | boolean>)
        }
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
