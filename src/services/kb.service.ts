import { apiClient } from '@/lib/api-client';

export type KBEntry = {
  id: number;
  type: 'qa_pair' | 'document' | 'manual_entry';
  title: string;
  content: string;
  category: string;
  departmentId: number | null;
  qualityScore: number;
  approved: boolean;
  hidden: boolean;
  usageCount: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
  typeData?: {
    documentContent?: string;
    attachmentId?: number;
    originalFilename?: string;
    fileType?: string;
    messageId?: number;
    [key: string]: unknown;
  };
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type ApiResponse<T> = {
  success: boolean;
  data: T;
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: {
    entries: T[];
    pagination: PaginationMeta;
  };
};

export const kbService = {
  getAll: async (params?: {
    type?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.set('type', params.type);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.status) queryParams.set('status', params.status);

    const queryString = queryParams.toString();
    const response = await apiClient.get<PaginatedResponse<KBEntry>>(
      `/api/knowledge-base/entries${queryString ? `?${queryString}` : ''}`
    );
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<KBEntry>>(`/api/knowledge-base/entries/${id}`);
    return response.data;
  },

  approve: async (id: number) => {
    const response = await apiClient.patch<ApiResponse<null>>(
      `/api/knowledge-base/entries/${id}/approve`
    );
    return response.data;
  },

  hide: async (id: number) => {
    const response = await apiClient.patch<ApiResponse<null>>(
      `/api/knowledge-base/entries/${id}/hide`
    );
    return response.data;
  },

  update: async (id: number, data: { title?: string; content?: string; category?: string }) => {
    const response = await apiClient.patch<ApiResponse<KBEntry>>(
      `/api/knowledge-base/entries/${id}`,
      data
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/api/knowledge-base/entries/${id}`);
    return response.data;
  },
};
