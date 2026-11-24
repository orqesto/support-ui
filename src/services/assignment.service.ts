import { apiClient } from '@/lib/api-client';
import { scopedLookup } from '@/lib/scopedLookup';
import type { ApiResponse } from '@/types';

export type AssignableUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  /** Profile photo key; null without one. */
  photoKey?: string | null;
  role: string;
  // False when the user isn't a member of the scoped department (and isn't an
  // org-admin). The picker shows them disabled rather than hiding them. Optional
  // for backward-compat with responses predating the flag.
  eligible?: boolean;
  /**
   * A mentor (1.1.330): assignable by hand, never routed to; pickers list mentors in their own
   * "Mentors" section. Always a boolean after `getAssignableUsers` — false on a backend that does
   * not send it.
   */
  isMentor?: boolean;
};

/** The heading of the assignee pickers' mentor section. */
export const MENTORS_SECTION = 'Mentors';

/** Missing `isMentor` (an older backend) reads as a working agent; the server's order is kept. */
export const normaliseAssignable = (rows: AssignableUser[]): AssignableUser[] =>
  rows.map((row) => ({ ...row, isMentor: row.isMentor === true }));

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
    // Shared for a minute per scope and filter; a write under /api/users or /api/departments
    // clears it (see scopedLookup).
    return scopedLookup(
      'assignable-users',
      async () => {
        const response = await apiClient.get<ApiResponse<AssignableUser[]>>(
          '/api/assignments/assignable-users',
          { params }
        );
        return normaliseAssignable(response.data.data ?? []);
      },
      params.skillKey,
      params.skillValue,
      params.departmentId
    );
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
