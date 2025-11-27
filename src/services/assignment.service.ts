import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type AssignableUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  departmentRole: string;
};

export const assignmentService = {
  async getAssignableUsers(departmentRole?: string): Promise<AssignableUser[]> {
    const params = departmentRole ? { departmentRole } : {};
    const response = await apiClient.get<ApiResponse<AssignableUser[]>>(
      '/api/assignments/assignable-users',
      { params }
    );
    return response.data.data ?? [];
  },

  async assignMessage(messageId: number, userId: number | null): Promise<void> {
    await apiClient.patch(`/api/assignments/messages/${messageId}/assign`, { userId });
  },

  async assignTicket(ticketId: number, userId: number | null): Promise<void> {
    await apiClient.patch(`/api/assignments/tickets/${ticketId}/assign`, { userId });
  },
};
