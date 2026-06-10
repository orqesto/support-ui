import { useEffect, useState } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit,
  Plus,
  Save,
  TestTube2,
  Trash2,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import type { Integration } from '@/services/integrations.service';
import { BEDROCK_MODELS, BEDROCK_REGIONS } from '@/types/aiProviders';
import { apiClient } from '@/lib/api-client';

type BedrockConfig = {
  region: string;
  roleArn: string;
  externalId: string;
  defaultModel: string;
  inferenceProfileArn?: string;
};

type BedrockTestResult = {
  assumeRole: 'ok' | 'error' | 'skipped';
  invoke: 'ok' | 'error' | 'skipped';
  latencyMs: number;
  errorMessage?: string;
  errorStep?: 'assumeRole' | 'invoke';
};

type Props = {
  integrations: Integration[];
  showModels: Record<string, boolean>;
  deleting: number | null;
  saving: string | null;
  toggling: number | null;
  editingId: number | null;
  onToggleModels: (id: number) => void;
  onEdit: (integration: Integration) => void;
  onDelete: (id: number, name: string, type: string) => void;
  onToggleEnabled: (id: number, currentEnabled: boolean, name: string, type: string) => void;
  onSave: (config: BedrockConfig) => void;
  onCancel: () => void;
};

const TRUST_POLICY_TEMPLATE = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::<ODLY_AWS_ACCOUNT_ID>:role/odly-bedrock-trust"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "<paste-external-id-here>"
      }
    }
  }]
}`;

const PERMISSION_POLICY_TEMPLATE = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ],
    "Resource": [
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
    ]
  }]
}`;

const EMPTY_CONFIG: BedrockConfig = {
  region: 'us-east-1',
  roleArn: '',
  externalId: '',
  defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  inferenceProfileArn: '',
};

// ─── small bits ───────────────────────────────────────────────────────────
const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [done, setDone] = useState(false);
  const click = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (err) {
      logger.warn('Clipboard copy failed', err);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={click} aria-label={`Copy ${label}`}>
      {done ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
      <span className="ml-1 hidden sm:inline">{done ? 'Copied' : 'Copy'}</span>
    </Button>
  );
};

const PolicyBlock = ({ title, body }: { title: string; body: string }) => (
  <div className="space-y-1">
    <div className="flex justify-between items-center">
      <h6 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h6>
      <CopyButton value={body} label={title} />
    </div>
    <pre className="overflow-x-auto p-2 text-xs rounded border bg-muted">{body}</pre>
  </div>
);

