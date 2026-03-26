import { useState } from 'react';
import { Server, Plus, Save, Trash2, Edit, TestTube2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import type { Integration } from '@/services/integrations.service';
import type { AIModel } from '@/types/aiProviders';

type OllamaProviderCardProps = {
  integrations: Integration[];
  models: AIModel[];
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
  onSave: (config: OllamaConfig) => void;
  onCancel: () => void;
};

type OllamaConfig = {
  baseUrl: string;
  defaultModel: string;
};

export const OllamaProviderCard = ({
  integrations,
  models,
  showModels,
  testing,
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
}: OllamaProviderCardProps) => {
  const [showForm, setShowForm] = useState(false);
  const [config, setConfig] = useState<OllamaConfig>({
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2-vision:11b',
  });

  const handleEdit = (integration: Integration) => {
    setConfig(integration.config as OllamaConfig);
    setShowForm(true);
    onEdit(integration);
  };

  const handleReset = () => {
    setConfig({
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.2-vision:11b',
    });
    setShowForm(false);
    onCancel();
  };

  const handleSave = () => {
    onSave(config);
    handleReset();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center gap-3">
          <CardTitle className="flex gap-2 items-center">
            <Server className="w-5 h-5 text-green-600" />
            Ollama (Local)
          </CardTitle>
          <Button
            size="sm"
            className="py-5"
            onClick={() => {
              handleReset();
              setShowForm(!showForm);
            }}
          >
            <Plus className="mr-1 w-4 h-4 hidden sm:block" />
            {integrations.length > 0 ? 'Update' : 'Add'} Ollama
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* List of Ollama integrations */}
        {integrations.length > 0 && (
          <div className="space-y-2">
            {integrations.map((integration) => (
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
                  <div className="flex gap-2 items-center">
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground">
                        {integration.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <label
                        className="relative inline-flex items-center cursor-pointer"
                        aria-label={`Toggle ${integration.name}`}
                      >
                        <input
                          type="checkbox"
                          checked={integration.enabled}
                          onChange={() =>
                            onToggleEnabled(
                              integration.id,
                              integration.enabled,
                              integration.name,
                              integration.type
                            )
                          }
                          disabled={toggling === integration.id}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
                      </label>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleModels(integration.id)}
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
                      onClick={() => handleEdit(integration)}
                      disabled={editingId === integration.id}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTest(integration.id, integration.name)}
                      isLoading={testing === integration.id}
                    >
                      <TestTube2 className="w-4 h-4" />
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
                  <div className="p-3 border-t bg-muted/30">
                    <h5 className="mb-2 text-sm font-medium">Available Models:</h5>
                    <div className="grid grid-cols-2 gap-2">
                      {models.map((model) => (
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
        {showForm && (
          <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
            <h4 className="font-medium">
              {editingId ? 'Edit Ollama Configuration' : 'Add Ollama Configuration'}
            </h4>
            <p className="text-xs text-muted-foreground">
              Ollama runs locally — no API key required. Make sure Ollama is running before testing.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="baseUrl" className="text-sm font-medium">
                  Base URL
                </label>
                <input
                  type="url"
                  value={config.baseUrl}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  placeholder="http://localhost:11434/v1"
                />
              </div>
              <ReactSelect
                label="Model"
                value={config.defaultModel}
                onChange={(value) => setConfig({ ...config, defaultModel: value })}
                options={models
                  .filter((m) => m.type === 'chat')
                  .map((model) => ({
                    value: model.id,
                    label: model.name,
                  }))}
                menuPlacement="top"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} isLoading={saving === 'ollama'}>
                <Save className="mr-2 w-4 h-4" />
                {editingId ? 'Update' : 'Save'} Ollama
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {integrations.length === 0 && !showForm && (
          <p className="py-2 text-sm text-center text-muted-foreground">No Ollama configuration</p>
        )}
      </CardContent>
    </Card>
  );
};
