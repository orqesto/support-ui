import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import type { Message, MessageEvent, ApiResponse, ThreadStatus, TicketPriority } from '@/types';

// Strip undefined/null values so URLSearchParams never sends "?status=undefined"
const cleanFilters = (filters?: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(filters ?? {}).filter(([, val]) => val !== null && val !== undefined));

export type MessageActivityEntry = {
  id: number;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
  userEmail: string | null;
  userId: number | null;
};

export type MessageNote = {
  id: number;
  messageId: number;
  userId: number | null;
  authorName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { id: number; firstName: string; lastName: string | null; email: string } | null;
};

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

export type MessageContact = {
  sender: string;
  messageCount: number;
  subjectCount: number;
  lastMessageAt: string;
  hasUnread: boolean;
  hasTicket: boolean;
  isLead: boolean;
};

export type MessageContactSubject = {
  normalizedSubject: string;
  displaySubject: string;
  messageCount: number;
  lastMessageAt: string;
  latestMessageId: number;
  isLead: boolean;
  hasTicket: boolean;
};

export type MessageThread = {
  threadId: string;
  messageCount: number;
  sender: string;
  channel: string;
  hasUnread: boolean;
  hasTicket: boolean;
  linkedTicketStatus: string | null;
  isResolved: boolean;
  isLead: boolean;
  lastReplyFromClient: boolean | null;
  lastMessageAt: Date;
  latestMessage: Message | null;
  latestIncomingMessage: Message | null;
};

export const messageService = {
  // Get metadata only (counts, no data) - for lazy pagination
  getMetadata: async (filters?: Record<string, string>, limit = PAGINATION.DEFAULT_LIMIT) => {
    const params = new URLSearchParams({
      ...cleanFilters(filters),
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
      ...cleanFilters(filters),
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
      ...cleanFilters(filters),
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

  reply: async (id: number, content: string, resolve = true, usedSuggestedAnswer = false, suggestedAnswerSource?: string) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reply`, {
      content,
      resolve,
      usedSuggestedAnswer,
      ...(suggestedAnswerSource && { suggestedAnswerSource }),
    });
    return response.data;
  },

  replyWithAttachments: async (id: number, content: string, files: File[], resolve = true, usedSuggestedAnswer = false, suggestedAnswerSource?: string) => {
    const formData = new FormData();
    formData.append('content', content);
    formData.append('resolve', String(resolve));
    formData.append('usedSuggestedAnswer', String(usedSuggestedAnswer));
    if (suggestedAnswerSource) formData.append('suggestedAnswerSource', suggestedAnswerSource);

    files.forEach((file) => {
      formData.append('attachments', file);
    });

    const response = await apiClient.post<ApiResponse<void>>(
      `/api/messages/${id}/reply`,
      formData
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

  classify: async (id: number, action: 'approve' | 'mark_suspicious' | 'move_to_spam') => {
    const response = await apiClient.patch<ApiResponse<void>>(`/api/messages/${id}/classify`, {
      action,
    });
    return response.data;
  },

  getThreadMessages: async (id: number) => {
    const response = await apiClient.get<ApiResponse<MessageEvent[]>>(`/api/messages/${id}/thread`);
    return response.data;
  },

  getLinkedTicket: async (id: number) => {
    const response = await apiClient.get<ApiResponse<{ id: number; status: string } | null>>(
      `/api/messages/${id}/linked-ticket`
    );
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
          parentDocId?: number;
          chunkIndex?: number;
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

  setStatus: async (id: number, status: ThreadStatus) => {
    const response = await apiClient.patch<ApiResponse<{ id: number; status: ThreadStatus }>>(
      `/api/messages/${id}/status`,
      { status }
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

  getContacts: async (filters?: Record<string, string>, page = 1, limit = 50) => {
    const params = new URLSearchParams({
      ...cleanFilters(filters),
      page: page.toString(),
      limit: limit.toString(),
    });
    const response = await apiClient.get<PaginatedResponse<MessageContact[]>>(
      `/api/messages/contacts?${params.toString()}`
    );
    return response.data;
  },

  getContactSubjects: async (sender: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams({ ...cleanFilters(filters), sender });
    const response = await apiClient.get<{ success: boolean; data: MessageContactSubject[] }>(
      `/api/messages/contacts/subjects?${params.toString()}`
    );
    return response.data;
  },

  getNeedsRoutingCount: async () => {
    const response = await apiClient.get<{ success: boolean; count: number }>(
      '/api/messages/needs-routing/count'
    );
    return response.data.count;
  },

  manualRoute: async (id: number, departmentId: number) => {
    await apiClient.patch(`/api/messages/${id}/manual-route`, { departmentId });
  },
};
