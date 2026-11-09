/** The messages API's thread actions, notes and activity (split out of message.service.ts, F5). */
import { apiClient } from '@/lib/api-client';
import type { Message, ApiResponse, ThreadStatus, TicketPriority } from '@/types';
import type { MessageActivityEntry, MessageNote } from './message.types';

export const messageActionsApi = {
  markAsProcessed: async (id: number, ticketId?: number) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/api/messages/${id}/process`,
      ticketId ? { ticketId } : {}
    );
    return response.data;
  },

  /**
   * Bin a thread as NOT CUSTOMER WORK — a newsletter, a notice, our own outbound echo. Same
   * `/process` endpoint (the row closes either way); the `disposition` is what keeps it out of
   * every statistic and out of the KB. ⛔ A wrong string here answers 400 rather than closing it
   * as an ordinary resolution, so a typo is a broken button and never a silently inflated count.
   * `reason` may be omitted — the backend stores null rather than inventing one.
   */
  markAsNotCustomerWork: async (id: number, reason?: string) => {
    const response = await apiClient.post<ApiResponse<Message>>(`/api/messages/${id}/process`, {
      disposition: 'not_customer_work',
      ...(reason?.trim() ? { dispositionReason: reason.trim() } : {}),
    });
    return response.data;
  },

  markAsUnprocessed: async (id: number) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/api/messages/${id}/unprocess`,
      {}
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/messages/${id}`);
    return response.data;
  },

  resolve: async (id: number) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/resolve`, {});
    return response.data;
  },

  reopen: async (id: number) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reopen`, {});
    return response.data;
  },

  /**
   * ⛔ `confirm_spam` IS NOT A RESOLVE, and must never be labelled as one (SP-D5). A confirmed
   * spam thread keeps `status='filtered'`, so it never appears in the Resolved column — calling
   * it "resolve" sends agents looking for the thread somewhere it can never be.
   */
  classify: async (
    id: number,
    action: 'approve' | 'mark_suspicious' | 'move_to_spam' | 'confirm_spam',
    createDetectionRule?: boolean,
    // move_to_spam only: opt in to mint a learned spam rule from this message.
    trainSpamFilter?: boolean,
    // move_to_spam only: bin AND stamp the agent's confirmation in the same write (SP-D1).
    confirm?: boolean
  ) => {
    const response = await apiClient.patch<ApiResponse<void>>(`/api/messages/${id}/classify`, {
      action,
      ...(createDetectionRule ? { createDetectionRule: true } : {}),
      ...(trainSpamFilter ? { trainFilter: true } : {}),
      ...(confirm ? { confirm: true } : {}),
    });
    return response.data;
  },

  // ─── Message ticket parity ───────────────────────────────────────────────

  getActivity: async (id: number) => {
    const response = await apiClient.get<ApiResponse<MessageActivityEntry[]>>(
      `/api/messages/${id}/activity`
    );
    return response.data.data ?? [];
  },

  getNotes: async (id: number) => {
    const response = await apiClient.get<ApiResponse<MessageNote[]>>(`/api/messages/${id}/notes`);
    return response.data;
  },

  addNote: async (id: number, content: string) => {
    const response = await apiClient.post<ApiResponse<MessageNote>>(`/api/messages/${id}/notes`, {
      content,
    });
    return response.data;
  },

  updateNote: async (id: number, noteId: number, content: string) => {
    const response = await apiClient.patch<ApiResponse<MessageNote>>(
      `/api/messages/${id}/notes/${noteId}`,
      { content }
    );
    return response.data;
  },

  deleteNote: async (id: number, noteId: number) => {
    const response = await apiClient.delete<ApiResponse<{ id: number }>>(
      `/api/messages/${id}/notes/${noteId}`
    );
    return response.data;
  },

  /** `hold`: On-hold's reason and recheck date (only with status `pending`). */
  setStatus: async (id: number, status: ThreadStatus, hold?: { reason: string; until: Date }) => {
    const response = await apiClient.patch<ApiResponse<{ id: number; status: ThreadStatus }>>(
      `/api/messages/${id}/status`,
      {
        status,
        ...(hold ? { holdReason: hold.reason, holdUntil: hold.until.toISOString() } : {}),
      }
    );
    return response.data;
  },

  setPriority: async (id: number, priority: TicketPriority) => {
    const response = await apiClient.patch<ApiResponse<{ id: number; priority: TicketPriority }>>(
      `/api/messages/${id}/priority`,
      { priority }
    );
    return response.data;
  },

  setCategory: async (id: number, categoryId: number | null) => {
    const response = await apiClient.patch<ApiResponse<{ id: number; categoryId: number | null }>>(
      `/api/messages/${id}/category`,
      { categoryId }
    );
    return response.data;
  },

  close: async (id: number) => {
    const response = await apiClient.post<
      ApiResponse<{ id: number; status: string; closedAt: string }>
    >(`/api/messages/${id}/close`, {});
    return response.data;
  },

  /** Mute (true) or unmute (false) a thread for the signed-in user: PUT / DELETE .../mute. */
  setThreadMute: async (id: number, muted: boolean): Promise<boolean> => {
    const response = muted
      ? await apiClient.put<ApiResponse<{ muted: boolean }>>(`/api/messages/${id}/mute`, {})
      : await apiClient.delete<ApiResponse<{ muted: boolean }>>(`/api/messages/${id}/mute`);
    return response.data?.data?.muted ?? muted;
  },

  // Per-user read/unread state for the triage queues.
  markRead: async (id: number) => {
    const response = await apiClient.put<ApiResponse<{ conversationId: number; isRead: boolean }>>(
      `/api/messages/${id}/read`,
      {}
    );
    return response.data;
  },

  markUnread: async (id: number) => {
    const response = await apiClient.delete<
      ApiResponse<{ conversationId: number; isRead: boolean }>
    >(`/api/messages/${id}/read`);
    return response.data;
  },

  markAsLead: async (id: number, isLead: boolean) => {
    const response = await apiClient.patch<ApiResponse<{ id: number; isLead: boolean }>>(
      `/api/messages/${id}/lead`,
      { isLead }
    );
    return response.data;
  },

  updateLeadState: async (
    id: number,
    payload: {
      contactInfo?: { name?: string; email?: string; phone?: string };
      qualificationFields?: Record<string, string | null>;
    }
  ) => {
    const response = await apiClient.patch<ApiResponse<{ id: number; leadState: unknown }>>(
      `/api/messages/${id}/lead-state`,
      payload
    );
    return response.data;
  },

  // Spec ROUTING-PROPOSALS 2026-10-14 (D3, audit B4): every route is learning evidence on the
  // backend. NEVER send `learn` — an older backend mints a LIVE rule on learn:true. The backend
  // answers data.learningRecorded; an older one sends no data, read as false.
  manualRoute: async (id: number, departmentId: number): Promise<{ learningRecorded: boolean }> => {
    const response = await apiClient.patch<{
      success: boolean;
      data?: { learningRecorded?: unknown };
    }>(`/api/messages/${id}/manual-route`, { departmentId });
    return { learningRecorded: response.data?.data?.learningRecorded === true };
  },
};
