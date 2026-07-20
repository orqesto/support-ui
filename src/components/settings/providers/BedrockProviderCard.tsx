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
import { useBedrockModels } from '@/hooks/useBedrockModels';
import { useBackendVersion } from '@/hooks/useBackendVersion';
import { TRUST_POLICY_TEMPLATE, PERMISSION_POLICY_TEMPLATE } from './bedrockPolicyTemplates';
import type { BedrockConfig, Integration } from '@/services/integrations.service';
import type { AIModel } from '@/types/aiProviders';
import { BEDROCK_MODELS, BEDROCK_REGIONS } from '@/types/aiProviders';
import { apiClient } from '@/lib/api-client';

type BedrockTestResult = {
  assumeRole: 'ok' | 'error' | 'skipped';
  invoke: 'ok' | 'error' | 'skipped';
  latencyMs: number;
  errorMessage?: string;
  errorStep?: 'assumeRole' | 'invoke';
  // AWS account the test authenticated as. If this isn't the account whose CLI
  // works, static env keys are shadowing the instance profile (wrong-account trap).
  account?: string;
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

const EMPTY_CONFIG: BedrockConfig = {
  region: 'us-east-1',
  accessKeyId: '',
  secretAccessKey: '',
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
      <span className="hidden ml-1 sm:inline">{done ? 'Copied' : 'Copy'}</span>
    </Button>
  );
};

const PolicyBlock = ({ title, body }: { title: string; body: string }) => (
  <div className="space-y-1">
    <div className="flex justify-between items-center">
      <h6 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        {title}
      </h6>
      <CopyButton value={body} label={title} />
    </div>
    <pre className="overflow-x-auto p-2 text-xs rounded border bg-muted">{body}</pre>
  </div>
);

type CredMode = 'keys' | 'assume_role' | 'instance_profile';

