import { apiClient } from '@/lib/api-client';

/**
 * Thin API layer for the per-ALLIANCE identity surface (05-05, REQ-04 connect-once
 * + LOCKED-3 domain verification). Mirrors alliance-groups.service.ts: `base(id)`
 * helper, every read unwraps the `sendSuccess` envelope `.data.data`.
 *
 * - getSsoConfig / putSsoConfig — the alliance OIDC (OIDC) config. The GET response
 *   NEVER carries the client secret; only `hasClientSecret` is exposed. On PUT a
 *   blank/omitted `clientSecret` keeps the stored ciphertext (write-only, T-05-25).
 * - listDomains / addDomain / verifyDomain / removeDomain — DNS-TXT domain
 *   verification. Rows carry the raw `txtToken`; the exact TXT name/value to publish
 *   are DERIVED client-side (the BE does not send them) via txtRecordName/expectedTxtValue.
 */

/** Redacted alliance SSO config as returned by GET — no client secret, only `hasClientSecret`. */
export type AllianceSsoConfig = {
  id: number;
  allianceId: number;
  protocol: string;
  enabled: boolean;
  issuerUrl: string;
  clientId: string;
  scopes: string | null;
  allowedEmailDomains: string[];
  jitProvisioning: boolean;
  allowSsoAccountLinking: boolean;
  hasClientSecret: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** PUT body. A blank/omitted `clientSecret` keeps the stored secret (write-only). */
export type AllianceSsoConfigInput = {
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

/** One SSO connection preflight check (POST .../sso/test). */
export type AllianceSsoCheck = { name: string; ok: boolean; message: string };

/** Result of the SSO connection test — overall pass + a per-check breakdown. */
export type AllianceSsoTestResult = { ok: boolean; checks: AllianceSsoCheck[] };

/** A domain-verification row (raw BE shape — timestamps serialize as ISO strings). */
export type AllianceDomain = {
  id: number;
  allianceId: number;
  domain: string;
  txtToken: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
};

/** DNS-TXT challenge derivation — mirrors the BE (allianceDomainService.ts). */
export const txtRecordName = (domain: string): string => `_odly-challenge.${domain}`;
export const expectedTxtValue = (token: string): string => `odly-domain-verification=${token}`;

const base = (allianceId: number): string => `/api/alliances/${allianceId}`;

export const allianceSsoService = {
  /** Redacted alliance SSO config, or null when SSO hasn't been configured yet. */
  getSsoConfig: async (allianceId: number): Promise<AllianceSsoConfig | null> => {
    const res = await apiClient.get<{ data: AllianceSsoConfig | null }>(`${base(allianceId)}/sso`);
    return res.data.data;
  },

  /** Create/update the alliance SSO config; returns the REDACTED view. */
  putSsoConfig: async (
    allianceId: number,
    input: AllianceSsoConfigInput
  ): Promise<AllianceSsoConfig> => {
    const res = await apiClient.put<{ data: AllianceSsoConfig }>(`${base(allianceId)}/sso`, input);
    return res.data.data;
  },

  /**
   * Run a live preflight against the saved OIDC config (POST .../sso/test). Returns an
   * overall `ok` plus per-check results (config present, issuer https, client id/secret
   * set, OIDC discovery reachable). Does not change any state.
   */
  testSso: async (allianceId: number): Promise<AllianceSsoTestResult> => {
    const res = await apiClient.post<{ data: AllianceSsoTestResult }>(
      `${base(allianceId)}/sso/test`
    );
    return res.data.data;
  },

  listDomains: async (allianceId: number): Promise<AllianceDomain[]> => {
    const res = await apiClient.get<{ data: AllianceDomain[] }>(`${base(allianceId)}/domains`);
    return res.data.data;
  },

  addDomain: async (allianceId: number, domain: string): Promise<AllianceDomain> => {
    const res = await apiClient.post<{ data: AllianceDomain }>(`${base(allianceId)}/domains`, {
      domain,
    });
    return res.data.data;
  },

  verifyDomain: async (allianceId: number, domainId: number): Promise<{ verified: boolean }> => {
    const res = await apiClient.post<{ data: { verified: boolean } }>(
      `${base(allianceId)}/domains/${domainId}/verify`
    );
    return res.data.data;
  },

  removeDomain: async (allianceId: number, domainId: number): Promise<void> => {
    await apiClient.delete(`${base(allianceId)}/domains/${domainId}`);
  },
};
