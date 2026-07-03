import { apiClient } from '@/lib/api-client';
// Unified attachment shape (generated backend contract). Re-exported for the
// existing call sites (TicketAttachments, etc.) that import it from here.
import type { Attachment } from '@/types/ai';

export type { Attachment };

export type Comment = {
  id: number;
  ticketId: number;
  userId: number | null;
  authorName: string;
  content: string;
  isInternal: boolean;
  externalId: string | null;
  source: 'app' | 'jira';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
  user: {
    id: number;
    firstName: string;
    lastName: string | null;
    email: string;
    position: string | null;
    role: string;
  } | null;
  attachments?: Attachment[];
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

export const commentsService = {
  getAll: async (ticketId: number): Promise<ApiResponse<Comment[]>> => {
    const response = await apiClient.get<ApiResponse<Comment[]>>(
      `/api/tickets/${ticketId}/comments`
    );
    return response.data;
  },

  create: async (
    ticketId: number,
    content: string,
    isInternal: boolean = false
  ): Promise<ApiResponse<Comment>> => {
    const response = await apiClient.post<ApiResponse<Comment>>(
      `/api/tickets/${ticketId}/comments`,
      { content, isInternal }
    );
    return response.data;
  },

  update: async (commentId: number, content: string): Promise<ApiResponse<Comment>> => {
    const response = await apiClient.put<ApiResponse<Comment>>(`/api/comments/${commentId}`, {
      content,
    });
    return response.data;
  },

  delete: async (commentId: number): Promise<ApiResponse<void>> => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/comments/${commentId}`);
    return response.data;
  },

  uploadAttachments: async (
    commentId: number,
    files: File[]
  ): Promise<ApiResponse<Attachment[]>> => {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await apiClient.post<ApiResponse<Attachment[]>>(
      `/api/comments/${commentId}/attachments`,
      formData
    );

    return response.data;
  },

  deleteAttachment: async (attachmentId: number): Promise<ApiResponse<void>> => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/attachments/${attachmentId}`);
    return response.data;
  },

  getTicketAttachments: async (ticketId: number): Promise<ApiResponse<Attachment[]>> => {
    const response = await apiClient.get<ApiResponse<Attachment[]>>(
      `/api/tickets/${ticketId}/attachments`
    );
    return response.data;
  },

  syncFromJira: async (ticketId: number): Promise<ApiResponse<Comment[]>> => {
    const response = await apiClient.post<ApiResponse<Comment[]>>(
      `/api/tickets/${ticketId}/comments/sync`
    );
    return response.data;
  },
};
