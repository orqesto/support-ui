import { apiClient } from '@/lib/api-client';
import { API_BASE_URL } from '@/lib/config';

/**
 * Thin API layer for the per-ALLIANCE SCIM provisioning surface (05-07, D-05).
 * Mirrors alliance-sso.service.ts: a `base(id)` helper, every read unwraps the
 * `sendSuccess` envelope `.data.data`.
 *
 * Four surfaces, all hard-scoped by the allianceId in the route param:
 *  - config    — enable + account-linking flags (+ redacted token list).
 *  - tokens     — bearer token lifecycle. The RAW token is returned by
 *                 `mintToken` EXACTLY ONCE (T-05-28) and never fetched again.
 *  - group-maps — IdP-group external id → alliance group (feeds the reconciler's
 *                 group-grant union; the grant stays org-role, admin-ceilinged).
 *  - role-maps  — IdP-group external id → alliance_role (the D-05 elevation surface;
 *                 the ONLY thing that can raise a member above alliance_agent).
 *
 * The SCIM Base URL to paste into the IdP is DERIVED client-side (the BE serves the
 * bearer SCIM surface at `<backend-origin>/api/scim/v2`, same as the per-org
 * connector; the bearer token is what scopes a request to this alliance).
 */

/** An alliance-role a role-map may grant — never a new enum (reuses allianceRoleEnum). */
export type AllianceRole = 'alliance_admin' | 'alliance_agent';

