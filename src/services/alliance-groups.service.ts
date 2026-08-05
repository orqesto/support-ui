import { apiClient } from '@/lib/api-client';
import type { OrganizationRole } from '@/types/roles';

/** Alliance group detail (mirrors the BE AllianceGroupDetail). */
export type AllianceGroup = {
  id: number;
  name: string;
  description: string | null;
  orgRole: OrganizationRole | null;
  orgIds: number[];
  memberIds: number[];
  memberCount: number;
};

export type GroupCreateInput = {
  name: string;
  description?: string | null;
  orgRole: OrganizationRole;
  orgIds: number[];
  memberIds: number[];
};

const base = (allianceId: number): string => `/api/alliances/${allianceId}/groups`;

export const allianceGroupsService = {
  list: async (allianceId: number): Promise<AllianceGroup[]> => {
    const res = await apiClient.get<{ data: AllianceGroup[] }>(base(allianceId));
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

  setOrgs: async (allianceId: number, groupId: number, orgIds: number[]): Promise<void> => {
    await apiClient.put(`${base(allianceId)}/${groupId}/orgs`, { orgIds });
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
