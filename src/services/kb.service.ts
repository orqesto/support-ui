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
  /**
   * WHO approved, and WHEN (BE #373). On an approved entry `approvedBy: null` means the
   * entry cleared the auto-approve score and NO PERSON EVER LOOKED AT IT.
   *
   * Optional because the backend that sends them ships separately from this app: until it
   * is deployed the keys are ABSENT, which is not the same as `null`. Absent means "we
   * cannot tell"; null means "auto-approved". Rendering absent as auto-approved would be
   * asserting something the API never said. Read them through `approvalProvenance`.
   */
  approvedBy?: number | null;
  approvedAt?: string | null;
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

/**
 * 'unreviewed' — approved by score alone; nobody vetted it.
 * 'reviewed'   — a person approved it (`approvedBy` carries their user id).
 * 'pending'    — not approved.
 * 'unknown'    — the backend did not send the fields (pre-#373 deployment). Say nothing
 *                rather than guess: an approved entry looks identical either way.
 */
export type ApprovalProvenance = 'reviewed' | 'unreviewed' | 'pending' | 'unknown';

export const approvalProvenance = (entry: {
  approved: boolean;
  approvedBy?: number | null;
}): ApprovalProvenance => {
  if (!entry.approved) return 'pending';
  // `in` rather than a truthiness check: `approvedBy: null` is a real answer from the API
  // and must not collapse into the same branch as a missing key.
  if (!('approvedBy' in entry) || entry.approvedBy === undefined) return 'unknown';
  return entry.approvedBy === null ? 'unreviewed' : 'reviewed';
};

export const kbService = {
  getAll: async (params?: {
    type?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    messageSourceId?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.set('type', params.type);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.messageSourceId)
      queryParams.set('messageSourceId', params.messageSourceId.toString());

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

  /**
   * Re-mine an existing channel's already-ingested history for Q&A pairs.
   *
   * Fire-and-forget on the server: it returns 200 the moment the work is *scheduled*, so a
   * success here means "accepted", never "finished" or even "will succeed". Progress shows
   * up via the KB progress endpoints; the caller should say "started", not "done".
   *
   * Only re-reads history the channel already pulled — it does not fetch older mail from
   * the provider, and it only considers conversations before the source's `kbMarkedAt`
   * cutoff (spec §2a / Addendum A.8). So this is for picking up extraction improvements on
   * existing data, not for importing more of it.
   */
  reprocessSource: async (messageSourceId: number) => {
    const response = await apiClient.post<ApiResponse<{ messageSourceId: number }>>(
      '/api/knowledge-base/process-source',
      { messageSourceId }
    );
    return response.data;
  },
};
