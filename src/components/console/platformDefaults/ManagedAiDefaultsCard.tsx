import { useState } from 'react';
import { Bot, TestTube2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfigCard, type ConfigSummaryRow } from '@/components/ui/ConfigCard';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import {
  useSetPlatformSecret,
  useClearPlatformSecret,
  usePlatformAiModels,
  useUpdatePlatformAi,
} from '@/hooks/usePlatformSettings';
import { useConfigCardState } from '@/hooks/useConfigCardState';
import {
  AI_KEY_SLOT_BY_PROVIDER,
  platformSettingsService,
  type ManagedAiTestResult,
  type ManagedAiInput,
  type PlatformSettings,
} from '@/services/platformSettings.service';
import {
  AI_PROVIDER_TYPES,
  BEDROCK_REGIONS,
  type AIModel,
  type AIProvider,
} from '@/types/aiProviders';
import { SecretField } from './SecretField';
import { SourceBadge } from './SourceBadge';

type Ai = PlatformSettings['ai'];
type ModelKey = 'defaultModel' | 'strongModel' | 'visionModel';
type CostKey = 'defaultCostPer1k' | 'strongCostPer1k' | 'visionCostPer1k';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  deepseek: 'DeepSeek',
  perplexity: 'Perplexity',
  qwen: 'Qwen (Alibaba)',
  ollama: 'Ollama (self-hosted)',
  bedrock: 'AWS Bedrock',
  custom: 'Custom (OpenAI-compatible)',
};

const TIERS: { modelKey: ModelKey; costKey: CostKey; label: string; hint: string }[] = [
  {
    modelKey: 'defaultModel',
    costKey: 'defaultCostPer1k',
    label: 'Default tier',
    hint: 'Serves every routine managed call — the main cost driver.',
  },
  {
    modelKey: 'strongModel',
    costKey: 'strongCostPer1k',
    label: 'Strong tier',
    hint: 'Answers-only escalation, metered as a second call.',
  },
  {
    modelKey: 'visionModel',
    costKey: 'visionCostPer1k',
    label: 'Vision tier',
    hint: 'Image analysis is absorbed by the platform, so the model is the cost lever.',
  },
];

/** Sentinel option that swaps the picker for a free-text field. */
const OTHER = '__other__';

/** Prefill a field only when it's a console (DB) override; else leave blank so the
 *  placeholder shows the effective env/const value the admin would be replacing. */
const prefill = (field: { value: string | number | null; source: string }): string =>
  field.source === 'db' && field.value !== null ? String(field.value) : '';

const seedModels = (ai: Ai): Record<ModelKey, string> => ({
  defaultModel: prefill(ai.defaultModel),
  strongModel: prefill(ai.strongModel),
  visionModel: prefill(ai.visionModel),
});

const seedCosts = (ai: Ai): Record<CostKey, string> => ({
  defaultCostPer1k: prefill(ai.defaultCostPer1k),
  strongCostPer1k: prefill(ai.strongCostPer1k),
  visionCostPer1k: prefill(ai.visionCostPer1k),
});

const seedBedrock = (ai: Ai) => ({
  region: ai.bedrockRegion.value ?? '',
  roleArn: ai.bedrockRoleArn.value ?? '',
  externalId: ai.bedrockExternalId.value ?? '',
  inferenceProfileArn: ai.bedrockInferenceProfileArn.value ?? '',
});

/** Identity of the STORED defaults; the prop's reference changes on every refetch. */
const storedAiSnapshot = (ai: Ai): string =>
  JSON.stringify([
    ai.provider.value ?? 'openai',
    seedModels(ai),
    seedCosts(ai),
    ai.baseUrl.source === 'db' ? (ai.baseUrl.value ?? '') : '',
    ai.organization.value ?? '',
    seedBedrock(ai),
    ai.bedrockUseInstanceProfile.value ?? false,
  ]);

