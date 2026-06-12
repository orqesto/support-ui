import { useState, useEffect, useCallback } from 'react';
import { AIProviderHealthCheck } from '@/components/settings/AIProviderHealthCheck';
import { AckReplyPerSourceList } from '@/components/settings/AckReplyPerSourceList';
import { AutoReplyConfiguration } from '@/components/settings/AutoReplyConfiguration';
import { AINoProviderBanner } from '@/components/settings/AINoProviderBanner';
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
import { integrationsService, type Integration } from '@/services/integrations.service';
import type { AIModel, AIProvider } from '@/types/aiProviders';
import { logger } from '@/lib/logger';
import { subscribeToEvent, unsubscribeFromEvent } from '@/lib/socketManager';

export const AIProvidersSettings = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModels, setShowModels] = useState<Record<string, boolean>>({});
  // Org-level auto-reply state moved to AutoReplyConfiguration (which owns its
  // own load + save). Card kept here only via that component now.

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

  const handleProviderDisabled = useCallback(
    (data: unknown) => {
      const event = data as { name?: string; provider?: string; reason?: string };
      const label = event.name ?? event.provider ?? 'An AI provider';
      fetchIntegrations().catch((err) => logger.error('Failed to refresh integrations:', err));
      setAlertDialog({
        open: true,
        title: 'AI Provider Disabled',
        description: `${label} was automatically disabled due to a health check failure${event.reason ? `: ${event.reason}` : '.'} Please review and re-enable it once the issue is resolved.`,
        variant: 'warning',
      });
    },
    []
  );

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
            (integ) =>
              integ.type === 'openai' ||
              integ.type === 'anthropic' ||
              integ.type === 'deepseek' ||
              integ.type === 'perplexity' ||
              integ.type === 'qwen' ||
              integ.type === 'ollama' ||
              integ.type === 'bedrock' ||
              integ.type === 'local_embeddings'
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
        const isAIProvider = ['openai', 'anthropic', 'deepseek', 'perplexity', 'qwen', 'ollama', 'bedrock'].includes(
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

  return (
    <div className="space-y-6">
      {hasAnyProvider && <AIProviderHealthCheck />}

      {/* Compact orientation banner: customers see TWO automatic emails on
          inbound — the immediate ack with a tracking link (per source,
          configured below) and the AI-drafted answer (per org + per dept,
          configured here). Disambiguates a section where every card is
          labeled "Auto-Reply" something. */}
      <div className="px-4 py-3 text-xs rounded-md border bg-muted/30 text-muted-foreground">
        <p className="leading-relaxed">
          <strong className="text-foreground">Two kinds of auto-reply</strong> can fire on an
          inbound message:{' '}
          <strong>AI Auto-Reply</strong> drafts a real answer when the AI has high confidence in
          the documentation, and{' '}
          <strong>Acknowledgment auto-reply</strong> sends a prepared "we got your message" note
          with a public tracking link — always, on the first inbound. They run independently.
          Most orgs want acknowledgment <em>on</em> per email source; AI auto-reply <em>on</em>{' '}
          once the knowledge base is mature.
        </p>
      </div>

      {hasAnyProvider && <AutoReplyConfiguration onShowAlert={setAlertDialog} />}

      {!hasAnyProvider && <AINoProviderBanner />}

      {/* Both kinds of auto-reply on inbound live near each other. The
          per-source acknowledgment is the immediate "got your message
          with tracking link" path; AI Auto-Reply above is the
          substantive AI-generated answer. Not gated by hasAnyProvider —
          ack-reply works without an AI provider configured. */}
      <AckReplyPerSourceList onShowAlert={setAlertDialog} />

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
