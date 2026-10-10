import { apiClient } from '@/lib/api-client';

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

type QueueInfo = {
  queues: string[];
  count: number;
};

type CleanupResponse = {
  deletedRecords?: number;
  deletedFiles?: number;
  clearedKeys?: number;
};

/** One membership a global admin holds in a customer workspace — the invariant violation. */
export type StrayAdminMembership = {
  membershipId: number;
  userId: number;
  userEmail: string;
  organizationId: number;
  organizationName: string;
  active: boolean;
};

export type GlobalAdminMembershipCleanup = {
  memberships: StrayAdminMembership[];
  found: number;
  removed: number;
  applied: boolean;
  note?: string;
};

/** Why a KB document is rejected by the repair (BE `KbDocumentRetireReason`). */
export type KbDocumentRepairReason = 'unvalidated_extraction' | 'transaction_record';

/** `POST /api/system/repair-unvalidated-kb-documents` — the same shape for a check and an apply. */
export type KbDocumentRepairResult = {
  applied: boolean;
  organizationId: number;
  scanned: number;
  matched: Record<KbDocumentRepairReason, number>;
  rejected: Record<KbDocumentRepairReason, number>;
  /** The per-call limit stopped the run with matches still unread — not "that was all of them". */
  truncated: boolean;
  /** A write that failed stopped the run; the rows before it ARE rejected. */
  failed: { id: number | null; error: string } | null;
  samples: { id: number; title: string; reason: KbDocumentRepairReason; why: string }[];
};

/** `POST /api/system/repair-bounce-damage` — the same shape for a check and an apply. */
export type BounceRepairResult = {
  applied: boolean;
  organizationId: number;
  limit: number;
  /** Messages left on a merged-away conversation: shown nowhere, never decided. */
  stranded: {
    found: number;
    moved: number;
    /**
     * No conversation to move it to: its merged-away conversation was restored as its own ticket.
     * Absent from a backend before it (that one only moved).
     */
    restored?: number;
    /** Skipped: nothing could be done with them. */
    skipped?: number;
    /**
     * Messages a restore lands that were not among `found` (counted in `restored`):
     * found + landedBeyondList = moved + restored + skipped.
     */
    landedBeyondList?: number;
    /** Of those moved, the ones still owed a decision — queued for it. */
    queued: number;
    truncated: boolean;
    samples: { eventId: number; tombstoneId: number; survivorId: number | null }[];
  };
  /** Bounces stored before they were marked — they still counted as the customer replying. */
  marked?: { found: number; marked: number; recomputed: number; truncated: boolean };
  /** Open conversations whose requester is a mail system and whose every inbound message is a bounce. */
  bounceOnly: {
    found: number;
    refiled: number;
    truncated: boolean;
    samples: { id: number; publicId: string | null; subject: string | null }[];
  };
  /** Open mail-system conversations holding more than one customer — listed, never changed here. */
  fused: {
    found: number;
    truncated: boolean;
    conversations: {
      id: number;
      publicId: string | null;
      subject: string | null;
      correspondents: number;
      bounces: number;
    }[];
  };
  /** A step that failed stopped the run; what came before it IS done. */
  failed: { step: string; error: string } | null;
};

/** `POST /api/system/split-fused-conversation` — the plan on a check, what it did on an apply. */
export type FusedSplitResult = {
  applied: boolean;
  conversationId: number;
  splittable: boolean;
  keeps: { correspondent: string; messages: number } | null;
  moves: { correspondent: string; messages: number; startsAs: string }[];
  /** Messages nothing identifies the owner of — they stay on the original. */
  unattributedMessages: number;
  /** Customer messages that had been filed as OUR reply, put back as the customer's. */
  retyped?: { eventId: number; correspondent: string; via: string }[];
  createdConversationIds?: number[];
};

/** What the captured-question repair does to one KB entry (BE contract, 2026-10-07). */
export type KbQuestionTextAction = 'clean' | 'unchanged' | 'uncertain' | 'reject';
export const KB_QUESTION_TEXT_ACTIONS: readonly KbQuestionTextAction[] = [
  'reject',
  'uncertain',
  'clean',
  'unchanged',
];

