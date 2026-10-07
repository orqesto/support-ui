import { apiClient } from '@/lib/api-client';
import { isRouteAbsent } from '@/lib/apiError';

/**
 * What Unhide did. `unsupported`: the backend has no unhide route yet (an older deployment) —
 * the entry was NOT changed, and the caller must not quietly approve it instead (D5).
 * `approved`: the state the backend restored, when it says; null when it did not.
 */
export type KbUnhideResult =
  | { outcome: 'unhidden'; approved: boolean | null }
  | { outcome: 'unsupported' };

export type KBEntry = {
  id: number;
  type: 'qa_pair' | 'document' | 'manual_entry';
  title: string;
  content: string;
  category: string;
  departmentId: number | null;
  /**
   * The mailbox the entry was learned from; null = no mailbox (an uploaded document, a manual
   * entry). Such an entry's department is set by hand; a mailbox entry's is not (its mailbox's
   * departments decide where the AI uses it).
   * Optional: the list sends it, but the detail route of the deployed backend does not — absent
   * means "we cannot tell", never "no mailbox".
   */
  messageSourceId?: number | null;
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
  /**
   * A reviewer REJECTED it (KB capture review). A rejected entry is also `hidden`; this adds
   * the date the backend's daily purge counts 90 days from. Optional for the same reason as
   * `approvedBy`: absent on a backend that predates it.
   */
  rejectedAt?: string | null;
  rejectedBy?: number | null;
  usageCount: number;
  createdAt: string;
  publicId?: string | null;
  /**
   * KB consolidation (#873). A CASE row (the merged entry) has `capturedVia: 'consolidation'`.
   * A merged ORIGINAL has `consolidatedInto` = the case id and `consolidation.state 'merged'`;
   * a detached one (its thread moved to another mailbox) has `state 'detached'`. All optional:
   * absent on a backend that predates the feature.
   */
  capturedVia?: string | null;
  /**
   * Its source (the mailbox, or a deleted KB) was removed: kept for the record, never used by the
   * AI — whatever `approved` / `hidden` say. Sent by the list and the detail route (BE b3636e13).
   */
  sourceDeleted?: boolean;
  /** Case rows only: may THIS viewer unmerge it (and so hide / reject / delete it)? */
  canUnmerge?: boolean;
  consolidatedInto?: number | null;
  consolidation?: {
    state: 'merged' | 'detached';
    caseId: number;
    casePublicId: string | null;
    caseExists: boolean;
  } | null;
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

/** The KB cases report findings a list can be narrowed to (BE `KB_FINDINGS`). */
export type KbFinding = 'raw_email' | 'awaiting_review';
export const KB_FINDINGS: readonly KbFinding[] = ['raw_email', 'awaiting_review'];

/**
 * The list's `messageSourceId` for a source filter value (MessageSourceFilter): 'all' ⇒ none,
 * 'none' ⇒ the entries from no mailbox, anything else ⇒ that source's id.
 */
export const kbSourceParam = (value: string): number | 'none' | undefined => {
  if (value === 'all') return undefined;
  return value === 'none' ? 'none' : Number(value);
};

export type KbExportType = 'qa_pair' | 'document';
export type KbExportSize = { count: number; cap: number; truncated: boolean };

export const kbService = {
  getAll: async (params?: {
    type?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    /** A mailbox id, or 'none' for the entries that come from no mailbox. */
    messageSourceId?: number | 'none';
    /** Only the entries behind one finding of the KB cases report (needs `departmentId`). */
    finding?: KbFinding;
    departmentId?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.set('type', params.type);
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.search) queryParams.set('search', params.search);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.messageSourceId) queryParams.set('messageSourceId', String(params.messageSourceId));
    if (params?.finding && params.departmentId) {
      queryParams.set('finding', params.finding);
      queryParams.set('departmentId', params.departmentId.toString());
    }

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

  /** A reviewer's "no": hidden now, deleted by the backend 90 days later unless re-approved. */
  reject: async (id: number) => {
    const response = await apiClient.patch<
      ApiResponse<{ id: number; rejectedAt?: string; unmerged?: boolean; restored?: number }>
    >(`/api/knowledge-base/entries/${id}/reject`);
    return response.data;
  },

  hide: async (id: number) => {
    // On a CASE row this is an Unmerge and answers `{ unmerged: true, restored }`.
    const response = await apiClient.patch<
      ApiResponse<{ unmerged?: boolean; restored?: number } | null>
    >(`/api/knowledge-base/entries/${id}/hide`);
    return response.data;
  },

  /**
   * Show a hidden entry again WITHOUT approving it: the backend restores what hiding recorded
   * (approved stays approved, pending stays pending; hidden before that record existed ⇒ pending).
   */
  unhide: async (id: number): Promise<KbUnhideResult> => {
    try {
      const response = await apiClient.patch<ApiResponse<{ approved?: unknown } | null>>(
        `/api/knowledge-base/entries/${id}/unhide`
      );
      const approved = response.data?.data?.approved;
      return { outcome: 'unhidden', approved: typeof approved === 'boolean' ? approved : null };
    } catch (err) {
      if (isRouteAbsent(err)) return { outcome: 'unsupported' };
      throw err;
    }
  },

  /**
   * How many rows the CSV export holds for this type (the department comes with the request, as
   * for the list). Null when the backend has no export yet, or answers something unreadable —
   * never a guessed number.
   */
  getExportSize: async (type?: KbExportType): Promise<KbExportSize | null> => {
    try {
      const response = await apiClient.get<ApiResponse<Partial<KbExportSize> | null>>(
        '/api/knowledge-base/export.csv',
        { params: { count: 1, ...(type ? { type } : {}) } }
      );
      const data = response.data?.data;
      if (!data || typeof data.count !== 'number' || typeof data.cap !== 'number') return null;
      return { count: data.count, cap: data.cap, truncated: data.truncated === true };
    } catch (err) {
      if (isRouteAbsent(err)) return null;
      throw err;
    }
  },

  /** The CSV goes through the API client so it carries the same auth and department as the list. */
  downloadExport: async (type?: KbExportType): Promise<void> => {
    const response = await apiClient.get('/api/knowledge-base/export.csv', {
      params: type ? { type } : undefined,
      responseType: 'blob',
    });
    const url = URL.createObjectURL(response.data as Blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'knowledge-base.csv';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /**
   * For a Q&A entry send `question` + `answer`: they are what AI drafts read (`content` is only
   * the searchable copy, and a content edit that loses its "Question:"/"Answer:" parts is 400).
   */
  update: async (
    id: number,
    data: {
      title?: string;
      content?: string;
      category?: string;
      question?: string;
      answer?: string;
      /** Source-less entries only — refused on a mailbox entry (400). */
      departmentId?: number;
    }
  ) => {
    const response = await apiClient.patch<ApiResponse<KBEntry>>(
      `/api/knowledge-base/entries/${id}`,
      data
    );
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<
      ApiResponse<{ unmerged?: boolean; restored?: number } | null>
    >(`/api/knowledge-base/entries/${id}`);
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
    const response = await apiClient.post<
      // `paused`/`resumesAt`: today's KB token limit is spent — the mine starts after the reset.
      // Absent from an older backend.
      ApiResponse<{ messageSourceId: number; paused?: boolean; resumesAt?: string }>
    >('/api/knowledge-base/process-source', { messageSourceId });
    return response.data;
  },

  /**
   * What mining this source costs before it starts: conversations to mine, measured tokens per
   * conversation (null until measured), and days at the daily KB limit. 404 on an older
   * backend — callers treat any failure as "no forecast", never as zero.
   */
  getMiningForecast: async (messageSourceId: number) => {
    const response = await apiClient.get<ApiResponse<KbMiningForecast>>(
      `/api/knowledge-base/sources/${encodeURIComponent(String(messageSourceId))}/mining-forecast`
    );
    return response.data.data;
  },
};

export interface KbMiningForecast {
  /**
   * The source's own backlog: `noCutoff` (a mailbox without a KB cutoff mines nothing until one
   * is set) and `threadsInScope` (what a mine walks). Optional: absent from an older backend.
   */
  sources?: Array<{
    sourceId: number;
    name?: string;
    threadsInScope: number;
    threadsToMine: number;
    noCutoff: boolean;
  }>;
  /**
   * True: this workspace is STOPPED at its KB limit (mining pauses, resumes after the reset).
   * False: own key, limits only measured — nothing pauses. Always sent: the backend from before the
   * limits has no forecast route (404).
   */
  enforced: boolean;
  /**
   * True: this workspace's AI settings or (BE R15) the platform limit settings could not be read
   * — or (BE R17) a fresh read of them succeeded but disagreed with the cached answer the gate
   * acts on — so `enforced` is the gate's fallback answer and whether mining pauses at the limit
   * is unknown. Absent (older backend) ⇒ false.
   */
  enforcementLookupFailed?: boolean;
  /**
   * BE R17: the saved limit settings could not be read — `limit` and `daysAtLimit` are the
   * fallback default, not this workspace's saved limit. Absent from an older backend.
   */
  settingsLookupFailed?: boolean;
  threadsToMine: number;
  tokensPerThread: { value: number; threadsMeasured: number; windowDays: number } | null;
  estimatedTokens: number | null;
  daysAtLimit: number | null;
  limit: { limit: number; source: string };
  spentToday: number;
  /**
   * KB image checks are told apart only since the token-limit split. `coversWindow: false` ⇒ the
   * cost per conversation leaves out image checks before `firstRecordedAt`. Absent from an older
   * backend.
   */
  imageChecks?: { firstRecordedAt: string | null; coversWindow: boolean };
}
