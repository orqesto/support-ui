import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type AssignableUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

export const assignmentService = {
  async getAssignableUsers(
    skillFilter?: { key: string; value: string },
    departmentId?: number
  ): Promise<AssignableUser[]> {
    const params: Record<string, string> = {};
    if (skillFilter?.key && skillFilter?.value) {
      params.skillKey = skillFilter.key;
      params.skillValue = skillFilter.value;
    }
    if (departmentId !== undefined) {
      params.departmentId = String(departmentId);
    }
    const response = await apiClient.get<ApiResponse<AssignableUser[]>>(
      '/api/assignments/assignable-users',
      { params }
    );
    return response.data.data ?? [];
  },

  async assignMessage(messageId: number, userId: number | null): Promise<void> {
    await apiClient.patch(`/api/assignments/messages/${messageId}/assign`, { userId });
  },

  async assignThread(threadId: string, userId: number | null): Promise<void> {
    await apiClient.patch(`/api/assignments/threads/${encodeURIComponent(threadId)}/assign`, { userId });
  },

  async assignTicket(ticketId: number, userId: number | null): Promise<void> {
    await apiClient.patch(`/api/assignments/tickets/${ticketId}/assign`, { userId });
  },

  async moveTicketDepartment(
    ticketId: number,
    departmentId: number
  ): Promise<{
    id: number;
    departmentId: number;
    previousDepartmentId: number | null;
    assigneeCleared: boolean;
  }> {
    const response = await apiClient.patch<
      ApiResponse<{
        id: number;
        departmentId: number;
        previousDepartmentId: number | null;
        assigneeCleared: boolean;
      }>
    >(`/api/tickets/${ticketId}/move-department`, { departmentId });
    return response.data.data!;
  },
};
