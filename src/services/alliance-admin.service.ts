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
  allianceRole: AllianceRole;
  effectiveRoles: EffectiveRole[];
};

const BASE = '/api/alliances';

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
  listMembersEffective: async (allianceId: number): Promise<AllianceMember[]> => {
    const res = await apiClient.get<{ data: AllianceMember[] }>(
      `${BASE}/${allianceId}/members`,
      { params: { effective: '1' } }
    );
    return res.data.data;
  },

  addMember: async (allianceId: number, userId: number, allianceRole: AllianceRole): Promise<void> => {
    await apiClient.post(`${BASE}/${allianceId}/members`, { userId, allianceRole });
  },

  changeMemberRole: async (allianceId: number, userId: number, allianceRole: AllianceRole): Promise<void> => {
    await apiClient.patch(`${BASE}/${allianceId}/members/${userId}`, { allianceRole });
  },

  removeMember: async (allianceId: number, userId: number): Promise<void> => {
    await apiClient.delete(`${BASE}/${allianceId}/members/${userId}`);
  },
};
