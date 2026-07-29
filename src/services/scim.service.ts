import { apiClient } from '@/lib/api-client';

/**
 * Thin API layer for the org SCIM admin surface (`/api/scim-admin`, org_admin +
 * JWT). Mirrors sso.service.ts.
 *
 * - `getScimConfig` — redacted config (flags only) + redacted token list + the
 *   authoritative SCIM Base URL to paste into the IdP (derived server-side).
 * - `updateScimConfig` — PATCH the enable / account-linking flags.
 * - `listTokens` / `mintToken` / `revokeToken` — bearer token lifecycle. The raw
 *   token is returned by `mintToken` EXACTLY ONCE and is never fetched again.
 * - `listGroupMappings` / `setGroupMapping` / `clearGroupMapping` — map a synced
 *   SCIM group to a role and/or departments (Req 9). Groups appear only after the
 *   IdP first pushes them.
 */

/** Redacted SCIM token metadata — never the hash or plaintext. */
export type ScimTokenMeta = {
  id: number;
  label: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

/** Redacted SCIM config (flags only — no secrets). */
export type ScimConfig = {
  enabled: boolean;
  allowScimAccountLinking: boolean;
  tokens: ScimTokenMeta[];
};

/** GET /config response: redacted config + the authoritative SCIM Base URL. */
export type ScimConfigResponse = {
  config: ScimConfig;
  /** `<backend-origin>/scim/v2` — copy verbatim into the IdP. Server-derived. */
  scimBaseUrl: string;
};

/** PATCH /config body — at least one flag. organizationId is never sent. */
export type ScimConfigInput = {
  enabled?: boolean;
  allowScimAccountLinking?: boolean;
};

/** The mint response — `token` is the plaintext, shown ONCE. */
export type MintedScimToken = {
  id: number;
  label: string | null;
  createdAt: string;
  /** Plaintext bearer token — never returned again. Surface it immediately. */
  token: string;
};

/** An org role a group may map to (never global admin). */
export type OrgRole = 'org_admin' | 'moderator' | 'support' | 'associate';

/** A synced SCIM group + its current admin mapping (for the mapping table). */
export type ScimGroupMapping = {
  id: number;
  externalId: string | null;
  displayName: string;
  memberCount: number;
  mappedRole: OrgRole | null;
  mappedDepartmentIds: number[];
};

/** PUT group-mapping body. */
export type SetGroupMappingInput = {
  mappedRole?: OrgRole | null;
  mappedDepartmentIds?: number[] | null;
};

const BASE = '/api/scim-admin';

/** GET the redacted config + token list + SCIM Base URL for the current org. */
export const getScimConfig = async (): Promise<ScimConfigResponse> => {
  const result = await apiClient.get(`${BASE}/config`);
  return (result.data as { data: ScimConfigResponse }).data;
};

/** PATCH the config flags (enable / account-linking). Returns the redacted config. */
export const updateScimConfig = async (input: ScimConfigInput): Promise<ScimConfig> => {
  const result = await apiClient.patch(`${BASE}/config`, input);
  return (result.data as { data: { config: ScimConfig } }).data.config;
};

/** GET the redacted token list. */
export const listScimTokens = async (): Promise<ScimTokenMeta[]> => {
  const result = await apiClient.get(`${BASE}/tokens`);
  return (result.data as { data: { tokens: ScimTokenMeta[] } }).data.tokens;
};

/** POST a new bearer token — the plaintext is returned ONCE here. */
export const mintScimToken = async (label?: string): Promise<MintedScimToken> => {
  const result = await apiClient.post(`${BASE}/tokens`, label ? { label } : {});
  return (result.data as { data: MintedScimToken }).data;
};

/** DELETE (revoke) a token by id. Idempotent. */
export const revokeScimToken = async (tokenId: number): Promise<void> => {
  await apiClient.delete(`${BASE}/tokens/${tokenId}`);
};

/** GET the synced groups + their mappings (empty until the IdP pushes groups). */
export const listScimGroupMappings = async (): Promise<ScimGroupMapping[]> => {
  const result = await apiClient.get(`${BASE}/groups`);
  return (result.data as { data: { groups: ScimGroupMapping[] } }).data.groups;
};

/** PUT (set/replace) a group's role + department mapping. */
export const setScimGroupMapping = async (
  groupId: number,
  input: SetGroupMappingInput
): Promise<ScimGroupMapping> => {
  const result = await apiClient.put(`${BASE}/groups/${groupId}/mapping`, input);
  return (result.data as { data: { group: ScimGroupMapping } }).data.group;
};

/** DELETE (clear) a group's mapping entirely. */
export const clearScimGroupMapping = async (groupId: number): Promise<ScimGroupMapping> => {
  const result = await apiClient.delete(`${BASE}/groups/${groupId}/mapping`);
  return (result.data as { data: { group: ScimGroupMapping } }).data.group;
};