export type KbQuestionTextTotals = {
  organizationId: number | null;
  organizationName: string | null;
  checked: number;
  cleaned: number;
  unchanged: number;
  uncertain: number;
  rejected: number;
  aiRewritten: number;
  rawEmailBefore: number;
  rawEmailAfter: number;
  /** Rows whose write failed or that changed since they were read — counted in `checked` only. */
  failed: number;
  /** …of `unchanged`: left as a person edited them, or with no original to clean from. */
  keptAsEdited: number;
};

export type KbQuestionTextRow = {
  id: number;
  organizationId: number | null;
  kind: 'automatic' | 'captured' | null;
  approved: boolean;
  action: KbQuestionTextAction;
  reasons: string[];
  before: { question: string; answer: string };
  after: { question: string; answer: string };
  aiQuestion: string | null;
  aiFallbackReason: string | null;
};

/** `POST /api/system/repair-kb-question-text` — normalised (see `normalizeKbQuestionText`). */
export type KbQuestionTextResult = {
  dryRun: boolean;
  organizationId: number | null;
  totals: KbQuestionTextTotals[];
  rows: KbQuestionTextRow[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    /** The server's time budget stopped the run before the end of the scope. */
    truncated: boolean;
    /** Dry run: unused (always null). */
    nextOffset: number | null;
    /** Apply: pass as `cursor` to continue where this call stopped. Null at the end. */
    nextCursor: string | null;
  } | null;
  aiAvailable: boolean;
  /** Dry run: the AI question tried on the first few rows that can take one, whatever the filter. */
  aiSamples: KbQuestionTextRow[];
  /** The run stopped on an error after the totals it reports. */
  error: string | null;
};

export type KbQuestionTextRequest = {
  organizationId: number | null;
  dryRun: boolean;
  offset?: number;
  limit?: number;
  /** Dry run: how many rows try the AI question (0 = none; the server defaults to 10). */
  aiSample?: number;
  /** Apply: resume after this point (`pagination.nextCursor` of the previous call). */
  cursor?: string;
  /**
   * Not in the 2026-10-07 contract yet: a backend that ignores it returns every action, and the
   * section then filters the page itself and says so.
   */
  action?: KbQuestionTextAction;
};

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const numOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const text = (value: unknown): { question: string; answer: string } =>
  isObj(value)
    ? { question: str(value.question), answer: str(value.answer) }
    : { question: '', answer: '' };
const isAction = (value: unknown): value is KbQuestionTextAction =>
  typeof value === 'string' && (KB_QUESTION_TEXT_ACTIONS as readonly string[]).includes(value);

/** A row whose action this build does not know is dropped rather than shown under a wrong badge. */
const toRows = (value: unknown): KbQuestionTextRow[] =>
  Array.isArray(value)
    ? value.filter(isObj).flatMap((entry): KbQuestionTextRow[] => {
        const id = numOrNull(entry.id);
        if (id === null || !isAction(entry.action)) return [];
        return [
          {
            id,
            organizationId: numOrNull(entry.organizationId),
            kind: entry.kind === 'automatic' || entry.kind === 'captured' ? entry.kind : null,
            approved: entry.approved === true,
            action: entry.action,
            reasons: Array.isArray(entry.reasons)
              ? entry.reasons.filter((reason): reason is string => typeof reason === 'string')
              : [],
            before: text(entry.before),
            after: text(entry.after),
            aiQuestion: strOrNull(entry.aiQuestion),
            aiFallbackReason: strOrNull(entry.aiFallbackReason),
          },
        ];
      })
    : [];

/**
 * The backend is built in parallel with this screen and can reach production after it — every
 * field is read defensively, so a missing or oddly-shaped one renders as nothing, never a crash.
 * A row whose action this build does not know is dropped rather than shown under a wrong badge.
 */
