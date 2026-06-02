import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type { OrganizationRole } from '@/types/roles';

export type Invitation = {
  id: number;
  email: string;
  role: OrganizationRole;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
};

export const invitationService = {
  invite: async (email: string, role: OrganizationRole, departmentId: number, organizationId: number) => {
    const response = await apiClient.post<ApiResponse<null>>('/api/invitations', {
      email,
      role,
      departmentId,
      organizationId,
    });
    return response.data;
  },

  list: async () => {
    const response = await apiClient.get<ApiResponse<Invitation[]>>('/api/invitations');
    return response.data.data ?? [];
  },

  cancel: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/api/invitations/${id}`);
    return response.data;
  },
};