// ─── card ─────────────────────────────────────────────────────────────────
export const BedrockProviderCard = ({
  integrations,
  showModels,
  deleting,
  saving,
  toggling,
  editingId,
  onToggleModels,
  onEdit,
  onDelete,
  onToggleEnabled,
  onSave,
  onCancel,
}: Props) => {
  const [showForm, setShowForm] = useState(false);
  const [config, setConfig] = useState<BedrockConfig>(EMPTY_CONFIG);
  const [showSetup, setShowSetup] = useState(false);
  const [testResult, setTestResult] = useState<BedrockTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [generatingId, setGeneratingId] = useState(false);

  // Auto-fetch a fresh externalId when opening the form for a NEW integration.
  // For edits the existing externalId is loaded from the integration row.
  useEffect(() => {
    if (showForm && !editingId && !config.externalId) {
      let cancelled = false;
      setGeneratingId(true);
      apiClient
        .get<{ success: boolean; data: { externalId: string } }>(
          '/api/integrations/bedrock/external-id'
        )
        .then((response) => {
          if (cancelled) return;
          if (response.data.success) {
            setConfig((cur) => ({ ...cur, externalId: response.data.data.externalId }));
          }
        })
        .catch((err) => logger.warn('Failed to fetch Bedrock externalId', err))
        .finally(() => {
          if (!cancelled) setGeneratingId(false);
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [showForm, editingId, config.externalId]);

  const handleEdit = (integration: Integration) => {
    setConfig({ ...EMPTY_CONFIG, ...(integration.config as BedrockConfig) });
    setShowForm(true);
    setTestResult(null);
    onEdit(integration);
  };

  const handleReset = () => {
    setConfig(EMPTY_CONFIG);
    setShowForm(false);
    setShowSetup(false);
    setTestResult(null);
    onCancel();
  };

  const handleSave = () => {
    if (!config.region || !config.roleArn || !config.externalId || !config.defaultModel) {
      return;
    }
    onSave(config);
    handleReset();
  };

  const handleTest = async () => {
    if (!config.region || !config.roleArn || !config.externalId || !config.defaultModel) {
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const response = await apiClient.post<{ success: boolean; data: BedrockTestResult }>(
        '/api/integrations/test-bedrock',
        {
          region: config.region,
          roleArn: config.roleArn,
          externalId: config.externalId,
          modelId: config.defaultModel,
        }
      );
      setTestResult(response.data.data);
    } catch (err) {
      logger.warn('Bedrock test failed', err);
      const errObj = err as { response?: { data?: { error?: string } } };
      setTestResult({
        assumeRole: 'error',
        invoke: 'skipped',
        latencyMs: 0,
        errorMessage: errObj?.response?.data?.error ?? 'Test request failed',
        errorStep: 'assumeRole',
      });
    } finally {
      setTesting(false);
    }
  };

  const canSubmit =
    !!config.region && !!config.roleArn && !!config.externalId && !!config.defaultModel;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex gap-2 items-center">
            <Brain className="w-5 h-5 text-orange-500" />
            AWS Bedrock (Claude)
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
            {integrations.length > 0 ? 'Update' : 'Add'} Bedrock
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing integrations */}
        {integrations.length > 0 && (
          <div className="space-y-2">
            {integrations.map((integration) => {
              const cfg = integration.config as Partial<BedrockConfig>;
              return (
                <div key={integration.id} className="rounded-lg border">
                  <div className="flex justify-between items-center p-3">
                    <div className="flex gap-3 items-center">
                      <div
                        className={`w-2 h-2 rounded-full ${integration.enabled ? 'bg-green-500' : 'bg-gray-400'}`}
                      />
                      <div>
                        <p className="font-medium">{integration.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cfg.region ?? '—'} · {cfg.defaultModel ?? '—'}
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
                        {BEDROCK_MODELS.map((model) => (
                          <div key={model.id} className="p-2 text-xs rounded border bg-background">
                            <p className="font-medium">{model.name}</p>
                            <p className="text-muted-foreground">
                              {model.type} · {model.contextWindow.toLocaleString()} tokens
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add/Edit form */}
        {showForm && (
          <div className="p-4 space-y-4 rounded-lg border bg-muted/50">
            <h4 className="font-medium">
              {editingId ? 'Edit Bedrock Configuration' : 'Add Bedrock Configuration'}
            </h4>

            <div className="space-y-3">
              <ReactSelect
                label="Region *"
                value={config.region}
                onChange={(value) => setConfig({ ...config, region: value })}
                options={BEDROCK_REGIONS.map((region) => ({
                  value: region.value,
                  label: region.label,
                }))}
              />

              <div>
                <label htmlFor="bedrock-role-arn" className="text-sm font-medium">
                  IAM Role ARN *
                </label>
                <input
                  id="bedrock-role-arn"
                  type="text"
                  value={config.roleArn}
                  onChange={(event) => setConfig({ ...config, roleArn: event.target.value })}
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  placeholder="arn:aws:iam::123456789012:role/OdlyBedrockUser"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Role in your AWS account that Odly will assume via STS.
                </p>
              </div>

              <div>
                <label htmlFor="bedrock-external-id" className="text-sm font-medium">
                  External ID
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    id="bedrock-external-id"
                    type="text"
                    value={config.externalId}
                    readOnly
                    className="px-3 py-2 flex-1 rounded-md border bg-muted text-foreground border-border font-mono text-xs"
                    placeholder={generatingId ? 'Generating…' : ''}
                  />
                  {config.externalId && (
                    <CopyButton value={config.externalId} label="External ID" />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste this into your IAM role's trust policy
                  Condition.StringEquals.sts:ExternalId. Generated per-org; required for AssumeRole
                  to succeed.
                </p>
              </div>

              <ReactSelect
                label="Default Model *"
                value={config.defaultModel}
                onChange={(value) => setConfig({ ...config, defaultModel: value })}
                options={BEDROCK_MODELS.map((model) => ({
                  value: model.id,
                  label: model.name,
                }))}
              />

              <div>
                <label htmlFor="bedrock-inference-profile" className="text-sm font-medium">
                  Inference Profile ARN (Optional)
                </label>
                <input
                  id="bedrock-inference-profile"
                  type="text"
                  value={config.inferenceProfileArn ?? ''}
                  onChange={(event) =>
                    setConfig({ ...config, inferenceProfileArn: event.target.value })
                  }
                  className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                  placeholder="arn:aws:bedrock:us-east-1:123…:inference-profile/…"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use for cross-region inference profiles. Leave blank if not configured.
                </p>
              </div>

              {/* IAM setup helper */}
              <div className="rounded-md border bg-background">
                <button
                  type="button"
                  className="flex justify-between items-center px-3 py-2 w-full text-sm font-medium text-left"
                  onClick={() => setShowSetup(!showSetup)}
                  aria-expanded={showSetup}
                >
                  <span>AWS IAM setup instructions</span>
                  {showSetup ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {showSetup && (
                  <div className="p-3 space-y-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      Create a role in your AWS account with the policies below. Paste the External
                      ID from above into the trust policy's Condition block before saving.
                    </p>
                    <PolicyBlock title="Trust Policy" body={TRUST_POLICY_TEMPLATE} />
                    <PolicyBlock title="Permission Policy" body={PERMISSION_POLICY_TEMPLATE} />
                  </div>
                )}
              </div>

              {/* Test button + result */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={handleTest}
                  isLoading={testing}
                  disabled={!canSubmit}
                >
                  <TestTube2 className="mr-2 w-4 h-4" />
                  Test Connection
                </Button>
                {testResult && (
                  <div
                    className={`p-3 text-xs rounded border ${
                      testResult.assumeRole === 'ok' && testResult.invoke === 'ok'
                        ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
                        : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                    }`}
                  >
                    <p>
                      AssumeRole: {testResult.assumeRole} · Invoke: {testResult.invoke} ·{' '}
                      {testResult.latencyMs}ms
                    </p>
                    {testResult.errorMessage && (
                      <p className="mt-1">
                        Failed at <strong>{testResult.errorStep}</strong>: {testResult.errorMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} isLoading={saving === 'bedrock'} disabled={!canSubmit}>
                <Save className="mr-2 w-4 h-4" />
                {editingId ? 'Update' : 'Save'} Bedrock
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {integrations.length === 0 && !showForm && (
          <p className="py-2 text-sm text-center text-muted-foreground">No Bedrock configuration</p>
        )}
      </CardContent>
    </Card>
  );
};
