import { apiClient } from '@/lib/api-client';

/**
 * Platform Defaults console service (Epic #2). Global-admin only — calls hit
 * `/api/admin/platform/settings*`; under platform scope the api-client suppresses
 * the org-context header (D-ADM-1). The BE resolves every value DB → env → const
 * and returns each field with its `source`; secrets are status-only (never values).
 */

export type FieldSource = 'db' | 'env' | 'default';
export type ResolvedField<T> = { value: T | null; source: FieldSource };
export type StorageFieldSource = 'db' | 'env';
export type ResolvedStorageField<T> = { value: T | null; source: StorageFieldSource };
export type SecretSource = 'db' | 'env' | 'none';
export type SecretStatus = { configured: boolean; source: SecretSource; last4: string | null };

export type PlatformSecretKey =
  | 'ai.openai_api_key'
  | 'storage.s3_access_key_id'
  | 'storage.s3_secret_access_key';

export type PlatformSettings = {
  ai: {
    defaultModel: ResolvedField<string>;
    strongModel: ResolvedField<string>;
    visionModel: ResolvedField<string>;
    defaultCostPer1k: ResolvedField<number>;
    strongCostPer1k: ResolvedField<number>;
    visionCostPer1k: ResolvedField<number>;
    apiKey: SecretStatus;
  };
  storage: {
    driver: ResolvedStorageField<'local' | 's3'>;
    endpoint: ResolvedStorageField<string>;
    region: ResolvedStorageField<string>;
    bucket: ResolvedStorageField<string>;
    prefix: ResolvedStorageField<string>;
    forcePathStyle: ResolvedStorageField<boolean>;
    accessKeyId: SecretStatus;
    secretAccessKey: SecretStatus;
  };
};

export type ManagedAiInput = {
  defaultModel?: string;
  strongModel?: string;
  visionModel?: string;
  defaultCostPer1k?: number;
  strongCostPer1k?: number;
  visionCostPer1k?: number;
};

export type DefaultStorageInput = {
  driver?: 'local' | 's3';
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  forcePathStyle?: boolean;
};

export type StorageTestResult = { ok: boolean; latencyMs: number; error?: string };

const BASE = '/api/admin/platform/settings';

export const platformSettingsService = {
  /** GET effective values + per-field source + secret status. */
  get: async (): Promise<PlatformSettings> => {
    const res = await apiClient.get<{ data: PlatformSettings }>(BASE);
    return res.data.data;
  },

  /** PATCH the managed-AI model/cost defaults (only the fields present are persisted). */
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
