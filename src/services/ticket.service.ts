import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import type {
  Ticket,
  CreateTicketRequest,
  UpdateTicketRequest,
  ApiResponse,
  TicketSearchMatch,
} from '@/types';
import type { TicketListItem, TicketDetail } from '@/types/api';
import type { TicketSortBy } from '@/stores/ticketsStore';
import { normalizeSearchReading, type SearchReading } from '@/services/message.service';

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

export type TicketsMetadata = {
  total: number;
  totalPages: number;
  limit: number;
  open: number;
  resolved: number;
  inProgress: number;
};

export type MetadataResponse = {
  success: boolean;
  data: TicketsMetadata;
};

const TICKET_MATCH_FIELDS: readonly TicketSearchMatch['field'][] = [
  'reference',
  'title',
  'people',
  'description',
  'note',
  'thread',
];

/** A ticket row's `searchMatch`: absent (an older backend), null (no search) or junk → null. */
export const normalizeTicketSearchMatch = (raw: unknown): TicketSearchMatch | null => {
  if (!raw || typeof raw !== 'object') return null;
  const match = raw as { field?: unknown; snippet?: unknown };
  if (!TICKET_MATCH_FIELDS.includes(match.field as TicketSearchMatch['field'])) return null;
  const field = match.field as TicketSearchMatch['field'];
  return typeof match.snippet === 'string' && match.snippet.trim() !== ''
    ? { field, snippet: match.snippet }
    : { field };
};

export const ticketService = {
  // Get metadata only (counts, no data) - for lazy pagination
  getMetadata: async (filters?: Record<string, string>, limit = PAGINATION.DEFAULT_LIMIT) => {
    const params = new URLSearchParams({
      ...Object.fromEntries(Object.entries(filters ?? {}).filter(([, val]) => val !== null && val !== undefined)),
      limit: limit.toString(),
    });

    const response = await apiClient.get<MetadataResponse>(
      `/api/tickets/metadata?${params.toString()}`
    );
    return response.data;
  },

  getAll: async (
    filters?: Record<string, string>,
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    sortBy?: TicketSortBy,
    sortOrder?: 'asc' | 'desc'
  ) => {
    const params = new URLSearchParams({
      ...Object.fromEntries(Object.entries(filters ?? {}).filter(([, val]) => val !== null && val !== undefined)),
      page: page.toString(),
      limit: limit.toString(),
    });

    if (sortBy) {
      params.append('sortBy', sortBy);
    }
    if (sortOrder) {
      params.append('sortOrder', sortOrder);
    }

    const response = await apiClient.get<
      PaginatedResponse<TicketListItem[]> & { search?: unknown }
    >(`/api/tickets?${params.toString()}`);
    // `search`: how a typed search was read (null when none; absent from an older backend).
    return {
      ...response.data,
      data: (response.data.data ?? []).map((ticket) => ({
        ...ticket,
        // Read off the raw row: a backend older than ticket search does not send it.
        searchMatch: normalizeTicketSearchMatch((ticket as { searchMatch?: unknown }).searchMatch),
      })),
      search: normalizeSearchReading(response.data.search),
    } as PaginatedResponse<TicketListItem[]> & { search: SearchReading | null };
  },

  getById: async (id: number) => {
    const response = await apiClient.get<ApiResponse<TicketDetail>>(`/api/tickets/${id}`);
    return response.data;
  },

  create: async (data: CreateTicketRequest) => {
    const response = await apiClient.post<ApiResponse<Ticket>>('/api/tickets', data);
    return response.data;
  },

  /**
   * Files for a ticket that exists (the route the ticket page's attachments use). Create sends
   * none: POST /api/tickets parses no multipart body — a create with files arrived with no
   * fields at all and was refused (staging 2026-10-21).
   */
  uploadAttachments: async (ticketId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    await apiClient.post(`/api/tickets/${ticketId}/attachments`, formData);
  },

  update: async (id: number, data: UpdateTicketRequest) => {
    const response = await apiClient.put<ApiResponse<Ticket>>(`/api/tickets/${id}`, data);
    return response.data;
  },

  pushToJira: async (id: number, integrationId?: number) => {
    const url = integrationId
      ? `/api/tickets/${id}/jira?integrationId=${integrationId}`
      : `/api/tickets/${id}/jira`;
    const response = await apiClient.post<ApiResponse<{ jiraKey: string; jiraUrl: string }>>(url);
    return response.data;
  },

  syncAllToJira: async (integrationId?: number) => {
    const url = integrationId
      ? `/api/tickets/sync/jira?integrationId=${integrationId}`
      : '/api/tickets/sync/jira';
    const response = await apiClient.post<
      ApiResponse<{
        synced: number;
        failed: number;
        total: number;
      }>
    >(url);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/api/tickets/${id}`);
    return response.data;
  },

  getSimilar: async (id: number, params?: { limit?: number; minSimilarity?: number }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.minSimilarity) {
      queryParams.append('minSimilarity', params.minSimilarity.toString());
    }

    const url = queryParams.toString()
      ? `/api/tickets/${id}/similar?${queryParams.toString()}`
      : `/api/tickets/${id}/similar`;

    const response = await apiClient.get<
      ApiResponse<
        Array<{
          ticketId: number;
          messageId: number;
          messageContent: string;
          messageSubject: string | null;
          similarity: number;
          ticketStatus: string;
          ticketTitle: string;
          responses: Array<{
            id: number;
            content: string;
            channel: string;
            sentAt: string | null;
          }>;
        }>
      >
    >(url);
    return response.data;
  },
};
