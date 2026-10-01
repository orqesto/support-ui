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
export type SecretStatus = {
  configured: boolean;
  source: SecretSource;
  last4: string | null;
  /**
   * A row IS stored for this key and is NOT what resolves — its ciphertext would not decrypt,
   * so traffic falls through to the environment. Absent unless that is the case, and absent
   * entirely on a backend older than the fix that made the status resolve rather than read a
   * column.
   */
  storedValueUnusable?: boolean;
};

/**
 * What the backend established about a credential BEFORE storing it.
 *
 * `checked: false` is not a pass — it means nothing was proven (Bedrock, half an S3 key pair,
 * an unreachable provider). Rendering it as success is the exact habit that let an autofilled
 * key sit in the console looking configured for four hours.
 */
export type SecretVerification = { checked: boolean; ok: boolean; reason?: string };
export type SecretSaveResult = SecretStatus & { verification?: SecretVerification };

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
  /**
   * BYODB §3.4: how long a workspace with no active plan may stay on the managed database. Two layers only
   * (console / built-in default). Absent on a backend that predates Phase 2.
   */
  database?: {
    freeSharedRetentionDays: ResolvedField<number>;
  };
  /**
   * GPT-5 / o-series reasoning effort per AI feature + the reasoning headroom. Absent on a
   * backend that predates the setting (the frontend can reach `main` first), and absent when
   * the block arrives in a shape this build does not understand — the card then says the
   * setting is not available rather than guessing.
   */
  reasoning?: PlatformReasoning;
};

/**
 * What PATCH /settings/reasoning accepts, and what `stored` echoes back. Efforts and feature
 * names are plain strings on purpose: the vocabulary comes from the server's `options`, so a
 * feature added on the backend shows up here without a frontend release.
 */
export type ReasoningInput = {
  defaultEffort?: string;
  effortByFeature?: Record<string, string>;
  headroomTokens?: number;
};

export type PlatformReasoning = {
  stored: ReasoningInput;
  effective: {
    /** null ⇒ no reasoning_effort is sent; the model uses its own default. */
    defaultEffort: string | null;
    effortByFeature: Record<string, string>;
    headroomTokens: { value: number; source: 'db' | 'default' };
  };
  options: {
    efforts: string[];
    features: string[];
    headroomTokens: { min: number; max: number; default: number };
  };
  /**
   * The parts of the stored row this server could not use. `stored` above is only the USABLE
   * part, so a save (which starts from it) drops the ignored entries and writes the adjusted
   * values as they are used. Each is [] when the backend does not report it.
   */
  /** Feature keys this server does not know. */
  ignoredFeatures: string[];
  /** Dotted paths whose saved value is not valid here, e.g. `effortByFeature.translation`. */
  ignoredFields: string[];
  /** Values the server moved into range before using them (headroom 0 ⇒ 1000). */
  adjustedFields: ReasoningAdjustment[];
};

export type ReasoningAdjustment = { field: string; stored: number | null; used: number | null };

export type PlatformDatabaseInput = { retentionDays: number };

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
  database?: { freeSharedRetentionDays?: ResolvedField<number> };
  reasoning?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
/** Keep only string → string entries; anything else in a map is dropped, not rendered. */
const stringMap = (value: unknown): Record<string, string> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      )
    : {};

/**
 * The `reasoning` block, or undefined when it is absent or not in the shape this build reads.
 *
 * ⛔ Undefined, never a made-up default. An older backend has no such setting at all, and a card
 * offering levels to a server that would 404 the save is worse than one saying "not available".
 * `options` is the part the card cannot work without (it lists the efforts, the features and the
 * headroom bounds), so its absence or a malformed copy means "not available" too.
 */