// Credential-mode radio options. `instance_profile` is self-hosted only.
const CRED_MODES: { mode: CredMode; label: string; hint: string; selfHostedOnly?: boolean }[] = [
  {
    mode: 'keys',
    label: 'IAM access keys',
    hint: "Paste an IAM user's Access Key + Secret — stored encrypted, works with no server-side AWS setup.",
  },
  {
    mode: 'assume_role',
    label: 'Cross-account IAM role (AssumeRole)',
    hint: 'Odly assumes a role in a separate AWS account (SaaS / multi-tenant).',
  },
  {
    mode: 'instance_profile',
    label: 'EC2 instance profile',
    hint: "Use this server's own EC2 role via IMDS — no keys. Reads only from the instance profile, so stray environment keys can't override it. Requires IMDS hop-limit 2 on Docker.",
    selfHostedOnly: true,
  },
];

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
  // Credential mode: keys (paste IAM access keys) · assume_role (cross-account STS) ·
  // instance_profile (self-hosted EC2 role via IMDS — ignores env keys; the wrong-account fix).
  const [credMode, setCredMode] = useState<CredMode>('keys');
  // The instance-profile option is a self-hosted opt-in (BEDROCK_ALLOW_INSTANCE_PROFILE);
  // hidden on managed so a tenant can't assume Odly's own instance identity.
  const { data: backendVersion } = useBackendVersion();
  const allowInstanceProfile = backendVersion?.bedrockInstanceProfile ?? false;
  const [showSetup, setShowSetup] = useState(false);
  const [testResult, setTestResult] = useState<BedrockTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [generatingId, setGeneratingId] = useState(false);

  // Live model discovery — populated when the form is open AND the user has
  // picked a region. Falls back to the static BEDROCK_MODELS catalog when
  // discovery returns nothing (no role config yet, IAM denial, AWS hiccup).
  const discovery = useBedrockModels(showForm ? config.region : undefined);
  const liveModels = discovery.data?.models ?? null;
  const modelOptions: AIModel[] =
    liveModels && liveModels.length > 0
      ? liveModels.map((model) => ({
          id: model.id,
          name: model.name,
          type: model.type,
          contextWindow: 0, // not surfaced by Bedrock list API; harmless for the dropdown
          description: model.description,
        }))
      : BEDROCK_MODELS;
  const modelSourceLabel = discovery.isLoading
    ? 'Loading…'
    : liveModels && liveModels.length > 0
      ? `Live from AWS · ${liveModels.length} models${discovery.data?.source === 'cache' ? ' (cached)' : ''}`
      : 'Curated fallback list (add bedrock:ListFoundationModels to your role to see live)';

  // Auto-fetch a fresh externalId when opening the form for a NEW integration.
  // For edits the existing externalId is loaded from the integration row.
  useEffect(() => {
    if (showForm && credMode === 'assume_role' && !editingId && !config.externalId) {
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
  }, [showForm, credMode, editingId, config.externalId]);

  const handleEdit = (integration: Integration) => {
    const cfg = { ...EMPTY_CONFIG, ...(integration.config as BedrockConfig) };
    setConfig(cfg);
    // Infer the mode from the saved row: instance-profile flag wins (but only if
    // it's still available on this deployment, else fall back so the radio group
    // never renders with nothing selected), else a roleArn means cross-account,
    // else static keys.
    setCredMode(
      cfg.useInstanceProfile && allowInstanceProfile
        ? 'instance_profile'
        : cfg.roleArn
          ? 'assume_role'
          : 'keys'
    );
    setShowForm(true);
    setTestResult(null);
    onEdit(integration);
  };

  const handleReset = () => {
    setConfig(EMPTY_CONFIG);
    setCredMode('keys');
    setShowForm(false);
    setShowSetup(false);
    setTestResult(null);
    onCancel();
  };

  const handleSave = () => {
    if (!canSubmit) {
      return;
    }
    // Keep only the credentials for the active mode so the backend picks the
    // right one and stray fields from another mode can't win the priority order.
    const payload: BedrockConfig =
      credMode === 'assume_role'
        ? { ...config, accessKeyId: '', secretAccessKey: '', useInstanceProfile: false }
        : credMode === 'instance_profile'
          ? {
              ...config,
              accessKeyId: '',
              secretAccessKey: '',
              roleArn: '',
              externalId: '',
              useInstanceProfile: true,
            }
          : { ...config, roleArn: '', externalId: '', useInstanceProfile: false };
    onSave(payload);
    handleReset();
  };

  const handleTest = async () => {
    if (!canSubmit) {
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const response = await apiClient.post<{ success: boolean; data: BedrockTestResult }>(
        '/api/integrations/test-bedrock',
        {
          region: config.region,
          modelId: config.defaultModel,
          ...(credMode === 'assume_role'
            ? { roleArn: config.roleArn, externalId: config.externalId }
            : credMode === 'instance_profile'
              ? { useInstanceProfile: true }
              : config.accessKeyId && config.secretAccessKey
                ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
                : {}),
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
    !!config.region &&
    !!config.defaultModel &&
    (credMode !== 'assume_role' || (!!config.roleArn && !!config.externalId));

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex gap-2 items-center">
            <Brain className="w-5 h-5 text-orange-500" />
            AWS Bedrock
          </CardTitle>
          <Button
            size="sm"
            className="py-5"
            onClick={() => {
              handleReset();
              setShowForm(!showForm);
            }}
          >
            <Plus className="hidden mr-1 w-4 h-4 sm:block" />
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
                          className="inline-flex relative items-center cursor-pointer"
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
                        {modelOptions.map((model) => (
                          <div key={model.id} className="p-2 text-xs rounded border bg-background">
                            <p className="font-medium">{model.name}</p>
                            <p className="text-muted-foreground">
                              {model.type}
                              {model.contextWindow > 0
                                ? ` · ${model.contextWindow.toLocaleString()} tokens`
                                : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{modelSourceLabel}</p>
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
              <div className="p-3 rounded-md border bg-background">
                <p className="mb-2 text-sm font-medium">AWS credentials</p>
                <div className="space-y-2">
                  {CRED_MODES.filter((opt) => !opt.selfHostedOnly || allowInstanceProfile).map(
                    (opt) => (
                      <label
                        key={opt.mode}
                        className="flex gap-2 items-start text-sm cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="bedrock-cred-mode"
                          className="mt-1"
                          checked={credMode === opt.mode}
                          onChange={() => setCredMode(opt.mode)}
                        />
                        <span>
                          <span className="font-medium">{opt.label}</span>
                          <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <ReactSelect
                label="Region *"
                value={config.region}
                onChange={(value) => setConfig({ ...config, region: value })}
                options={BEDROCK_REGIONS.map((region) => ({
                  value: region.value,
                  label: region.label,
                }))}
              />

              {credMode === 'assume_role' && (
                <>
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
                        className="flex-1 px-3 py-2 font-mono text-xs rounded-md border bg-muted text-foreground border-border"
                        placeholder={generatingId ? 'Generating…' : ''}
                      />
                      {config.externalId && (
                        <CopyButton value={config.externalId} label="External ID" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Paste this into your IAM role's trust policy
                      Condition.StringEquals.sts:ExternalId. Generated per-org; required for
                      AssumeRole to succeed.
                    </p>
                  </div>
                </>
              )}

              {credMode === 'keys' && (
                <>
                  <div>
                    <label htmlFor="bedrock-access-key" className="text-sm font-medium">
                      AWS Access Key ID
                    </label>
                    <input
                      id="bedrock-access-key"
                      type="text"
                      autoComplete="off"
                      value={config.accessKeyId ?? ''}
                      onChange={(event) =>
                        setConfig({ ...config, accessKeyId: event.target.value })
                      }
                      className="px-3 py-2 w-full font-mono text-xs rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                      placeholder="AKIA…"
                    />
                  </div>
                  <div>
                    <label htmlFor="bedrock-secret-key" className="text-sm font-medium">
                      AWS Secret Access Key
                    </label>
                    <input
                      id="bedrock-secret-key"
                      type="password"
                      autoComplete="off"
                      value={config.secretAccessKey ?? ''}
                      onChange={(event) =>
                        setConfig({ ...config, secretAccessKey: event.target.value })
                      }
                      className="px-3 py-2 w-full font-mono text-xs rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
                      placeholder="••••••••"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Paste an IAM user's key to use Bedrock without any server-side AWS setup —
                      stored encrypted, same as other providers' keys.
                    </p>
                  </div>
                </>
              )}

              {credMode === 'instance_profile' && allowInstanceProfile && (
                <div className="p-3 text-xs rounded-md border bg-background text-muted-foreground">
                  Uses this server's EC2 instance profile (IMDS) — no keys needed. Attach an IAM
                  role with Bedrock access to the instance and, on Docker, set the IMDS hop-limit to
                  2. Use <strong>Test Connection</strong> to confirm which AWS account resolves.
                </div>
              )}

              <div>
                <ReactSelect
                  label="Default Model *"
                  value={config.defaultModel}
                  onChange={(value) => setConfig({ ...config, defaultModel: value })}
                  options={modelOptions.map((model) => ({
                    value: model.id,
                    label: model.name,
                  }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">{modelSourceLabel}</p>
              </div>

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

              {/* IAM setup helper — AssumeRole (cross-account) only */}
              {credMode === 'assume_role' && (
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
                        Create a role in your AWS account with the policies below. Paste the
                        External ID from above into the trust policy's Condition block before
                        saving.
                      </p>
                      <PolicyBlock title="Trust Policy" body={TRUST_POLICY_TEMPLATE} />
                      <PolicyBlock title="Permission Policy" body={PERMISSION_POLICY_TEMPLATE} />
                    </div>
                  )}
                </div>
              )}

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
                      testResult.invoke === 'ok'
                        ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
                        : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                    }`}
                  >
                    <p>
                      AssumeRole: {testResult.assumeRole} · Invoke: {testResult.invoke} ·{' '}
                      {testResult.latencyMs}ms
                    </p>
                    {testResult.account && (
                      <p className="mt-1">
                        Authenticated as AWS account <strong>{testResult.account}</strong>
                        <span className="opacity-70">
                          {' '}
                          — must match the account where you enabled model access.
                        </span>
                      </p>
                    )}
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