export const normalizeKbQuestionText = (raw: unknown): KbQuestionTextResult | null => {
  if (!isObj(raw)) return null;
  const totals = Array.isArray(raw.totals)
    ? raw.totals.filter(isObj).map((entry) => ({
        organizationId: numOrNull(entry.organizationId),
        organizationName: strOrNull(entry.organizationName),
        checked: num(entry.checked),
        cleaned: num(entry.cleaned),
        unchanged: num(entry.unchanged),
        uncertain: num(entry.uncertain),
        rejected: num(entry.rejected),
        aiRewritten: num(entry.aiRewritten),
        rawEmailBefore: num(entry.rawEmailBefore),
        rawEmailAfter: num(entry.rawEmailAfter),
        failed: num(entry.failed),
        keptAsEdited: num(entry.keptAsEdited),
      }))
    : [];
  const rows = toRows(raw.rows);
  const page = isObj(raw.pagination) ? raw.pagination : null;
  return {
    // Only an explicit `true` marks a dry run; an apply answer without the field is an apply.
    dryRun: raw.dryRun === true,
    organizationId: numOrNull(raw.organizationId),
    totals,
    rows,
    pagination: page
      ? {
          offset: num(page.offset),
          limit: num(page.limit),
          total: num(page.total),
          truncated: page.truncated === true,
          nextOffset: numOrNull(page.nextOffset),
          nextCursor: strOrNull(page.nextCursor),
        }
      : null,
    aiAvailable: raw.aiAvailable === true,
    aiSamples: toRows(raw.aiSamples),
    error: strOrNull(raw.error),
  };
};

/** Where a KB mailbox's history read stands (BE `KbSweepState`). */
export type KbSweepState = 'swept' | 'in_progress' | 'not_started' | 'gmail_pending' | 'disabled';

export type KbSweepSource = {
  id: number;
  name: string | null;
  type: string;
  lastSweptAt: string | null;
  enabled: boolean;
  state: KbSweepState;
  inProgress: boolean;
};

/** `POST /api/system/request-kb-history-sweep`. */
export type KbHistorySweepResponse = {
  applied: boolean;
  organizationId: number;
  cleared: number;
  resweeps: number;
  restarted: number;
  notStarted: number;
  gmailInProgress: number;
  disabled: number;
  sources: KbSweepSource[];
};

