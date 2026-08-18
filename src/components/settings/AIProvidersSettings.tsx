import { Bot } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { AiProviderModeSwitch } from '@/components/settings/AiProviderModeSwitch';
import { AIProviderHealthCheck } from '@/components/settings/AIProviderHealthCheck';
import { AckReplyPerSourceList } from '@/components/settings/AckReplyPerSourceList';
import { AINoProviderBanner } from '@/components/settings/AINoProviderBanner';
import { VisionSettings } from '@/components/settings/VisionSettings';
import { AnthropicProviderCard } from '@/components/settings/providers/AnthropicProviderCard';
import { BedrockProviderCard } from '@/components/settings/providers/BedrockProviderCard';
import { CustomProviderCard } from '@/components/settings/providers/CustomProviderCard';
import { DeepSeekProviderCard } from '@/components/settings/providers/DeepSeekProviderCard';
import { OpenAIProviderCard } from '@/components/settings/providers/OpenAIProviderCard';
import { PerplexityProviderCard } from '@/components/settings/providers/PerplexityProviderCard';
import { QwenProviderCard } from '@/components/settings/providers/QwenProviderCard';
import { OllamaProviderCard } from '@/components/settings/providers/OllamaProviderCard';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { aiService } from '@/services/ai.service';
import { onboardingService } from '@/services/onboarding.service';
import { organizationService } from '@/services/organization.service';
import { integrationsService, type Integration } from '@/services/integrations.service';
import { isAIProviderType, type AIModel, type AIProvider } from '@/types/aiProviders';
import { logger } from '@/lib/logger';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';

