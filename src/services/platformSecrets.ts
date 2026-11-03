/**
 * Platform secrets as the console sees them: status only (configured, source, last4), never a
 * value. Split out of `platformSettings.service.ts`, which re-exports these types.
 */
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
  | 'storage.s3_secret_access_key'
  // The Odly notifications Slack app (Admin console › Platform › Alerts); the bot token is
  // written by the Slack connection itself.
  | 'slack.client_id'
  | 'slack.client_secret'
  | 'slack.platform_bot_token';

/** Every platform secret the console reads a status for (support-service PLATFORM_SECRETS). */
export const ALL_SECRET_KEYS: PlatformSecretKey[] = [
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
  'slack.client_id',
  'slack.client_secret',
  'slack.platform_bot_token',
];
