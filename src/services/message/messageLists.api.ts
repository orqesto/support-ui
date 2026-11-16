/** The messages API's list and read endpoints (split out of message.service.ts, F5). */
import { fetchThreadBoard, fetchThreads, type ThreadBoardRequest } from '../threadsQuery';
import {
  normaliseThreadNewEvents,
  normaliseThreadPage,
  threadPageQuery,
  type ThreadPageRequest,
} from '../threadPage';
import { apiClient } from '@/lib/api-client';
import { PAGINATION } from '@/lib/constants';
import { postOrGet } from '@/services/searchPost';
import type { MessageEvent, ApiResponse } from '@/types';
import type { MessageListItem, MessageDetail } from '@/types/api';
import type {
  ContactsResponse,
  MessageContactSubject,
  MessageSourceOption,
  MetadataResponse,
  PaginatedResponse,
  RawThreadsBody,
  ThreadBoardAnswer,
  ThreadsResponse,
} from './message.types';
import { ListTimedOutError, readThreadsBody } from './threadsReading';

// Strip undefined/null values so URLSearchParams never sends "?status=undefined"
const cleanFilters = (filters?: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(filters ?? {}).filter(([, val]) => val !== null && val !== undefined)
  );

export const messageListsApi = {
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
    sortOrder?: 'asc' | 'desc',
    sortBy:
      | 'time'
      | 'priority'
      | 'sla'
      | 'priority_sla'
      | 'last_client_reply'
      | 'last_our_reply' = 'time',
    /** `allowTimedOut`: the thread list only — it shows the "took too long" notice itself. */
    options?: { signal?: AbortSignal; allowTimedOut?: boolean }
  ): Promise<ThreadsResponse> => {
    const response = await fetchThreads<RawThreadsBody>({
      filters: cleanFilters(filters),
      page,
      limit,
      sortOrder,
      sortBy,
      signal: options?.signal,
    });
    return readThreadsBody(response, options?.allowTimedOut === true);
  },

  /**
   * The whole kanban board in one request (`POST /threads/board`): each column's pages and each
   * count, read exactly as `getThreads` reads one list. `null` from a backend without the route —
   * read the board one search per column then. An entry that failed, or did not finish in time,
   * is `null`: the board keeps what it shows for it, as when its own request failed.
   */
  getThreadBoard: async (request: ThreadBoardRequest): Promise<ThreadBoardAnswer | null> => {
    const clean = {
      filters: cleanFilters(request.filters),
      columns: request.columns.map((col) => ({ ...col, filters: cleanFilters(col.filters) })),
      counts: request.counts.map((count) => ({ ...count, filters: cleanFilters(count.filters) })),
    };
    const response = await fetchThreadBoard<{
      columns: Record<string, RawThreadsBody[] | null>;
      counts: Record<string, Pick<RawThreadsBody, 'pagination' | 'scope'> | null>;
    }>(clean);
    if (response === null) return null;
    const settle = <T>(read: () => T): T | null => {
      try {
        return read();
      } catch (err) {
        if (err instanceof ListTimedOutError) return null;
        throw err;
      }
    };
    const columns: ThreadBoardAnswer['columns'] = {};
    for (const col of request.columns) {
      const pages = response.columns?.[col.id];
      const read = pages?.map((page) => settle(() => readThreadsBody(page, false)));
      columns[col.id] = read?.every((page): page is ThreadsResponse => page !== null) ? read : null;
    }
    const counts: ThreadBoardAnswer['counts'] = {};
    for (const count of request.counts) {
      const answer = response.counts?.[count.id];
      counts[count.id] =
        answer && answer.pagination?.countTimedOut !== true
          ? { pagination: answer.pagination, scope: answer.scope ?? null }
          : null;
    }
    return { columns, counts };
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

    // The filters, a typed search among them, in a POST body (searchPost.ts).
    return postOrGet<PaginatedResponse<MessageListItem[]>>(
      'messages',
      () =>
        apiClient.post<PaginatedResponse<MessageListItem[]>>(
          '/api/messages/search',
          Object.fromEntries(params),
          { readOnly: true }
        ),
      () =>
        apiClient.get<PaginatedResponse<MessageListItem[]>>(`/api/messages?${params.toString()}`)
    );
  },

  // Accepts numeric `id` OR publicId (`SUP-42`). The BE's resolveConvIdFromParam
  // does the dual-resolve; the FE just passes whatever the URL has so shared
  // links of either shape work without a parse-and-narrow at the call site.
  //
  // `kind` is an optional disambiguator for the numeric-id case. KB-detail links
  // generate URLs from `messageEvents.id` (typeData.questionMessageId etc.); the
  // BE's getById resolves "conv first, fall back to event", so an event id that
  // numerically matches a different conv silently routes to the wrong conv —
  // same family as FE PR #28's bug. Pass `kind: 'event'` to skip the conv
  // lookup and resolve directly via message_events.
  getById: async (id: number | string, kind?: 'event') => {
    const query = kind ? `?kind=${kind}` : '';
    const response = await apiClient.get<ApiResponse<MessageDetail>>(`/api/messages/${id}${query}`);
    const detail = response.data.data;
    // Version skew: an older backend sends no `isSuspicious`, so anything but a boolean reads as
    // absent and the header falls back to the conversation's own category (isSuspiciousThread).
    const suspicious: unknown = (detail as { isSuspicious?: unknown } | undefined)?.isSuspicious;
    if (detail && typeof suspicious !== 'boolean') {
      return { ...response.data, data: { ...detail, isSuspicious: undefined } };
    }
    return response.data;
  },

  /**
   * The thread's events, latest page first. `page` always says what was left out, whichever
   * backend answered (threadPage.ts); pass `before: page.earliestId` for the older page.
   */
  getThreadMessages: async (id: number, page?: ThreadPageRequest) => {
    const response = await apiClient.get<ApiResponse<MessageEvent[]> & { page?: unknown }>(
      `/api/messages/${id}/thread${threadPageQuery(page)}`
    );
    const rows = response.data.data ?? [];
    return { ...response.data, page: normaliseThreadPage(response.data.page, rows) };
  },

  /**
   * The events saved after `afterEventId` (a live message on an open thread). `incremental: false`
   * means the backend ignored the parameter and `data` is the latest window of `limit` events —
   * use it as a plain read. See normaliseThreadNewEvents.
   */
  getThreadMessagesAfter: async (id: number, afterEventId: number, limit: number) => {
    const response = await apiClient.get<ApiResponse<MessageEvent[]> & { page?: unknown }>(
      `/api/messages/${id}/thread${threadPageQuery({ afterEventId, limit })}`
    );
    const rows = response.data.data ?? [];
    return {
      data: rows,
      page: normaliseThreadPage(response.data.page, rows),
      newEvents: normaliseThreadNewEvents(response.data),
    };
  },

  getLinkedTicket: async (id: number) => {
    const response = await apiClient.get<ApiResponse<{ id: number; status: string } | null>>(
      `/api/messages/${id}/linked-ticket`
    );
    return response.data;
  },

  getContacts: async (
    filters?: Record<string, string>,
    page = 1,
    limit = 50
  ): Promise<ContactsResponse> => {
    const params = new URLSearchParams({
      ...cleanFilters(filters),
      page: page.toString(),
      limit: limit.toString(),
    });
    // The filters, a typed search among them, in a POST body (searchPost.ts).
    const data = await postOrGet<ContactsResponse>(
      'contacts',
      () =>
        apiClient.post<ContactsResponse>(
          '/api/messages/contacts/search',
          Object.fromEntries(params),
          { readOnly: true }
        ),
      () => apiClient.get<ContactsResponse>(`/api/messages/contacts?${params.toString()}`)
    );
    const response = { data };
    // Version skew: a backend without the note summary sends neither field.
    const rows = response.data.data;
    if (Array.isArray(rows)) {
      response.data.data = rows.map((row) => ({
        ...row,
        noteCount: row.noteCount ?? 0,
        latestNote: row.latestNote ?? null,
      }));
    }
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

  // Compact source list for list filters (VIEW_MESSAGES-scoped, unlike /api/integrations).
  getMessageSourcesForFilter: async (): Promise<MessageSourceOption[]> => {
    const response = await apiClient.get<{ success: boolean; data: MessageSourceOption[] }>(
      '/api/messages/sources'
    );
    return response.data.data;
  },
};