export const AIProvidersSettings = ({ showModeSwitch = false }: { showModeSwitch?: boolean }) => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModels, setShowModels] = useState<Record<string, boolean>>({});

  // AI-mode switch (org_admin, Settings only — omitted in the onboarding wizard, which has
  // its own intent-based AiChoiceStep). Reflects the org's live settings.aiMode.
  const [aiMode, setAiMode] = useState<'byo' | 'managed'>('byo');
  const [managedAvailable, setManagedAvailable] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);

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
    Promise.all([fetchIntegrations(), loadModels()]).catch((error) => {
      logger.error('Failed to initialize:', error);
    });
  }, []);

  useEffect(() => {
    if (!showModeSwitch) return;
    Promise.all([organizationService.getAiMode(), onboardingService.getStatus()])
      .then(([mode, status]) => {
        setAiMode(mode);
        setManagedAvailable(status.managedAiAvailable ?? false);
      })
      .catch((error) => logger.error('Failed to load AI mode:', error));
  }, [showModeSwitch]);

  const handleProviderDisabled = useCallback((data: unknown) => {
    const event = data as { name?: string; provider?: string; reason?: string };
    const label = event.name ?? event.provider ?? 'An AI provider';
    fetchIntegrations().catch((err) => logger.error('Failed to refresh integrations:', err));
    setAlertDialog({
      open: true,
      title: 'AI Provider Disabled',
      description: `${label} was automatically disabled due to a health check failure${event.reason ? `: ${event.reason}` : '.'} Please review and re-enable it once the issue is resolved.`,
      variant: 'warning',
    });
  }, []);

  useEffect(() => {
    subscribeToEvent('provider_disabled', handleProviderDisabled);
    return () => unsubscribeFromEvent('provider_disabled', handleProviderDisabled);
  }, [handleProviderDisabled]);

  const fetchIntegrations = async () => {
    try {
      const response = await integrationsService.getAll();
      if (response.success && response.data) {
        setIntegrations(
          response.data.filter(
            (integ) => isAIProviderType(integ.type) || integ.type === 'local_embeddings'
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

  const handleSelectMode = async (next: 'byo' | 'managed') => {
    if (next === aiMode || modeSaving) return;
    setModeSaving(true);
    try {
      await organizationService.setAiModeSelf(next);
      setAiMode(next);
      setAlertDialog({
        open: true,
        title: next === 'managed' ? 'Managed AI enabled' : 'Your own provider enabled',
        description:
          next === 'managed'
            ? 'We now handle the AI for this workspace. Your own provider keys are kept but not used while managed AI is on.'
            : 'AI now uses your own provider. Configure a provider below to turn AI features on.',
        variant: 'success',
      });
    } catch (error) {
      // apiClient rejects with an Error carrying `.data` (the 403 body incl. `code`).
      const err = error as { data?: { code?: string; message?: string }; message?: string };
      const code = err.data?.code;
      const description =
        code === 'managed_ai_not_entitled'
          ? 'Managed AI is not available on your current plan. Upgrade your plan, or connect your own provider.'
          : code === 'managed_ai_requires_verified_admin'
            ? 'A verified-email admin is required before enabling managed AI. Verify an admin email, then try again.'
            : (err.data?.message ?? err.message ?? 'Failed to change AI mode.');
      setAlertDialog({ open: true, title: 'Could not switch AI mode', description, variant: 'error' });
    } finally {
      setModeSaving(false);
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

  const toggleEnabled = async (id: number, currentEnabled: boolean, name: string, type: string) => {
    setToggling(id);
    const isEnabling = !currentEnabled;

    setIntegrations((prevIntegrations) =>
      prevIntegrations.map((integration) => {
        if (integration.id === id) {
          return { ...integration, enabled: isEnabling };
        }
        if (isEnabling && isAIProviderType(integration.type)) {
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

  const testConnection = async (id: number, name: string, type: string) => {
    setTesting(id);
    try {
      const response = await integrationsService.test(id, type);
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

  const openaiIntegrations = integrations.filter((integ) => integ.type === 'openai');
  const anthropicIntegrations = integrations.filter((integ) => integ.type === 'anthropic');
  const deepseekIntegrations = integrations.filter((integ) => integ.type === 'deepseek');
  const perplexityIntegrations = integrations.filter((integ) => integ.type === 'perplexity');
  const qwenIntegrations = integrations.filter((integ) => integ.type === 'qwen');
  const ollamaIntegrations = integrations.filter((integ) => integ.type === 'ollama');
  const bedrockIntegrations = integrations.filter((integ) => integ.type === 'bedrock');
  const customIntegrations = integrations.filter((integ) => integ.type === 'custom');

  const hasAnyProvider =
    openaiIntegrations.length > 0 ||
    anthropicIntegrations.length > 0 ||
    deepseekIntegrations.length > 0 ||
    perplexityIntegrations.length > 0 ||
    qwenIntegrations.length > 0 ||
    ollamaIntegrations.length > 0 ||
    bedrockIntegrations.length > 0 ||
    customIntegrations.length > 0;

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

  const isManaged = showModeSwitch && aiMode === 'managed';

  return (
    <div className="space-y-6">
      {showModeSwitch && (
        <AiProviderModeSwitch
          mode={aiMode}
          managedAvailable={managedAvailable}
          saving={modeSaving}
          onSelect={handleSelectMode}
        />
      )}

      {isManaged && (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              Managed AI is on — we handle model access for this workspace, so there&apos;s nothing
              to configure here. Switch to <strong>Bring your own keys</strong> above to use your
              own provider.
            </p>
          </div>
          <AckReplyPerSourceList onShowAlert={setAlertDialog} />
        </>
      )}

      {!isManaged && (
        <>
          {hasAnyProvider && <AIProviderHealthCheck />}

      {/* Orientation banner: two auto-reply mechanisms exist, but only ack-reply
          is configured here. AI Auto-Reply behaviour moved to /settings#ai →
          Auto-Reply because it's a behaviour policy, not a provider concern. */}
      <div className="px-4 py-3 text-xs rounded-md border bg-muted/30 text-muted-foreground">
        <p className="leading-relaxed">
          <strong className="text-foreground">Two kinds of auto-reply</strong> can fire on an
          inbound message: <strong>Acknowledgment auto-reply</strong> (configured below, per email
          source) sends a prepared "we got your message" note with a public tracking link — always,
          on the first inbound. <strong>AI Auto-Reply</strong> drafts a real answer when the AI has
          high confidence in the documentation; configure it under{' '}
          <a href="#ai" className="font-medium underline text-foreground">
            AI → Auto-Reply
          </a>
          . They run independently.
        </p>
      </div>

      {!hasAnyProvider && <AINoProviderBanner />}

      <AckReplyPerSourceList onShowAlert={setAlertDialog} />

      {hasAnyProvider && <VisionSettings />}

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

      <BedrockProviderCard
        integrations={bedrockIntegrations}
        showModels={showModels}
        deleting={deleting}
        saving={saving}
        toggling={toggling}
        editingId={editingId}
        onToggleModels={toggleModels}
        onDelete={handleDeleteClick}
        onToggleEnabled={toggleEnabled}
        onEdit={(integration) => setEditingId(integration.id)}
        onCancel={() => setEditingId(null)}
        onSave={(config) =>
          saveIntegration(
            'Bedrock',
            'bedrock',
            config as unknown as Record<string, string | number | boolean>
          )
        }
      />

      <CustomProviderCard
        integrations={customIntegrations}
        showModels={showModels}
        testing={testing}
        deleting={deleting}
        saving={saving}
        toggling={toggling}
        editingId={editingId}
        onToggleModels={toggleModels}
        onTest={testConnection}
        onDelete={handleDeleteClick}
        onToggleEnabled={toggleEnabled}
        onEdit={(integration) => setEditingId(integration.id)}
        onCancel={() => setEditingId(null)}
        onSave={(config) =>
          saveIntegration(
            'Custom',
            'custom',
            config as unknown as Record<string, string | number | boolean>
          )
        }
      />

        </>
      )}

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