/** Redacted token metadata — never the hash or plaintext. Timestamps are ISO strings. */
export type AllianceScimTokenMeta = {
  id: number;
  label: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

/** Redacted alliance SCIM config — flags + the redacted token list (no secrets). */
export type AllianceScimConfig = {
  enabled: boolean;
  allowScimAccountLinking: boolean;
  tokens: AllianceScimTokenMeta[];
};

/** PUT /scim body — at least one flag; the allianceId comes from the route, never the body. */
export type AllianceScimConfigInput = {
  enabled?: boolean;
  allowScimAccountLinking?: boolean;
};

/** The mint response — `token` is the plaintext bearer, returned ONCE. Surface it immediately. */
export type MintedAllianceScimToken = {
  id: number;
  label: string | null;
  createdAt: string;
  /** Plaintext bearer token — never returned again. */
  token: string;
};

/** An IdP-group → alliance-group mapping row. */
export type AllianceGroupMapping = {
  id: number;
  groupId: number;
  groupName: string;
  idpGroupExternalId: string;
};

/** An IdP-group → alliance_role (D-05 elevation) mapping row. */
export type AllianceRoleMapping = {
  id: number;
  idpGroupExternalId: string;
  mappedRole: AllianceRole;
};

/**
 * Read-only SCIM provisioning telemetry (GET .../scim/telemetry): config flags, token
 * and group counts, and informational `notes` (e.g. that per-user provision/deprovision
 * events aren't tracked). Timestamps serialize as ISO strings or null.
 */
export type AllianceScimTelemetry = {
  config: { enabled: boolean; allowScimAccountLinking: boolean };
  tokens: { total: number; active: number; revoked: number; lastUsedAt: string | null };
  groups: { total: number; memberships: number; lastSyncedAt: string | null };
  notes: string[];
};

/** A user synced into a SCIM group (member preview on a draft group). */
export type SyncedGroupMember = {
  userId: number;
  name: string;
  email: string;
};

/** A name-derived access suggestion — pre-fills the wire UI, never auto-applied. */
export type AccessSuggestion = {
  mappedRole: AllianceRole;
  rationale: string;
};

/**
 * A "draft" IdP group the connector has already pushed into the store, with its member
 * preview, current wired state (group and/or role mapping matched on external id), and a
 * name-derived suggestion. Timestamps serialize as ISO strings or null.
 */
export type SyncedGroup = {
  id: number;
  externalId: string | null;
  displayName: string;
  memberCount: number;
  members: SyncedGroupMember[];
  wiredGroup: { mappingId: number; groupId: number; groupName: string } | null;
  wiredRole: { mappingId: number; mappedRole: AllianceRole } | null;
  suggestion: AccessSuggestion | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** Where a synced IdP group's access is wired to (discriminated by `type`). */
export type WireTarget =
  | { type: 'role'; mappedRole: AllianceRole }
  | { type: 'existingGroup'; groupId: number }
  | { type: 'newGroup'; name: string; orgRole: string; orgIds?: number[] };

/** Result of wiring a synced group — how many already-synced members were reconciled. */
export type WireResult = {
  externalId: string;
  wired: WireTarget['type'];
  usersReconciled: number;
};

const base = (allianceId: number): string => `/api/alliances/${allianceId}`;

/** The bearer SCIM surface origin — matches the per-org connector (`<origin>/api/scim/v2`). */
export const allianceScimBaseUrl = (): string => `${API_BASE_URL.replace(/\/$/, '')}/api/scim/v2`;

export const allianceScimService = {
  // ─── SCIM config ─────────────────────────────────────────────────────────────
  getConfig: async (allianceId: number): Promise<AllianceScimConfig> => {
    const res = await apiClient.get<{ data: AllianceScimConfig }>(`${base(allianceId)}/scim`);
    return res.data.data;
  },

  putConfig: async (
    allianceId: number,
    input: AllianceScimConfigInput
  ): Promise<AllianceScimConfig> => {
    const res = await apiClient.put<{ data: AllianceScimConfig }>(`${base(allianceId)}/scim`, input);
    return res.data.data;
  },

  /** Read-only provisioning telemetry (GET .../scim/telemetry). */
  getTelemetry: async (allianceId: number): Promise<AllianceScimTelemetry> => {
    const res = await apiClient.get<{ data: AllianceScimTelemetry }>(
      `${base(allianceId)}/scim/telemetry`
    );
    return res.data.data;
  },

  // ─── Bearer tokens ───────────────────────────────────────────────────────────
  listTokens: async (allianceId: number): Promise<AllianceScimTokenMeta[]> => {
    const res = await apiClient.get<{ data: AllianceScimTokenMeta[] }>(
      `${base(allianceId)}/scim/tokens`
    );
    return res.data.data;
  },

  /** POST a new bearer token — the plaintext is returned ONCE here (never again). */
  mintToken: async (allianceId: number, label?: string): Promise<MintedAllianceScimToken> => {
    const res = await apiClient.post<{ data: MintedAllianceScimToken }>(
      `${base(allianceId)}/scim/tokens`,
      label ? { label } : {}
    );
    return res.data.data;
  },

  revokeToken: async (allianceId: number, tokenId: number): Promise<{ revoked: boolean }> => {
    const res = await apiClient.delete<{ data: { revoked: boolean } }>(
      `${base(allianceId)}/scim/tokens/${tokenId}`
    );
    return res.data.data;
  },

  // ─── IdP-group → alliance-group maps ─────────────────────────────────────────
  listGroupMaps: async (allianceId: number): Promise<AllianceGroupMapping[]> => {
    const res = await apiClient.get<{ data: AllianceGroupMapping[] }>(
      `${base(allianceId)}/scim/group-maps`
    );
    return res.data.data;
  },

  setGroupMap: async (
    allianceId: number,
    input: { groupId: number; idpGroupExternalId: string }
  ): Promise<AllianceGroupMapping> => {
    const res = await apiClient.put<{ data: AllianceGroupMapping }>(
      `${base(allianceId)}/scim/group-maps`,
      input
    );
    return res.data.data;
  },

  deleteGroupMap: async (allianceId: number, mappingId: number): Promise<{ deleted: boolean }> => {
    const res = await apiClient.delete<{ data: { deleted: boolean } }>(
      `${base(allianceId)}/scim/group-maps/${mappingId}`
    );
    return res.data.data;
  },

  // ─── IdP-group → alliance_role maps (D-05 elevation) ─────────────────────────
  listRoleMaps: async (allianceId: number): Promise<AllianceRoleMapping[]> => {
    const res = await apiClient.get<{ data: AllianceRoleMapping[] }>(
      `${base(allianceId)}/scim/role-maps`
    );
    return res.data.data;
  },

  setRoleMap: async (
    allianceId: number,
    input: { idpGroupExternalId: string; mappedRole: AllianceRole }
  ): Promise<AllianceRoleMapping> => {
    const res = await apiClient.put<{ data: AllianceRoleMapping }>(
      `${base(allianceId)}/scim/role-maps`,
      input
    );
    return res.data.data;
  },

  deleteRoleMap: async (allianceId: number, mappingId: number): Promise<{ deleted: boolean }> => {
    const res = await apiClient.delete<{ data: { deleted: boolean } }>(
      `${base(allianceId)}/scim/role-maps/${mappingId}`
    );
    return res.data.data;
  },

  // ─── Synced ("draft") IdP groups — visibility + wire-with-backfill ───────────
  /** The IdP groups already pushed into the store (member preview + wired state + suggestion). */
  listSyncedGroups: async (allianceId: number): Promise<SyncedGroup[]> => {
    const res = await apiClient.get<{ data: SyncedGroup[] }>(
      `${base(allianceId)}/scim/synced-groups`
    );
    return res.data.data;
  },

  /** Wire a synced group's access and backfill its already-synced members in one shot. */
  wireSyncedGroup: async (
    allianceId: number,
    input: { idpGroupExternalId: string; target: WireTarget }
  ): Promise<WireResult> => {
    const res = await apiClient.post<{ data: WireResult }>(
      `${base(allianceId)}/scim/synced-groups/wire`,
      input
    );
    return res.data.data;
  },

  /** Manual "Re-sync now": reconcile every currently-synced member (no cron exists). */
  resync: async (allianceId: number): Promise<{ usersReconciled: number }> => {
    const res = await apiClient.post<{ data: { usersReconciled: number } }>(
      `${base(allianceId)}/scim/resync`,
      {}
    );
    return res.data.data;
  },
};
