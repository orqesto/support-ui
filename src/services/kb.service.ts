import { apiClient } from '@/lib/api-client';

export type KBEntry = {
  id: number;
  type: 'qa_pair' | 'document' | 'manual_entry';
  title: string;
  content: string;
  category: string;
  departmentRole: string;
  qualityScore: number;
  approved: boolean;
  hidden: boolean;
  usageCount: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
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

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/api/knowledge-base/entries/${id}`);
    return response.data;
  },
};
