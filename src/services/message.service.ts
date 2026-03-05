import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import type { Message, ApiResponse } from '@/types';

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T;
  pagination: PaginationMeta;
};

export type MessagesMetadata = {
  total: number;
  totalPages: number;
  limit: number;
  unprocessed: number;
  resolved: number;
  spam: number;
};

export type MetadataResponse = {
  success: boolean;
  metadata: MessagesMetadata;
};

export type MessageThread = {
  threadId: string;
  messageCount: number;
  sender: string;
  channel: string;
  hasUnread: boolean;
  hasTicket: boolean;
  isResolved: boolean;
  lastMessageAt: Date;
  latestMessage: Message | null;
};

export const messageService = {
  // Get metadata only (counts, no data) - for lazy pagination
  getMetadata: async (filters?: Record<string, string>, limit = PAGINATION.DEFAULT_LIMIT) => {
    const params = new URLSearchParams({
      ...filters,
      limit: limit.toString(),
    });

    const response = await apiClient.get<MetadataResponse>(
      `/api/messages/metadata?${params.toString()}`
    );
    return response.data;
  },

  // Get grouped message threads
  getThreads: async (
    filters?: Record<string, string>,
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortOrder?: 'asc' | 'desc'
  ) => {
    const params = new URLSearchParams({
      ...filters,
      page: page.toString(),
      limit: limit.toString(),
    });

    if (sortOrder) {
      params.append('sortOrder', sortOrder);
    }

    const response = await apiClient.get<PaginatedResponse<MessageThread[]>>(
      `/api/messages/threads?${params.toString()}`
    );
    return response.data;
  },

  getAll: async (
    filters?: Record<string, string>,
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortOrder?: 'asc' | 'desc'
  ) => {
    const params = new URLSearchParams({
      ...filters,
      page: page.toString(),
      limit: limit.toString(),
    });

    if (sortOrder) {
      params.append('sortOrder', sortOrder);
    }

    const response = await apiClient.get<PaginatedResponse<Message[]>>(
      `/api/messages?${params.toString()}`
    );
    return response.data;
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Message>>(`/api/messages/${id}`);
    return response.data;
  },

  markAsProcessed: async (id: number, ticketId?: number) => {
    const response = await apiClient.post<ApiResponse<Message>>(
      `/api/messages/${id}/process`,
      ticketId ? { ticketId } : {}
    );
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

  reply: async (id: number, content: string, resolve = true) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reply`, {
      content,
      resolve,
    });
    return response.data;
  },

  replyWithAttachments: async (id: number, content: string, files: File[], resolve = true) => {
    const formData = new FormData();
    formData.append('content', content);
    formData.append('resolve', String(resolve));

    files.forEach((file) => {
      formData.append('attachments', file);
    });

    const response = await apiClient.post<ApiResponse<void>>(
      `/api/messages/${id}/reply`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
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

  getThreadMessages: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Message[]>>(`/api/messages/${id}/thread`);
    return response.data;
  },

  getSimilarResolvedMessages: async (id: number, limit = 5, minSimilarity = 0.7) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      minSimilarity: minSimilarity.toString(),
    });
    const response = await apiClient.get<
      ApiResponse<
        Array<{
          messageId?: number;
          content: string;
          subject?: string | null;
          sender?: string;
          directReply: string;
          similarity: number;
          repliedAt?: string | null;
          repliedBy?: number | null;
          source: 'documentation' | 'message';
          documentationId?: number;
          documentTitle?: string;
          chunkId?: number;
          chunkIndex?: number;
          chunkMetadata?: { extractedText?: string; page?: number };
          references?: Array<{
            chunkId: number;
            chunkIndex: number;
            metadata: unknown;
          }>;
        }>
      >
    >(`/api/messages/${id}/similar-resolved?${params.toString()}`);
    return response.data;
  },

  getSuggestedAnswer: async (id: number) => {
    const response = await apiClient.get<
      ApiResponse<{
        mode: 'ai-generated' | 'search-results';
        aiResponse?: {
          text: string;
          confidence: number;
          provider: string;
        };
        sources: Array<{
          type: 'documentation' | 'ticket' | 'message';
          id: number;
          title?: string;
          content: string;
          answer?: string;
          similarity: number;
          metadata?: Record<string, unknown>;
        }>;
        searchPerformed: {
          documentation: boolean;
          tickets: boolean;
          messages: boolean;
        };
      }>
    >(`/api/messages/${id}/suggested-answer`);
    return response.data;
  },

  reanalyze: async (id: number) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/analyze`, {});
    return response.data;
  },

  saveSuggestedAnswer: async (
    id: number,
    suggestedAnswer: {
      answer: string;
      similarity?: number;
      source?: string;
      documentTitle?: string;
    }
  ) => {
    const response = await apiClient.post<ApiResponse<void>>(
      `/api/messages/${id}/suggested-answer/save`,
      { suggestedAnswer }
    );
    return response.data;
  },

  getKBReferences: async (id: number) => {
    const response = await apiClient.get<
      ApiResponse<
        Array<{
          id: number;
          type: 'qa_pair' | 'document' | 'manual_entry';
          title: string;
          content: string;
          qualityScore: number | null;
          approved: boolean;
          timesReferenced: number;
          lastReferencedAt: string | null;
          topics: string[] | null;
          category: string | null;
          typeData: unknown;
          createdAt: string;
        }>
      >
    >(`/api/messages/${id}/kb-references`);
    return response.data;
  },

  checkContradiction: async (id: number) => {
    const response = await apiClient.post<
      ApiResponse<{
        triggeredBy: 'manual_request';
        claimToVerify: string;
        checkedAt: string;
        result: {
          hasContradiction: boolean;
          contradictingMessageId?: number;
          contradictingMessageDate?: string;
          originalStatement?: string;
          currentStatement?: string;
          confidence: 'high' | 'medium' | 'low';
          explanation?: string;
        };
        tokenUsage?: number;
        costEstimate?: number;
      }>
    >(`/api/messages/${id}/check-contradiction`, {});
    return response.data;
  },
};
