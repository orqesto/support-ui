import { apiClient } from '@/lib/api-client';
import { API_BASE_URL } from '@/lib/config';
import { getErrorStatus } from '@/lib/errorMessages';
import type { OrganizationRole, PermissionOverrides } from '@/types/roles';

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
 *  - role-maps  — IdP-group external id → alliance_role. LEGACY: list + delete only.
 *                 Nothing creates these any more (Role-Model v2 §0.2) and the backend
 *                 exposes no writer; alliance admin is derived from workspace grants.
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
  /**
   * Human-readable IdP group name resolved from the SCIM group store, or `null` when the
   * IdP hasn't pushed that group yet — render "name (external id)" with an id-only
   * fallback. May be absent on a backend older than this field; treat undefined as null.
   */
  idpGroupDisplayName?: string | null;
};

/** An IdP-group → alliance_role (D-05 elevation) mapping row. */
export type AllianceRoleMapping = {
  id: number;
  idpGroupExternalId: string;
  mappedRole: AllianceRole;
  /**
   * Human-readable IdP group name resolved from the SCIM group store, or `null` when the
   * IdP hasn't pushed that group yet. May be absent on an older backend; treat as null.
   */
  idpGroupDisplayName?: string | null;
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
  // OPTIONAL — only present on backends carrying the SCIM event ledger. A frontend on a
  // newer version than the BE (e.g. FE prod ahead of BE prod) must treat these as absent.
  admins?: { activeAdminCount: number; hasActiveAdmin: boolean };
  events?: { total: number; lastEventAt: string | null };
  notes: string[];
};

/** One row of the SCIM connector event ledger. Timestamps serialize as ISO strings. */
export type AllianceScimEvent = {
  id: number;
  eventType: string;
  /** 'info' | 'warning' — free text so a new value never needs a FE change. */
  severity: string;
  /** 'idp' | 'admin' | 'system' — free text (see severity). */
  actorType: string;
  actorTokenId: number | null;
  actorUserId: number | null;
  targetUserId: number | null;
  targetEmail: string | null;
  idpGroupExternalId: string | null;
  beforeRole: string | null;
  afterRole: string | null;
  outcome: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

/**
 * A page of the event ledger. `available` is FALSE when the backend does not yet expose
 * the `/scim/events` endpoint (404) — the panel then degrades silently instead of
 * surfacing an error, so the FE can ship ahead of the BE reaching an environment.
 */
export type AllianceScimEventPage = {
  available: boolean;
  events: AllianceScimEvent[];
  nextCursor: number | null;
};

/** A user synced into a SCIM group (member preview on a draft group). */
export type SyncedGroupMember = {
  userId: number;
  name: string;
  email: string;
};

/**
 * A name-derived access suggestion — pre-fills the wire UI, never auto-applied.
 *
 * Carries an ORG role: an IdP group maps to a workspace role, never to an alliance role
 * (Role-Model v2 §0.2). Optional because the backend that renames the field ships
 * separately — an older payload has `mappedRole` instead, and the UI falls back to the
 * least-privileged default rather than reading a field that isn't there.
 */
export type AccessSuggestion = {
  orgRole?: OrganizationRole;
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

/**
 * Where a synced IdP group's access is wired to (discriminated by `type`).
 *
 * The `role` variant — wiring straight to an alliance role — was retired with Role-Model
 * v2 §0.2. `wiredRole` above still exists because a PRE-EXISTING mapping is still read
 * and shown; it just can't be created any more.
 */
export type WireTarget =
  | { type: 'existingGroup'; groupId: number }
  | {
      type: 'newGroup';
      name: string;
      orgRole: OrganizationRole;
      orgIds?: number[];
      /** Per-org department ids to map onto the backing group (scoped roles only). */
      departmentIdsByOrg?: Record<number, number[]>;
      /**
       * Permissions the backing group grants on top of its role — the same { added, removed }
       * shape the group API takes.
       *
       * Optional, and only sent when an admin actually customizes something: the backend that
       * accepts it here ships separately from this app, and one without it does not fail — it
       * STRIPS the unknown key and answers 200. So a wire that asked for overrides is read back
       * afterwards rather than assumed (see SyncedGroupsCard.submitWire).
       */
      permissionOverrides?: PermissionOverrides;
    };

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

  /**
   * Read-only connector event ledger (GET .../scim/events), newest-first, cursor-paginated.
   * 404-TOLERANT: on a backend that predates the ledger endpoint, resolves to
   * `{ available: false, events: [], nextCursor: null }` rather than throwing — the panel
   * then hides itself. Any other error propagates so genuine failures still surface.
   */
  listEvents: async (
    allianceId: number,
    params: { limit?: number; beforeId?: number } = {}
  ): Promise<AllianceScimEventPage> => {
    try {
      const res = await apiClient.get<{
        data: { events: AllianceScimEvent[]; nextCursor: number | null };
      }>(`${base(allianceId)}/scim/events`, { params });
      return { available: true, events: res.data.data.events, nextCursor: res.data.data.nextCursor };
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 404) {
        return { available: false, events: [], nextCursor: null };
      }
      throw error;
    }
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

  // ─── IdP-group → alliance_role maps — legacy, read + retire only ────────────
  listRoleMaps: async (allianceId: number): Promise<AllianceRoleMapping[]> => {
    const res = await apiClient.get<{ data: AllianceRoleMapping[] }>(
      `${base(allianceId)}/scim/role-maps`
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

  /**
   * Remove one synced IdP group outright — not its mapping, the group.
   *
   * ⚠️ This does not reach the identity provider; nothing on our side can. If the IdP
   * still has the group in scope, its next push recreates it. The confirm dialog says so.
   */
  removeSyncedGroup: async (
    allianceId: number,
    groupId: number
  ): Promise<{ removed: string }> => {
    const res = await apiClient.delete<{ data: { removed: string } }>(
      `${base(allianceId)}/scim/synced-groups/${groupId}`
    );
    return res.data.data;
  },

  /**
   * Manual "Re-sync now": reconcile every currently-synced member (no cron exists) AND
   * drop the groups the IdP has gone silent about — `groupsRemoved` is what the button
   * could never report before, because it only ever re-read local rows.
   */
  resync: async (
    allianceId: number
  ): Promise<{ usersReconciled: number; groupsRemoved: number; removedNames: string[] }> => {
    const res = await apiClient.post<{
      data: { usersReconciled: number; groupsRemoved: number; removedNames: string[] };
    }>(`${base(allianceId)}/scim/resync`, {});
    return res.data.data;
  },
};
