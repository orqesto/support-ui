/**
 * Custom OpenAI-compatible provider card.
 *
 * Lets admins plug in any endpoint that speaks the OpenAI HTTP shape —
 * LiteLLM, vLLM, LM Studio, OpenRouter, Together AI, Groq, Cerebras,
 * Anyscale, self-hosted gateways, etc. — without us shipping a vendor-
 * specific card. Configuration is intentionally minimal: name + baseUrl
 * + optional apiKey + chosen model.
 *
 * Model dropdown is populated live from {baseUrl}/v1/models via the
 * useCustomProviderModels hook. When discovery fails (404, SSRF block,
 * timeout) the dropdown collapses to a single free-text input so the
 * customer can type their model id manually.
 */

import { useState } from 'react';
import { Boxes, ChevronDown, ChevronUp, Edit, Plus, Save, TestTube2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { useCustomProviderModels } from '@/hooks/useCustomProviderModels';
import type { Integration } from '@/services/integrations.service';

type CustomConfig = {
  /** Display label admins use to recognise this endpoint. */
  displayName: string;
  baseUrl: string;
  apiKey?: string;
  defaultChatModel: string;
};

type Props = {
  integrations: Integration[];
  showModels: Record<string, boolean>;
  testing: number | null;
  deleting: number | null;
  saving: string | null;
  toggling: number | null;
  editingId: number | null;
  onToggleModels: (id: number) => void;
  onEdit: (integration: Integration) => void;
  onTest: (id: number, name: string) => void;
  onDelete: (id: number, name: string, type: string) => void;
  onToggleEnabled: (id: number, currentEnabled: boolean, name: string, type: string) => void;
  onSave: (config: CustomConfig) => void;
  onCancel: () => void;
};

const EMPTY: CustomConfig = {
  displayName: '',
  baseUrl: '',
  apiKey: '',
  defaultChatModel: '',
};

export const CustomProviderCard = ({
  integrations,
  showModels,
  deleting,
  saving,
  toggling,
  editingId,
  onToggleModels,
  onEdit,
  onTest,
  onDelete,
  onToggleEnabled,
  onSave,
  onCancel,
}: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [config, setConfig] = useState<CustomConfig>(EMPTY);

  // Discovery fires whenever the form is open AND an integration row already
  // exists — that's the prerequisite for the BE endpoint to have a baseUrl
  // to call. On first-time setup (no integration yet) the dropdown stays
  // empty and the customer types a model id manually; once they save +
  // reopen, discovery populates.
  const discovery = useCustomProviderModels(showForm && integrations.length > 0);
  const liveModels = discovery.data?.models ?? null;
  const sourceLabel = discovery.isLoading
    ? 'Loading models from /v1/models…'
    : liveModels && liveModels.length > 0
      ? `Live · ${liveModels.length} models${discovery.data?.source === 'cache' ? ' (cached)' : ''}`
      : integrations.length === 0
        ? 'Save the provider first, then reopen to discover models from /v1/models'
        : 'Discovery unavailable — type the model id below';

  const handleEdit = (integration: Integration) => {
    setConfig(integration.config as CustomConfig);
    setShowForm(true);
    onEdit(integration);
  };

  const handleReset = () => {
    setConfig(EMPTY);
    setShowForm(false);
    onCancel();
  };

  const handleSave = () => {
    onSave(config);
    handleReset();
  };

  const canSave = config.displayName.trim() && config.baseUrl.trim() && config.defaultChatModel.trim();

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center gap-3">
          <CardTitle className="flex gap-2 items-center">
            <Boxes className="w-5 h-5 text-purple-600" />
            Custom (OpenAI-compatible)
          </CardTitle>
          <Button
            size="sm"
            onClick={() => {
              handleReset();
              setShowForm(!showForm);
            }}
          >
            <Plus className="mr-1 w-4 h-4 hidden sm:block" />
            Add Endpoint
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          LiteLLM, vLLM, LM Studio, OpenRouter, Together AI, Groq, Cerebras — anything that exposes <code>/v1/chat/completions</code>.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {integrations.length > 0 && (
          <div className="space-y-2">
            {integrations.map((integration) => (
              <div key={integration.id} className="rounded-lg border">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium truncate">{integration.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {(integration.config as CustomConfig).baseUrl}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="inline-flex relative items-center cursor-pointer mr-2">
                      <input
                        type="checkbox"
                        checked={integration.enabled ?? true}
                        onChange={() =>
                          onToggleEnabled(
                            integration.id,
                            integration.enabled ?? true,
                            integration.name,
                            integration.type
                          )
                        }
                        disabled={toggling === integration.id}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => onToggleModels(integration.id)}>
                      {showModels[integration.id] ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTest(integration.id, integration.name)}
                    >
                      <TestTube2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(integration)}
                      disabled={editingId === integration.id}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDelete(integration.id, integration.name, integration.type)}
                      isLoading={deleting === integration.id}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
                {showModels[integration.id] && (
                  <div className="p-3 border-t bg-muted/30 text-xs space-y-1">
                    <p><span className="text-muted-foreground">Default model:</span> {(integration.config as CustomConfig).defaultChatModel}</p>
                    {liveModels && liveModels.length > 0 && (
                      <p className="text-muted-foreground">{liveModels.length} models discovered live</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="p-4 space-y-3 rounded-lg border bg-muted/50">
            <h4 className="font-medium">
              {editingId ? 'Edit Custom Endpoint' : 'Add Custom Endpoint'}
            </h4>

            <div>
              <label htmlFor="custom-name" className="text-sm font-medium">Display Name *</label>
              <input
                id="custom-name"
                type="text"
                value={config.displayName}
                onChange={(event) => setConfig({ ...config, displayName: event.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="OpenRouter, LiteLLM, etc."
              />
            </div>

            <div>
              <label htmlFor="custom-baseurl" className="text-sm font-medium">Base URL *</label>
              <input
                id="custom-baseurl"
                type="url"
                value={config.baseUrl}
                onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
                placeholder="https://openrouter.ai/api/v1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Must be a publicly reachable HTTPS URL. Private IPs (localhost, 10.x, 192.168.x) are blocked.
              </p>
            </div>

            <div>
              <label htmlFor="custom-apikey" className="text-sm font-medium">API Key (optional)</label>
              <input
                id="custom-apikey"
                type="password"
                value={config.apiKey ?? ''}
                onChange={(event) => setConfig({ ...config, apiKey: event.target.value })}
                className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
                placeholder="sk-… (leave empty for unauthenticated endpoints)"
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="custom-model" className="text-sm font-medium">Default Chat Model *</label>
              {liveModels && liveModels.length > 0 ? (
                <ReactSelect
                  value={config.defaultChatModel}
                  onChange={(value) => setConfig({ ...config, defaultChatModel: value })}
                  options={liveModels
                    .filter((model) => model.type === 'chat')
                    .map((model) => ({ value: model.id, label: model.name }))}
                />
              ) : (
                <input
                  id="custom-model"
                  type="text"
                  value={config.defaultChatModel}
                  onChange={(event) => setConfig({ ...config, defaultChatModel: event.target.value })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary font-mono text-xs"
                  placeholder="anthropic/claude-3.5-sonnet, mistralai/Mixtral-8x7B-Instruct-v0.1, etc."
                />
              )}
              <p className="mt-1 text-xs text-muted-foreground">{sourceLabel}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSave}
                isLoading={saving === 'custom'}
                disabled={!canSave}
              >
                <Save className="mr-1 w-4 h-4" /> Save
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