export const ManagedAiDefaultsCard = ({
  ai,
  secrets,
}: {
  ai: Ai;
  secrets: PlatformSettings['secrets'];
}) => {
  const [provider, setProvider] = useState<AIProvider>(ai.provider.value ?? 'openai');
  const [models, setModels] = useState<Record<ModelKey, string>>(() => seedModels(ai));
  const [costs, setCosts] = useState<Record<CostKey, string>>(() => seedCosts(ai));
  const [baseUrl, setBaseUrl] = useState(
    ai.baseUrl.source === 'db' ? (ai.baseUrl.value ?? '') : ''
  );
  const [organization, setOrganization] = useState(ai.organization.value ?? '');
  const [bedrock, setBedrock] = useState(() => seedBedrock(ai));
  const [useInstanceProfile, setUseInstanceProfile] = useState(
    ai.bedrockUseInstanceProfile.value ?? false
  );
  // Per-tier escape hatch: the admin picked "Other", so show a text field even
  // though the catalog has entries. Reset whenever the provider changes.
  const [freeText, setFreeText] = useState<Record<ModelKey, boolean>>({
    defaultModel: false,
    strongModel: false,
    visionModel: false,
  });

  /**
   * Re-seed whenever the STORED defaults change — after our own save, or another
   * operator's.
   *
   * The state above is seeded by `useState` initialisers, which run only on mount.
   * `useUpdatePlatformAi` invalidates on success, so `ai` refetches and the source
   * badges update, but every input kept whatever was typed — so a value the server
   * normalised, rejected, or never stored stayed on screen looking saved.
   *
   * Keyed on the serialised STORED values, so an identical background refetch is a
   * no-op and never interrupts an edit in progress.
   */
  const stored = storedAiSnapshot(ai);

  /** Drop every draft field back to what the server holds. */
  const reseed = () => {
    setProvider(ai.provider.value ?? 'openai');
    setModels(seedModels(ai));
    setCosts(seedCosts(ai));
    setBaseUrl(ai.baseUrl.source === 'db' ? (ai.baseUrl.value ?? '') : '');
    setOrganization(ai.organization.value ?? '');
    setBedrock(seedBedrock(ai));
    setUseInstanceProfile(ai.bedrockUseInstanceProfile.value ?? false);
  };

  const [seededFrom, setSeededFrom] = useState(stored);
  if (seededFrom !== stored) {
    setSeededFrom(stored);
    reseed();
  }

  /**
   * Console-held config, i.e. what an admin actually stored HERE. `source` is 'db' only for a
   * console override; 'env' and 'default' are the platform answering for itself. So an
   * env-configured platform reads as `empty` on purpose — there is nothing on this screen to
   * edit back to, and saying "stored" about a value this form never wrote is the exact
   * confusion the three-state card exists to remove.
   */
  const OVERRIDABLE = [
    'provider',
    'defaultModel',
    'strongModel',
    'visionModel',
    'defaultCostPer1k',
    'strongCostPer1k',
    'visionCostPer1k',
    'baseUrl',
    'organization',
    'bedrockRegion',
    'bedrockRoleArn',
    'bedrockExternalId',
    'bedrockInferenceProfileArn',
    'bedrockUseInstanceProfile',
  ] as const;
  const configured = OVERRIDABLE.some((key) => ai[key].source === 'db');

  const update = useUpdatePlatformAi();
  const setSecret = useSetPlatformSecret();
  const clearSecret = useClearPlatformSecret();
  const catalog = usePlatformAiModels();

  // Chat models only — the embedding entries in the catalog can't serve a tier.
  const providerModels: AIModel[] = (catalog.data?.[provider] ?? []).filter(
    (model) => model.type === 'chat'
  );
  const isBedrock = provider === 'bedrock';
  const isOllama = provider === 'ollama';
  const baseUrlEditable = provider === 'custom' || isOllama;
  // The key slot follows the SELECTED provider, not the saved one, so switching
  // the dropdown immediately shows the credential that provider will use.
  const keySlot = AI_KEY_SLOT_BY_PROVIDER[provider];
  const keyStatus = keySlot ? secrets[keySlot] : null;

  /**
   * The card's own three states replace the old derived "Saved" badge: saving leaves
   * `editing` and lands on the read-only view rendered from server data, so what you
   * see afterwards IS the stored config rather than a claim about it.
   */
  const card = useConfigCardState({ configured, onCancel: reseed });

  /**
   * Prove the stored key answers.
   *
   * ⛔ Saving already succeeds when the key is wrong — the card goes green on a typo and the
   * first sign of trouble is managed workspaces silently failing to get replies. This is the
   * PLATFORM key: one bad value breaks every managed workspace at once.
   *
   * Cleared whenever the provider changes, because a result that outlives the thing it
   * describes is worse than no result — "Connection OK" under a provider it never tested is
   * the kind of green nobody re-checks.
   */
  const [aiTest, setAiTest] = useState<ManagedAiTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const runAiTest = async () => {
    setTesting(true);
    setAiTest(null);
    try {
      setAiTest(await platformSettingsService.testManagedAi());
    } catch (err) {
      setAiTest({ ok: false, reason: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    const input: ManagedAiInput = { provider };
    (Object.keys(models) as ModelKey[]).forEach((key) => {
      const trimmed = models[key].trim();
      if (trimmed) input[key] = trimmed;
    });
    (Object.keys(costs) as CostKey[]).forEach((key) => {
      const raw = costs[key].trim();
      if (!raw) return;
      const num = Number(raw);
      if (Number.isFinite(num) && num >= 0) input[key] = num;
    });
    if (baseUrlEditable && baseUrl.trim()) input.baseUrl = baseUrl.trim();
    if (provider === 'openai' && organization.trim()) input.organization = organization.trim();
    if (isBedrock) {
      if (bedrock.region) input.bedrockRegion = bedrock.region;
      if (bedrock.roleArn.trim()) input.bedrockRoleArn = bedrock.roleArn.trim();
      if (bedrock.externalId.trim()) input.bedrockExternalId = bedrock.externalId.trim();
      if (bedrock.inferenceProfileArn.trim()) {
        input.bedrockInferenceProfileArn = bedrock.inferenceProfileArn.trim();
      }
      input.bedrockUseInstanceProfile = useInstanceProfile;
    }
    update.mutate(input, { onSuccess: () => card.confirmSaved() });
  };

  const renderModelPicker = (modelKey: ModelKey, visionOnly: boolean) => {
    const options = visionOnly
      ? providerModels.filter((model) => model.supportsVision)
      : providerModels;
    const current = models[modelKey];
    const known = options.some((model) => model.id === current);
    // No catalog (custom endpoints), an explicit "Other", or an id we don't know
    // → free text, so a model released after this build is still selectable.
    if (options.length === 0 || freeText[modelKey] || (current !== '' && !known)) {
      return (
        <Input
          value={current}
          onChange={(event) => setModels((prev) => ({ ...prev, [modelKey]: event.target.value }))}
          placeholder={ai[modelKey].value ?? 'model id'}
        />
      );
    }
    return (
      <Select
        value={current}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER) {
            setFreeText((prev) => ({ ...prev, [modelKey]: true }));
            setModels((prev) => ({ ...prev, [modelKey]: '' }));
            return;
          }
          setModels((prev) => ({ ...prev, [modelKey]: next }));
        }}
      >
        <option value="">Use the default ({ai[modelKey].value ?? 'unset'})</option>
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} — {model.id}
          </option>
        ))}
        <option value={OTHER}>Other (type an id)…</option>
      </Select>
    );
  };

  /**
   * The read-only view. Only console overrides are listed as values; anything the platform is
   * answering for itself says so through `source`, because "gpt-5-mini (from environment)" and
   * "gpt-5-mini (set here)" are different facts and only one of them is undone by clearing
   * this form.
   */
  const sourcePhrase = (source: string): string =>
    source === 'db' ? 'set here' : source === 'env' ? 'from environment' : 'platform default';

  const row = (
    label: string,
    field: { value: string | number | null; source: string }
  ): ConfigSummaryRow => ({
    label,
    value: field.value === null || field.value === '' ? undefined : String(field.value),
    source: sourcePhrase(field.source),
    placeholder: 'not set',
  });

  const summary: ConfigSummaryRow[] = [
    row('Provider', {
      value: PROVIDER_LABELS[ai.provider.value ?? 'openai'],
      source: ai.provider.source,
    }),
    ...TIERS.map((tier) => row(tier.label, ai[tier.modelKey])),
    ...TIERS.map((tier) => row(`${tier.label} cost / 1k`, ai[tier.costKey])),
    ...(baseUrlEditable ? [row('Base URL', ai.baseUrl)] : []),
    {
      label: 'API key',
      value: keyStatus?.configured ? `stored ····${keyStatus.last4 ?? ''}` : undefined,
      source: keyStatus?.configured ? sourcePhrase(keyStatus.source) : undefined,
      placeholder: 'none stored',
    },
  ];

  /** Credentials stay reachable in every state — you may need a key BEFORE configuring anything. */
  const credentials = (
    <>
      {keySlot && keyStatus && (
        <div className="pt-4 border-t border-border">
          <SecretField
            label={`${PROVIDER_LABELS[provider]} API key`}
            status={keyStatus}
            onSave={(value) => setSecret.mutate({ key: keySlot, value })}
            onClear={() => clearSecret.mutate(keySlot)}
            saving={setSecret.isPending}
            clearing={clearSecret.isPending}
          />
          {provider !== (ai.provider.value ?? 'openai') && (
            <p className="mt-2 text-xs text-muted-foreground">
              Storing a key here is safe before you switch — managed traffic keeps using{' '}
              {PROVIDER_LABELS[ai.provider.value ?? 'openai']} until you save the provider change.
            </p>
          )}
        </div>
      )}

      {isOllama && (
        <Alert variant="info">
          Ollama needs no API key — set the base URL above and make sure the platform can reach it.
        </Alert>
      )}
    </>
  );

  return (
    <ConfigCard
      title="Managed AI Defaults"
      icon={<Bot className="w-5 h-5 text-primary" />}
      description="The provider, models, and cost-per-1k-token rates the platform uses to serve managed-mode workspaces. Leave a model blank to fall back to the environment or the built-in default for that provider."
      state={card.state}
      summary={summary}
      emptyNote="Nothing is overridden here, so managed workspaces run on the environment's provider and models at the built-in rates. Usage reporting prices them at whatever those rates say."
      note={
        <>
          {credentials}
          {aiTest && (
            <p className={`text-sm ${aiTest.ok ? 'text-success' : 'text-danger'}`}>
              {aiTest.ok
                ? `${aiTest.provider} answered with ${aiTest.model} · ${aiTest.latencyMs}ms`
                : `Not working: ${aiTest.reason ?? 'unknown error'}`}
            </p>
          )}
        </>
      }
      extraActions={
        <Button variant="outline" onClick={() => void runAiTest()} isLoading={testing}>
          <TestTube2 className="mr-2 w-4 h-4" />
          Test connection
        </Button>
      }
      onConfigure={card.startEditing}
      onEdit={card.startEditing}
      onCancel={card.cancelEditing}
      onSave={save}
      saving={update.isPending}
      configureLabel="Configure AI defaults"
      saveLabel="Save AI defaults"
    >
      <div className="space-y-5">
        <div>
          <div className="flex gap-2 items-center mb-2">
            <Label className="mb-0">Provider</Label>
            <SourceBadge source={ai.provider.source} />
          </div>
          <Select
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as AIProvider);
              setFreeText({ defaultModel: false, strongModel: false, visionModel: false });
              // A result that outlives what it describes is worse than none: "openai answered"
              // still sitting there under a freshly-selected Bedrock reads as a pass.
              setAiTest(null);
            }}
          >
            {AI_PROVIDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {PROVIDER_LABELS[type]}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Every provider keeps its own credential, so you can store a key here before switching
            over — and switching back never reuses the previous provider&apos;s credential. Cost
            rates are per-tier, not per-provider: re-check them after a switch or usage reporting
            will price the new provider at the old one&apos;s rates.
          </p>
        </div>

        {baseUrlEditable ? (
          <div>
            <div className="flex gap-2 items-center mb-2">
              <Label className="mb-0">Base URL</Label>
              <SourceBadge source={ai.baseUrl.source} unsetLabel="Not set" />
            </div>
            <Input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={
                isOllama ? 'http://ollama.internal:11434/v1' : 'https://llm.example.com/v1'
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {isOllama
                ? 'Ollama has no hosted endpoint, so a base URL is required. Private hosts are allowed here.'
                : 'Must be a public https endpoint — it is checked before saving.'}
            </p>
          </div>
        ) : (
          !isBedrock && (
            <Alert variant="info">
              Managed traffic for {PROVIDER_LABELS[provider]} always goes to{' '}
              <span className="font-mono">{ai.baseUrl.value ?? 'the provider endpoint'}</span>. The
              endpoint is fixed for hosted providers so managed calls can never be redirected.
            </Alert>
          )
        )}

        {TIERS.map(({ modelKey, costKey, label, hint }) => (
          <div key={modelKey} className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex gap-2 items-center mb-2">
                <Label className="mb-0">{label} — model</Label>
                <SourceBadge source={ai[modelKey].source} />
              </div>
              {renderModelPicker(modelKey, modelKey === 'visionModel')}
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </div>
            <div>
              <div className="flex gap-2 items-center mb-2">
                <Label className="mb-0">Cost / 1k tokens</Label>
                <SourceBadge source={ai[costKey].source} unsetLabel="Not set" />
              </div>
              <Input
                type="number"
                min={0}
                step="0.0001"
                value={costs[costKey]}
                onChange={(event) =>
                  setCosts((prev) => ({ ...prev, [costKey]: event.target.value }))
                }
                placeholder={ai[costKey].value !== null ? String(ai[costKey].value) : 'unset'}
              />
            </div>
          </div>
        ))}

        {provider === 'openai' && (
          <div>
            <Label>Organization (optional)</Label>
            <Input
              value={organization}
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="org-… — only when the platform key is scoped to one"
            />
          </div>
        )}

        {isBedrock && (
          <div className="pt-4 space-y-4 border-t border-border">
            <div>
              <Label>Region</Label>
              <Select
                value={bedrock.region}
                onChange={(event) =>
                  setBedrock((prev) => ({ ...prev, region: event.target.value }))
                }
              >
                <option value="">Select a region…</option>
                {BEDROCK_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>AssumeRole ARN (optional)</Label>
                <Input
                  value={bedrock.roleArn}
                  onChange={(event) =>
                    setBedrock((prev) => ({ ...prev, roleArn: event.target.value }))
                  }
                  placeholder="arn:aws:iam::123456789012:role/OdlyBedrock"
                />
              </div>
              <div>
                <Label>External ID (optional)</Label>
                <Input
                  value={bedrock.externalId}
                  onChange={(event) =>
                    setBedrock((prev) => ({ ...prev, externalId: event.target.value }))
                  }
                  placeholder="must match the role trust policy"
                />
              </div>
            </div>
            <div>
              <Label>Inference profile ARN (optional)</Label>
              <Input
                value={bedrock.inferenceProfileArn}
                onChange={(event) =>
                  setBedrock((prev) => ({ ...prev, inferenceProfileArn: event.target.value }))
                }
                placeholder="Used instead of the model id when the region serves it via a profile"
              />
            </div>
            <Toggle
              checked={useInstanceProfile}
              onChange={setUseInstanceProfile}
              label="Use the server's AWS identity (EC2 instance profile / ECS task role / IRSA)"
            />
            <SecretField
              label="AWS access key ID"
              status={ai.bedrockAccessKeyId}
              onSave={(value) => setSecret.mutate({ key: 'ai.bedrock_access_key_id', value })}
              onClear={() => clearSecret.mutate('ai.bedrock_access_key_id')}
              saving={setSecret.isPending}
              clearing={clearSecret.isPending}
            />
            <SecretField
              label="AWS secret access key"
              status={ai.bedrockSecretAccessKey}
              onSave={(value) => setSecret.mutate({ key: 'ai.bedrock_secret_access_key', value })}
              onClear={() => clearSecret.mutate('ai.bedrock_secret_access_key')}
              saving={setSecret.isPending}
              clearing={clearSecret.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Bedrock resolves credentials in order: static keys, then the assumed role, then the
              server&apos;s own AWS identity. Leave the keys blank to use one of the latter two.
            </p>
          </div>
        )}
      </div>
    </ConfigCard>
  );
};
