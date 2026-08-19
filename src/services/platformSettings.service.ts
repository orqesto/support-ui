import { apiClient } from '@/lib/api-client';
import type { AIModel, AIProvider } from '@/types/aiProviders';

/**
 * Platform Defaults console service (Epic #2). Global-admin only — calls hit
 * `/api/admin/platform/settings*`; under platform scope the api-client suppresses
 * the org-context header (D-ADM-1). The BE resolves every value DB → env → const
 * and returns each field with its `source`; secrets are status-only (never values).
 */

export type FieldSource = 'db' | 'env' | 'default';
export type ResolvedField<T> = { value: T | null; source: FieldSource };
/** Storage fields resolve through the same three layers as the AI fields. */
export type StorageFieldSource = FieldSource;
export type ResolvedStorageField<T> = ResolvedField<T>;
export type SecretSource = 'db' | 'env' | 'none';
export type SecretStatus = { configured: boolean; source: SecretSource; last4: string | null };

export type PlatformSecretKey =
  | 'ai.openai_api_key'
  | 'ai.anthropic_api_key'
  | 'ai.deepseek_api_key'
  | 'ai.perplexity_api_key'
  | 'ai.qwen_api_key'
  | 'ai.custom_api_key'
  | 'ai.bedrock_access_key_id'
  | 'ai.bedrock_secret_access_key'
  | 'storage.s3_access_key_id'
  | 'storage.s3_secret_access_key';

export type PlatformSettings = {
  ai: {
    provider: ResolvedField<AIProvider>;
    defaultModel: ResolvedField<string>;
    strongModel: ResolvedField<string>;
    visionModel: ResolvedField<string>;
    defaultCostPer1k: ResolvedField<number>;
    strongCostPer1k: ResolvedField<number>;
    visionCostPer1k: ResolvedField<number>;
    baseUrl: ResolvedField<string>;
    organization: ResolvedField<string>;
    bedrockRegion: ResolvedField<string>;
    bedrockRoleArn: ResolvedField<string>;
    bedrockExternalId: ResolvedField<string>;
    bedrockUseInstanceProfile: ResolvedField<boolean>;
    bedrockInferenceProfileArn: ResolvedField<string>;
    /** The secret slot the selected provider authenticates with (null = none). */
    keySlot: PlatformSecretKey | null;
    /** True when the provider's endpoint is admin-settable (custom / ollama). */
    baseUrlEditable: boolean;
    /** Status of `keySlot`, or null for providers that need no API key. */
    apiKey: SecretStatus | null;
    bedrockAccessKeyId: SecretStatus;
    bedrockSecretAccessKey: SecretStatus;
  };
  storage: {
    /** What the console should PRE-SELECT — not necessarily what serves uploads. */
    driver: ResolvedStorageField<'local' | 's3'>;
    /** Where files actually go right now. */
    effectiveDriver: 'local' | 's3';
    /** True when the environment alone already provides a usable S3 target. */
    envS3Configured: boolean;
    endpoint: ResolvedStorageField<string>;
    region: ResolvedStorageField<string>;
    bucket: ResolvedStorageField<string>;
    prefix: ResolvedStorageField<string>;
    forcePathStyle: ResolvedStorageField<boolean>;
    roleArn: ResolvedStorageField<string>;
    externalId: ResolvedStorageField<string>;
    accessKeyId: SecretStatus;
    secretAccessKey: SecretStatus;
  };
  /** Every platform secret's status, so a key can be staged before switching provider. */
  secrets: Record<PlatformSecretKey, SecretStatus>;
};

export type ManagedAiInput = {
  provider?: AIProvider;
  defaultModel?: string;
  strongModel?: string;
  visionModel?: string;
  defaultCostPer1k?: number;
  strongCostPer1k?: number;
  visionCostPer1k?: number;
  baseUrl?: string;
  organization?: string;
  bedrockRegion?: string;
  bedrockRoleArn?: string;
  bedrockExternalId?: string;
  bedrockUseInstanceProfile?: boolean;
  bedrockInferenceProfileArn?: string;
};

