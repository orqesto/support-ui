import { apiClient } from '@/lib/api-client';
import type { OrganizationRole } from '@/types/roles';

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
  orgIds: number[];
  departmentIdsByOrg: DepartmentIdsByOrg;
  memberIds: number[];
  memberCount: number;
};

export type GroupCreateInput = {
  name: string;
  description?: string | null;
  orgRole: OrganizationRole;
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
    patch: { name?: string; description?: string | null; orgRole?: OrganizationRole }
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