export const normalizeReasoning = (raw: unknown): PlatformReasoning | undefined => {
  if (!isRecord(raw) || !isRecord(raw.options)) return undefined;
  const { efforts, features, headroomTokens: bounds } = raw.options;
  if (!isStringArray(efforts) || efforts.length === 0 || !isStringArray(features)) {
    return undefined;
  }
  if (
    !isRecord(bounds) ||
    !isFiniteNumber(bounds.min) ||
    !isFiniteNumber(bounds.max) ||
    !isFiniteNumber(bounds.default)
  ) {
    return undefined;
  }
  const storedRaw = isRecord(raw.stored) ? raw.stored : {};
  const stored: ReasoningInput = {};
  if (typeof storedRaw.defaultEffort === 'string') stored.defaultEffort = storedRaw.defaultEffort;
  const storedByFeature = stringMap(storedRaw.effortByFeature);
  if (Object.keys(storedByFeature).length > 0) stored.effortByFeature = storedByFeature;
  if (isFiniteNumber(storedRaw.headroomTokens)) stored.headroomTokens = storedRaw.headroomTokens;

  const effectiveRaw = isRecord(raw.effective) ? raw.effective : {};
  const headroomRaw = isRecord(effectiveRaw.headroomTokens) ? effectiveRaw.headroomTokens : {};
  return {
    stored,
    effective: {
      defaultEffort:
        typeof effectiveRaw.defaultEffort === 'string' ? effectiveRaw.defaultEffort : null,
      effortByFeature: stringMap(effectiveRaw.effortByFeature),
      // Derived from `stored` when the effective copy is missing, the same rule the server uses:
      // a stored number is the value, otherwise the built-in default.
      headroomTokens: isFiniteNumber(headroomRaw.value)
        ? {
            value: headroomRaw.value,
            source: headroomRaw.source === 'db' ? 'db' : 'default',
          }
        : stored.headroomTokens !== undefined
          ? { value: stored.headroomTokens, source: 'db' }
          : { value: bounds.default, source: 'default' },
    },
    options: {
      efforts,
      features,
      headroomTokens: { min: bounds.min, max: bounds.max, default: bounds.default },
    },
    ignoredFeatures: isStringArray(raw.ignoredFeatures) ? raw.ignoredFeatures : [],
    ignoredFields: isStringArray(raw.ignoredFields) ? raw.ignoredFields : [],
    adjustedFields: Array.isArray(raw.adjustedFields)
      ? raw.adjustedFields.filter(isRecord).flatMap((entry) =>
          typeof entry.field === 'string'
            ? [
                {
                  field: entry.field,
                  stored: isFiniteNumber(entry.stored) ? entry.stored : null,
                  used: isFiniteNumber(entry.used) ? entry.used : null,
                },
              ]
            : []
        )
      : [],
  };
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
/**
 * The answer to "does the managed AI key work". `ok: false` with a `reason` is a SUCCESSFUL
 * response — the provider's own words ("Incorrect API key provided", "model does not exist")
 * are what tell an admin which thing to go and fix.
 */
export type ManagedAiTestResult = {
  ok: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  reason?: string;
};

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

  const reasoning = normalizeReasoning(raw.reasoning);
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
    // Passed through only when the backend reports it: the card says so rather than
    // inventing a default the server may not be using.
    ...(raw.database?.freeSharedRetentionDays
      ? { database: { freeSharedRetentionDays: raw.database.freeSharedRetentionDays } }
      : {}),
    ...(reasoning ? { reasoning } : {}),
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

  /** PATCH the no-active-plan managed-database retention window (BYODB §3.4). Applies to future stamps only. */
  updateDatabase: async (input: PlatformDatabaseInput): Promise<void> => {
    await apiClient.patch(`${BASE}/database`, input);
  },

  /**
   * PUT-like PATCH of the reasoning settings: the body REPLACES the whole stored value, so send
   * the complete object; `{}` clears it. Answers with the saved block, read through the same
   * normalizer as GET (undefined only if the server answered in a shape this build cannot read).
   */
  updateReasoning: async (input: ReasoningInput): Promise<PlatformReasoning | undefined> => {
    const res = await apiClient.patch<{ data: unknown }>(`${BASE}/reasoning`, input);
    return normalizeReasoning(res.data.data);
  },

  /**
   * Store (encrypt) a platform secret. The value is never returned back.
   *
   * The backend checks the credential against its provider first and answers 400 with
   * `PLATFORM_SECRET_REJECTED` if it is refused — nothing is stored. `force` re-sends past
   * that, which an admin needs when the provider itself is down.
   */
  setSecret: async (
    key: PlatformSecretKey,
    value: string,
    options?: { force?: boolean }
  ): Promise<SecretSaveResult> => {
    const res = await apiClient.patch<{ data: SecretSaveResult }>(`${BASE}/secret`, {
      key,
      value,
      ...(options?.force ? { force: true } : {}),
    });
    return res.data.data;
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

  /**
   * Ask the managed AI provider to answer, with the key that is STORED.
   *
   * ⚠️ Takes no input, unlike `testStorage`. The key lives in `platform_secrets` and is never
   * sent to the browser, so there is nothing a draft could contribute — this tests what
   * managed workspaces will actually run on, which is the only useful question.
   */
  testManagedAi: async (): Promise<ManagedAiTestResult> => {
    const res = await apiClient.post<{ data: ManagedAiTestResult }>(`${BASE}/ai/test`, {});
    return res.data.data;
  },
};