const systemService = {
  /**
   * Global admins holding memberships in customer workspaces — the platform invariant that a
   * global admin belongs only to the internal system org. Read-only.
   */
  /**
   * KB documents filed without validation + transaction records, in the selected workspace.
   * ⛔ The check sends NO `apply` — the backend writes only on exactly `apply: true`.
   */
  checkKbDocumentRepair: async () => {
    const response = await apiClient.post<ApiResponse<KbDocumentRepairResult>>(
      '/api/system/repair-unvalidated-kb-documents',
      {}
    );
    return response.data;
  },

  /** Reject them (hidden + unapproved; the daily purge deletes them after 90 days). */
  applyKbDocumentRepair: async () => {
    const response = await apiClient.post<ApiResponse<KbDocumentRepairResult>>(
      '/api/system/repair-unvalidated-kb-documents',
      { apply: true }
    );
    return response.data;
  },

  /**
   * What bounces did to the selected workspace before they stopped changing threads.
   * ⛔ The check sends NO `apply` — the backend writes only on exactly `apply: true`.
   */
  checkBounceRepair: async () => {
    const response = await apiClient.post<ApiResponse<BounceRepairResult>>(
      '/api/system/repair-bounce-damage',
      {}
    );
    return response.data;
  },

  /** Move stranded messages to their thread and file back bounce-only conversations. */
  applyBounceRepair: async () => {
    const response = await apiClient.post<ApiResponse<BounceRepairResult>>(
      '/api/system/repair-bounce-damage',
      { apply: true }
    );
    return response.data;
  },

  /** How ONE fused conversation would be separated, per customer. Changes nothing. */
  checkFusedSplit: async (conversationId: number) => {
    const response = await apiClient.post<ApiResponse<FusedSplitResult>>(
      '/api/system/split-fused-conversation',
      { conversationId }
    );
    return response.data;
  },

  /** Separate it: each customer's messages move to a ticket of their own. */
  applyFusedSplit: async (conversationId: number) => {
    const response = await apiClient.post<ApiResponse<FusedSplitResult>>(
      '/api/system/split-fused-conversation',
      { conversationId, apply: true }
    );
    return response.data;
  },

  /** The workspace's KB mail sources and where each one's history read stands. Read-only. */
  listKbHistorySweep: async () => {
    const response = await apiClient.post<ApiResponse<KbHistorySweepResponse>>(
      '/api/system/request-kb-history-sweep',
      {}
    );
    return response.data;
  },

  /** Ask ONE KB mailbox to read its history again on its next check. */
  requestKbHistorySweep: async (messageSourceId: number) => {
    const response = await apiClient.post<ApiResponse<KbHistorySweepResponse>>(
      '/api/system/request-kb-history-sweep',
      { messageSourceId, apply: true }
    );
    return response.data;
  },

  /**
   * Clean captured KB questions. `dryRun: true` writes nothing; only the confirm sends
   * `dryRun: false`. `organizationId: null` = every workspace.
   */
  repairKbQuestionText: async (request: KbQuestionTextRequest) => {
    const response = await apiClient.post<ApiResponse<unknown>>(
      '/api/system/repair-kb-question-text',
      request
    );
    const body = response.data;
    return { ...body, data: normalizeKbQuestionText(body?.data) ?? undefined };
  },

  listGlobalAdminMemberships: async (organizationId?: number) => {
    const response = await apiClient.get<
      ApiResponse<{ memberships: StrayAdminMembership[]; total: number }>
    >('/api/system/global-admin-memberships', {
      ...(organizationId ? { params: { organizationId } } : {}),
    });
    return response.data;
  },

  /**
   * Remove them. ⛔ DRY-RUN unless `apply` is true — the backend requires exactly boolean
   * true, and this deletes rows across organisations.
   */
  cleanupGlobalAdminMemberships: async (apply: boolean, organizationId?: number) => {
    const response = await apiClient.post<ApiResponse<GlobalAdminMembershipCleanup>>(
      '/api/system/cleanup-global-admin-memberships',
      { apply, ...(organizationId ? { organizationId } : {}) }
    );
    return response.data;
  },

  /**
   * Stop all processing queues
   */
  stopQueues: async () => {
    const response = await apiClient.post<ApiResponse<QueueInfo>>('/api/system/stop-queues');
    return response.data;
  },

  /**
   * Resume all processing queues.
   *
   * The undo for stopQueues. BullMQ persists the paused flag in Redis, so a
   * stopped queue stays stopped across restarts and releases — without this the
   * Stop control is a one-way door that only redis-cli on the host can reopen.
   */
  startQueues: async () => {
    const response = await apiClient.post<ApiResponse<QueueInfo>>('/api/system/start-queues');
    return response.data;
  },

  /**
   * Clear all Redis queues
   */
  clearQueues: async () => {
    const response = await apiClient.delete<ApiResponse<CleanupResponse>>('/api/system/queues');
    return response.data;
  },

  /**
   * Delete all messages for current organization (optionally filtered by department)
   */
  deleteAllMessages: async (departmentSlug?: string) => {
    const params = departmentSlug ? { departmentSlug } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/messages', { params });
    return response.data;
  },

  /**
   * Delete all tickets for current organization (optionally filtered by department)
   */
  deleteAllTickets: async (departmentSlug?: string) => {
    const params = departmentSlug ? { departmentSlug } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/tickets', { params });
    return response.data;
  },

  /**
   * Delete all KB entries for current organization (optionally filtered by department)
   */
  deleteAllKB: async (departmentSlug?: string) => {
    const params = departmentSlug ? { departmentSlug } : {};
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/knowledge-base', {
      params,
    });
    return response.data;
  },

  /**
   * Delete all attachments for current organization
   */
  deleteAllAttachments: async () => {
    const response =
      await apiClient.delete<ApiResponse<CleanupResponse>>('/api/system/attachments');
    return response.data;
  },

  /**
   * Nuclear cleanup - delete EVERYTHING for current organization
   * Requires confirmation string "DELETE EVERYTHING"
   */
  nuclearCleanup: async (confirmation: string) => {
    const response = await apiClient.delete<ApiResponse<null>>('/api/system/nuclear', {
      data: { confirmation },
    });
    return response.data;
  },

  cleanupSpamLog: async (days = 90) => {
    const response = await apiClient.delete<ApiResponse<{ deletedCount: number }>>(
      '/api/spam-logs/cleanup',
      { params: { days } }
    );
    return response.data;
  },
};

export default systemService;