export type DefaultStorageInput = {
  driver?: 'local' | 's3';
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  forcePathStyle?: boolean;
  roleArn?: string;
  externalId?: string;
};

export type StorageTestResult = { ok: boolean; latencyMs: number; error?: string };

/**
 * The payload as an OLDER backend may still return it. The frontend ships from
 * `main` independently of the backend release, so between the two deploys this
 * console talks to a backend that predates the multi-provider AI fields, the
 * per-slot `secrets` map, and the storage `effectiveDriver`/`envS3Configured`/
 * AssumeRole fields. Reading `.value` off any of those undefined objects threw
 * and white-screened the whole page, so the response is normalized here — one
 * place, before any component sees it.
 */
type RawPlatformSettings = {
  ai: Partial<PlatformSettings['ai']> & Pick<PlatformSettings['ai'], 'defaultModel'>;
  storage: Partial<PlatformSettings['storage']> & Pick<PlatformSettings['storage'], 'driver'>;
  secrets?: Partial<Record<PlatformSecretKey, SecretStatus>>;
};

const UNSET_SECRET: SecretStatus = { configured: false, source: 'none', last4: null };

const field = <T>(raw: ResolvedField<T> | undefined): ResolvedField<T> =>
  raw ?? { value: null, source: 'default' };

const ALL_SECRET_KEYS: PlatformSecretKey[] = [
  'ai.openai_api_key',
  'ai.anthropic_api_key',
  'ai.deepseek_api_key',
  'ai.perplexity_api_key',
  'ai.qwen_api_key',
  'ai.custom_api_key',
  'ai.bedrock_access_key_id',
  'ai.bedrock_secret_access_key',
  'storage.s3_access_key_id',
  'storage.s3_secret_access_key',
];

/**
 * Which platform secret each provider authenticates with. Mirrors
 * PLATFORM_AI_KEY_BY_PROVIDER on the backend — spelled out rather than derived
 * from the provider name so a rename on either side is a type error here, not a
 * silently wrong key slot at runtime.
 */
export const AI_KEY_SLOT_BY_PROVIDER: Record<AIProvider, PlatformSecretKey | null> = {
  openai: 'ai.openai_api_key',
  anthropic: 'ai.anthropic_api_key',
  deepseek: 'ai.deepseek_api_key',
  perplexity: 'ai.perplexity_api_key',
  qwen: 'ai.qwen_api_key',
  custom: 'ai.custom_api_key',
  ollama: null,
  bedrock: null,
};

