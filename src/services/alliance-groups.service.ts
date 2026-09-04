import { apiClient } from '@/lib/api-client';
import type { OrganizationRole, PermissionOverrides } from '@/types/roles';

/** Per-org department mapping: workspace id → the department ids this group grants there. */
export type DepartmentIdsByOrg = Record<number, number[]>;

/** A mappable department of one org (for the dept pickers). */
export type AllianceDepartment = { id: number; name: string };

/** Alliance group detail (mirrors the BE AllianceGroupDetail). */
export type AllianceGroup = {
  id: number;
  name: string;
  description: string | null;
  orgRole: OrganizationRole | null;
  /**
   * Permissions the group grants on top of its role, in the same { added, removed } shape
   * a single member already supports.
   *
   * Optional because the backend that returns it ships separately from this app: until it
   * is deployed the key is ABSENT, and the editor must not read that as "customizes
   * nothing" and then SAVE that emptiness back over a real grant.
   */
  permissionOverrides?: PermissionOverrides;
  /**
   * The IdP group wired to this alliance group, if any — the same mapping the synced-groups
   * screen authors, seen from the group's side. `mappingId` is what unwires it.
   *
   * Optional: the backend that returns it ships separately, and an absent field means
   * "this build can't tell", not "not wired".
   */
  idpGroup?: {
    mappingId: number;
    externalId: string;
    displayName: string | null;
    /**
     * True when the wire minted this group (named after the IdP group and its role, hidden
     * from the Groups page, retired on unwire). False = a hand-authored group wired later:
     * listed, renamable, kept on unwire. Absent on an older backend — then treated as minted,
     * the pre-existing behaviour.
     */
    mintedByWire?: boolean;
  } | null;
  /**
   * Members present because the IdP put them in the wired group. Both they and hand-added
   * members live in the same list, so without this the editor invites an admin to remove
   * someone the next sync restores.
   */
  idpManagedMemberIds?: number[];
  orgIds: number[];
  departmentIdsByOrg: DepartmentIdsByOrg;
  memberIds: number[];
  memberCount: number;
};

export type GroupCreateInput = {
  name: string;
  description?: string | null;
  orgRole: OrganizationRole;
  permissionOverrides?: PermissionOverrides;
  orgIds: number[];
  departmentIdsByOrg: DepartmentIdsByOrg;
  memberIds: number[];
};

const base = (allianceId: number): string => `/api/alliances/${allianceId}/groups`;

export const allianceGroupsService = {
  list: async (allianceId: number): Promise<AllianceGroup[]> => {
    const res = await apiClient.get<{ data: AllianceGroup[] }>(base(allianceId));
    return res.data.data;
  },

  listOrgDepartments: async (allianceId: number, orgId: number): Promise<AllianceDepartment[]> => {
    const res = await apiClient.get<{ data: AllianceDepartment[] }>(
      `/api/alliances/${allianceId}/orgs/${orgId}/departments`
    );
    return res.data.data;
  },

  create: async (allianceId: number, input: GroupCreateInput): Promise<{ id: number }> => {
    const res = await apiClient.post<{ data: { id: number } }>(base(allianceId), input);
    return res.data.data;
  },

  update: async (
    allianceId: number,
    groupId: number,
    patch: {
      name?: string;
      description?: string | null;
      orgRole?: OrganizationRole;
      permissionOverrides?: PermissionOverrides;
    }
  ): Promise<void> => {
    await apiClient.patch(`${base(allianceId)}/${groupId}`, patch);
  },

  setOrgs: async (
    allianceId: number,
    groupId: number,
    orgIds: number[],
    departmentIdsByOrg: DepartmentIdsByOrg = {}
  ): Promise<void> => {
    await apiClient.put(`${base(allianceId)}/${groupId}/orgs`, { orgIds, departmentIdsByOrg });
  },

  addMember: async (allianceId: number, groupId: number, userId: number): Promise<void> => {
    await apiClient.post(`${base(allianceId)}/${groupId}/members`, { userId });
  },

  removeMember: async (allianceId: number, groupId: number, userId: number): Promise<void> => {
    await apiClient.delete(`${base(allianceId)}/${groupId}/members/${userId}`);
  },

  remove: async (allianceId: number, groupId: number): Promise<void> => {
    await apiClient.delete(`${base(allianceId)}/${groupId}`);
  },
};
