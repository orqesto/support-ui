import { apiClient } from '@/lib/api-client';
import type { AllianceRole } from '@/types/roles';

/**
 * Alliance admin console service. All calls hit `/api/alliances/*`, so the
 * api-client interceptor (D-ADM-1) attaches X-Alliance-Context and suppresses
 * X-Organization-Context automatically — this layer never sets scope headers.
 * The BE wraps payloads as { success, message, data }; we unwrap `.data.data`.
 */
export type AllianceOverview = {
  id: number;
  name: string;
  slug: string;
  counts: { orgs: number; members: number; groups: number };
  sso: { connected: boolean };
  scim: { connected: boolean };
};

export type MyAlliance = { id: number; name: string; slug: string; orgCount: number };

export type AllianceOrg = { id: number; name: string; slug: string; active: boolean; memberCount: number };
export type AttachableOrg = { id: number; name: string; slug: string };
/** A user the add-member picker can offer — already in one of the alliance's workspaces. */
export type AllianceCandidateUser = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export type EffectiveRole = { orgId: number; orgName: string; role: string };
export type AllianceMember = {
  userId: number;
  name: string;
  email: string | null;
  // null = an alliance member holding no alliance power (BE mig 0089).
  allianceRole: AllianceRole | null;
  effectiveRoles: EffectiveRole[];
  /** false ⇒ deactivated (no active workspace access, cannot log in). Optional for
   *  backward-compat with a backend that predates the field — treat absent as active. */
  active?: boolean;
  /** true ⇒ an alliance admin placed a durable in-Odly hold that survives IdP sync. */
  heldByAdmin?: boolean;
};

const BASE = '/api/alliances';

/** A member the workspace grants already describe as an alliance administrator. */
export type AllianceAdminProposal = {
  userId: number;
  name: string;
  email: string;
  /** The workspaces they already administer — the argument for the grant. */
  adminOf: Array<{ orgId: number; orgName: string }>;
};

export const allianceAdminService = {
  /** Real orgs/members/groups counts + connection status for one alliance. */
  getOverview: async (allianceId: number): Promise<AllianceOverview> => {
    const res = await apiClient.get<{ data: AllianceOverview }>(`${BASE}/${allianceId}/overview`);
    return res.data.data;
  },

  /** The alliances the current user may administer (drives switcher + nav gate). */
  listMyAlliances: async (): Promise<MyAlliance[]> => {
    const res = await apiClient.get<{ data: MyAlliance[] }>(`${BASE}/mine`);
    return res.data.data;
  },

  // ─── Organizations ─────────────────────────────────────────────────────────
  listOrgs: async (allianceId: number): Promise<AllianceOrg[]> => {
    const res = await apiClient.get<{ data: AllianceOrg[] }>(`${BASE}/${allianceId}/orgs`);
    return res.data.data;
  },

  listAttachableOrgs: async (allianceId: number): Promise<AttachableOrg[]> => {
    const res = await apiClient.get<{ data: AttachableOrg[] }>(`${BASE}/${allianceId}/attachable-orgs`);
    return res.data.data;
  },

  /**
   * Candidate users for the add-member picker: people already in one of this alliance's
   * workspaces (never the global directory), minus existing members, filtered by `search`.
   * Alliance-scoped so a non-global alliance_admin can use it (requireAllianceAdmin).
   */
  listMemberCandidates: async (
    allianceId: number,
    search?: string
  ): Promise<AllianceCandidateUser[]> => {
    const res = await apiClient.get<{ data: AllianceCandidateUser[] }>(
      `${BASE}/${allianceId}/member-candidates`,
      { params: search ? { search } : undefined }
    );
    return res.data.data;
  },

  attachOrg: async (allianceId: number, orgId: number): Promise<void> => {
    await apiClient.post(`${BASE}/${allianceId}/orgs`, { orgId });
  },

  detachOrg: async (allianceId: number, orgId: number): Promise<void> => {
    await apiClient.delete(`${BASE}/${allianceId}/orgs/${orgId}`);
  },

  // ─── Members ───────────────────────────────────────────────────────────────
  /**
   * Members whose WORKSPACE grants already describe an alliance administrator — org-admin on
   * more than one workspace of this alliance — but who hold no alliance power.
   *
   * A proposal, never a grant: confirming goes through `changeMemberRole`, so a human owns it.
   *
   * Returns [] rather than throwing when the endpoint is absent. The frontend deploys on merge
   * while the backend ships on its own cadence, so this route 404s in production until the
   * alliance-axis PR lands — and while it does, the card must simply not appear rather than
   * break the Provisioning page around it.
   */
  listAdminProposals: async (allianceId: number): Promise<AllianceAdminProposal[]> => {
    try {
      const res = await apiClient.get<{ data: AllianceAdminProposal[] }>(
        `${BASE}/${allianceId}/members/admin-proposals`
      );
      return res.data.data ?? [];
    } catch {
      return [];
    }
  },

  listMembersEffective: async (allianceId: number): Promise<AllianceMember[]> => {
    const res = await apiClient.get<{ data: AllianceMember[] }>(
      `${BASE}/${allianceId}/members`,
      { params: { effective: '1' } }
    );
    return res.data.data;
  },

  addMember: async (
    allianceId: number,
    userId: number,
    allianceRole: AllianceRole | null
  ): Promise<void> => {
    await apiClient.post(`${BASE}/${allianceId}/members`, { userId, allianceRole });
  },

  changeMemberRole: async (
    allianceId: number,
    userId: number,
    allianceRole: AllianceRole | null
  ): Promise<void> => {
    await apiClient.patch(`${BASE}/${allianceId}/members/${userId}`, { allianceRole });
  },

  /**
   * DURABLE deactivate ("hold"): blocks this member from logging in to every workspace
   * in the alliance, and survives IdP sync until reactivated. NOT a hard removal — full
   * offboarding stays the IdP's job. (DELETE is repurposed; the BE soft-deactivates.)
   */
  deactivateMember: async (allianceId: number, userId: number): Promise<void> => {
    await apiClient.delete(`${BASE}/${allianceId}/members/${userId}`);
  },

  /** Lift the hold and hand the member back to normal IdP-driven reconciliation. */
  reactivateMember: async (allianceId: number, userId: number): Promise<void> => {
    await apiClient.post(`${BASE}/${allianceId}/members/${userId}/reactivate`, {});
  },
};