const normalize = (raw: RawPlatformSettings): PlatformSettings => {
  const secrets = Object.fromEntries(
    ALL_SECRET_KEYS.map((key) => [key, raw.secrets?.[key] ?? UNSET_SECRET])
  ) as Record<PlatformSecretKey, SecretStatus>;
  // An older backend reported only the OpenAI key, under `ai.apiKey`.
  if (!raw.secrets && raw.ai.apiKey) secrets['ai.openai_api_key'] = raw.ai.apiKey;
  if (!raw.secrets && raw.storage.accessKeyId) {
    secrets['storage.s3_access_key_id'] = raw.storage.accessKeyId;
  }
  if (!raw.secrets && raw.storage.secretAccessKey) {
    secrets['storage.s3_secret_access_key'] = raw.storage.secretAccessKey;
  }

  const provider = field(raw.ai.provider);
  const effectiveProvider = provider.value ?? 'openai';
  return {
    ai: {
      provider: provider.value ? provider : { value: 'openai', source: 'default' },
      defaultModel: field(raw.ai.defaultModel),
      strongModel: field(raw.ai.strongModel),
      visionModel: field(raw.ai.visionModel),
      defaultCostPer1k: field(raw.ai.defaultCostPer1k),
      strongCostPer1k: field(raw.ai.strongCostPer1k),
      visionCostPer1k: field(raw.ai.visionCostPer1k),
      baseUrl: field(raw.ai.baseUrl),
      organization: field(raw.ai.organization),
      bedrockRegion: field(raw.ai.bedrockRegion),
      bedrockRoleArn: field(raw.ai.bedrockRoleArn),
      bedrockExternalId: field(raw.ai.bedrockExternalId),
      bedrockUseInstanceProfile: field(raw.ai.bedrockUseInstanceProfile),
      bedrockInferenceProfileArn: field(raw.ai.bedrockInferenceProfileArn),
      keySlot: raw.ai.keySlot ?? AI_KEY_SLOT_BY_PROVIDER[effectiveProvider],
      baseUrlEditable: raw.ai.baseUrlEditable ?? false,
      apiKey: raw.ai.apiKey ?? null,
      bedrockAccessKeyId: raw.ai.bedrockAccessKeyId ?? UNSET_SECRET,
      bedrockSecretAccessKey: raw.ai.bedrockSecretAccessKey ?? UNSET_SECRET,
    },
    storage: {
      driver: field(raw.storage.driver),
      // Absent on an older backend: fall back to the pre-selected driver, which
      // is what that backend resolved uploads with anyway.
      effectiveDriver: raw.storage.effectiveDriver ?? raw.storage.driver?.value ?? 'local',
      envS3Configured: raw.storage.envS3Configured ?? false,
      endpoint: field(raw.storage.endpoint),
      region: field(raw.storage.region),
      bucket: field(raw.storage.bucket),
      prefix: field(raw.storage.prefix),
      forcePathStyle: field(raw.storage.forcePathStyle),
      roleArn: field(raw.storage.roleArn),
      externalId: field(raw.storage.externalId),
      accessKeyId: raw.storage.accessKeyId ?? UNSET_SECRET,
      secretAccessKey: raw.storage.secretAccessKey ?? UNSET_SECRET,
    },
    secrets,
  };
};

const BASE = '/api/admin/platform/settings';

export const platformSettingsService = {
  /** GET effective values + per-field source + secret status. */
  get: async (): Promise<PlatformSettings> => {
    const res = await apiClient.get<{ data: RawPlatformSettings }>(BASE);
    return normalize(res.data.data);
  },

  /**
   * The model catalog per provider. The org-scoped `/api/ai/models` can't serve
   * the console (no org context under platform scope), so this is its global-admin
   * twin — one call returns every provider's list.
   */
  models: async (): Promise<Record<AIProvider, AIModel[]>> => {
    const res = await apiClient.get<{ data: { models: Record<AIProvider, AIModel[]> } }>(
      `${BASE}/ai/models`
    );
    return res.data.data.models;
  },

  /** PATCH the managed-AI provider/model/cost defaults (only the fields present are persisted). */
  updateAi: async (input: ManagedAiInput): Promise<void> => {
    await apiClient.patch(`${BASE}/ai`, input);
  },

  /** PATCH the default-storage non-secret config. Include driver:'s3' with any S3 field. */
  updateStorage: async (input: DefaultStorageInput): Promise<void> => {
    await apiClient.patch(`${BASE}/storage`, input);
  },

  /** Store (encrypt) a platform secret. Value is never returned back. */
  setSecret: async (key: PlatformSecretKey, value: string): Promise<void> => {
    await apiClient.patch(`${BASE}/secret`, { key, value });
  },

  /** Remove a platform secret's DB row so resolution falls back to env. */
  clearSecret: async (key: PlatformSecretKey): Promise<void> => {
    await apiClient.patch(`${BASE}/secret`, { key, clear: true });
  },

  /** Probe the proposed storage config + resolved (DB→env) creds before saving. */
  testStorage: async (input: DefaultStorageInput): Promise<StorageTestResult> => {
    const res = await apiClient.post<{ data: StorageTestResult }>(`${BASE}/storage/test`, input);
    return res.data.data;
  },
};
