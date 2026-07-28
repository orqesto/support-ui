import { apiClient } from '@/lib/api-client';
import { API_BASE_URL } from '@/lib/config';

/**
 * Thin API layer for the org SSO (OIDC) surface.
 *
 * - `getSsoConfig` / `putSsoConfig` — org_admin config CRUD (plan 02). The GET
 *   response NEVER carries the client secret; only `hasClientSecret` is exposed.
 *   On PUT a blank/omitted `clientSecret` means "keep the existing secret"
 *   (write-only), matching the BE contract.
 * - `resolveOrgByEmail` — the public, rate-limited email-first resolve endpoint
 *   (plan 03, D-01): a single enabled-domain match returns `{ orgSlug }`, >1
 *   returns `{ ambiguous: true }`, none returns `{ found: false }`.
 * - `startSsoUrl` — the fixed `/api/auth/sso/:orgSlug/start` redirect target. The
 *   slug only ever feeds this fixed path (never an arbitrary redirect, T-05-04).
 */

/** Redacted config as returned by GET — no client secret, only `hasClientSecret`. */
export type SsoConfig = {
  protocol: string;
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  scopes: string | null;
  allowedEmailDomains: string[];
  jitProvisioning: boolean;
  allowSsoAccountLinking: boolean;
  hasClientSecret: boolean;
};

/** PUT body. A blank/omitted `clientSecret` keeps the stored secret (write-only). */
export type SsoConfigInput = {
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  /** Write-only. Omit or leave blank to keep the existing secret. */
  clientSecret?: string;
  scopes?: string;
  allowedEmailDomains: string[];
  jitProvisioning: boolean;
  allowSsoAccountLinking: boolean;
};

/** Discriminated result of the email-first resolve endpoint (D-01/D-02). */
export type ResolveResult =
  | { orgSlug: string }
  | { ambiguous: true }
  | { found: false };

/** GET response: the redacted config (null if none yet) + the authoritative redirect URI. */
export type SsoConfigResponse = {
  /** Redacted config, or `null` when the org hasn't configured SSO yet. */
  config: SsoConfig | null;
  /**
   * The exact callback URL the IdP must be configured to post back to — derived
   * server-side (from BACKEND_URL + org slug) so it can be copied verbatim into the
   * IdP's app registration. Present even when `config` is null.
   */
  redirectUri: string;
};

/** Result of the pre-save "Test connection" discovery probe. */
export type SsoTestResult = {
  ok: boolean;
  message: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
};

/** GET the redacted SSO config + redirect URI for the current org. */
export const getSsoConfig = async (): Promise<SsoConfigResponse> => {
  const result = await apiClient.get('/api/organizations/sso-config');
  return (result.data as { data: SsoConfigResponse }).data;
};

/**
 * Pre-save "Test connection": ask the backend to run SSRF-guarded OIDC discovery
 * against the entered issuer WITHOUT saving. Returns `{ ok, message }` so the admin
 * can validate the Issuer URL before committing the config.
 */
export const testSsoConfig = async (input: {
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
}): Promise<SsoTestResult> => {
  const result = await apiClient.post('/api/organizations/sso-config/test', input);
  return (result.data as { data: SsoTestResult }).data;
};

/** PUT (upsert) the SSO config for the current org. Returns the redacted view. */
export const putSsoConfig = async (input: SsoConfigInput): Promise<SsoConfig> => {
  const result = await apiClient.put('/api/organizations/sso-config', input);
  return (result.data as { data: SsoConfig }).data;
};

/**
 * Resolve an email to its enabled SSO org (D-01). Falls back cleanly:
 * a 404 from the endpoint means "no SSO org for this domain" → `{ found: false }`
 * so the caller can continue the password flow. Any other network error is the
 * caller's concern (LoginPage treats it as "no SSO" too — never blocks password).
 */
export const resolveOrgByEmail = async (email: string): Promise<ResolveResult> => {
  try {
    const result = await apiClient.post('/api/auth/sso/resolve', { email });
    return result.data as ResolveResult;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      return { found: false };
    }
    throw error;
  }
};

/** The fixed SSO start redirect target for a given org slug. */
export const startSsoUrl = (orgSlug: string): string =>
  `${API_BASE_URL}/api/auth/sso/${encodeURIComponent(orgSlug)}/start`;
