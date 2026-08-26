import { normaliseReceivedAtOptions, type ReceivedAtOption } from './receivedAtOption';
import { apiClient } from '@/lib/api-client';
import { getErrorStatus } from '@/lib/errorMessages';
import { PAGINATION } from '@/lib/constants';
import type { Message, MessageEvent, ApiResponse, ThreadStatus, TicketPriority } from '@/types';

/** One address this workspace has received mail at. See `getReceivedAddresses`. */
export type ReceivedAddressRow = {
  address: string;
  conversations: number;
  lastSeenAt: string | null;
  messageSourceIds: number[];
  /** This is the address a source is configured with. */
  configured: boolean;
  /** Declared on a source config as an alias of that mailbox. */
  declared: boolean;
  /** Attached to a source by either route — the set that drives direction detection. */
  attachedToSourceId: number | null;
};

/**
 * How much of the archive the answer rests on. `recipients` is only recorded from
 * the release that started writing it and the backfill for older mail is a manual
 * step, so a short list means either "few aliases" or "few rows carry the data".
 * Saying which is the difference between a useful answer and a misleading one.
 */
export type AddressCoverage = {
  conversations: number;
  withDeliveryAddress: number;
};

/**
 * An address seen as the SENDER of conversations, offered because delivery data may
 * not exist at all: `recipients` is written only from the release that introduced it
 * and the backfill needs host access. Most of these are customers — it is a ranked
 * prompt, never a claim of ownership.
 */
export type SenderCandidate = {
  address: string;
  conversations: number;
  lastSeenAt: string | null;
  /** Shares a local part with an address already owned. A hint for sorting, not a verdict. */
  likelyOurs: boolean;
};

export type ReceivedAddresses = {
  addresses: ReceivedAddressRow[];
  senderCandidates: SenderCandidate[];
  coverage: AddressCoverage;
};

import type { WhatsAppTemplate } from '@/components/messages/whatsappTemplates';
import type { MessageListItem, MessageDetail } from '@/types/api';

// Strip undefined/null values so URLSearchParams never sends "?status=undefined"
const cleanFilters = (filters?: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(filters ?? {}).filter(([, val]) => val !== null && val !== undefined));

// Compact message source for populating list filters (GET /api/messages/sources).
export type MessageSourceOption = {
  id: number;
  name: string;
  type: string;
  departmentId: number | null;
  enabled: boolean;
};

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

/**
 * What the current lens is hiding. `/api/messages/threads` only computes it when asked
 * (`scope=1`), because the same endpoint doubles as a counter — the dashboard fires ten
 * calls reading only `pagination.total`, and the board one per column.
 *
 * ⛔ `null` means NO INFORMATION — not requested, the aggregate failed, or a view it
 * cannot describe. It is NOT the same claim as `hidden: 0`, which means the list really
 * is everything. Render `null` as silence.
 *
 * ⚠️ `hiddenBecause` OVERLAPS and must never be summed: a resolved thread mined from the
 * knowledge base is counted under both `terminal` and `knowledgeBase`. On one real
 * workspace those two are 2,935 and 2,952 against 3,009 hidden rows.
 */
export type ListScope = {
  withoutLens: number;
  hidden: number;
  hiddenBecause: {
    terminal: number;
    spam: number;
    suspicious: number;
    notAnalysed: number;
    archived: number;
    knowledgeBase: number;
    awaitingOrReplied: number;
    needsRouting: number;
    other: number;
  };
};

export type ThreadsResponse = PaginatedResponse<MessageThread[]> & {
  scope?: ListScope | null;
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

/**
 * Who an outbound reply is addressed to.
 *
 * All three are optional and an empty list is never sent: the BE reads an absent
 * `to` as "the thread's requester and nobody else". Reply-all is something the
 * agent does on purpose — on a shared support inbox the accidental version
 * discloses the thread to whoever the customer happened to cc.
 */
export type ReplyRecipients = {
  to?: string[];
  cc?: string[];
  bcc?: string[];
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
  /** Per-user read state for the triage read/unread indicator (true = read).
   *  Optional for back-compat with list shapes/tests that omit it; the unread
   *  dot only shows on an explicit `false`. */
  isRead?: boolean;
  lastReplyFromClient: boolean | null;
  lastMessageAt: Date;
  latestMessage: Message | null;
  latestIncomingMessage: Message | null;
};

/**
 * The AI draft the agent started this reply from — sent with the send so the BE's
 * reply_style domain can learn house voice from what they CHANGED (Phase 1).
 *
 * `text` must be the draft EXACTLY as it landed in the composer (editor HTML, not
 * the plain text the compose endpoint returned): the BE compares it against the
 * sent body verbatim to decide `accept` vs `edit`, and that body is composer HTML.
 * Sending the plain form would mark every untouched draft as edited.
 */
export type AiDraft = { text: string; mode?: string; language?: string };

/** An agent's template choice. Positional parameters, matching Meta's {{1}}, {{2}}… */
export type WhatsAppTemplateSend = { templateId: number; parameters: string[] };

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
    sortOrder?: 'asc' | 'desc',
    sortBy:
      | 'time'
      | 'priority'
      | 'sla'
      | 'priority_sla'
      | 'last_client_reply'
      | 'last_our_reply' = 'time'
  ) => {
    const params = new URLSearchParams({
      ...cleanFilters(filters),
      page: page.toString(),
      limit: limit.toString(),
    });

    if (sortOrder) {
      params.append('sortOrder', sortOrder);
    }

    if (sortBy !== 'time') {
      params.append('sortBy', sortBy);
    }

    const response = await apiClient.get<ThreadsResponse>(
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

    const response = await apiClient.get<PaginatedResponse<MessageListItem[]>>(
      `/api/messages?${params.toString()}`
    );
    return response.data;
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

  reply: async (id: number, content: string, resolve = true, usedSuggestedAnswer = false, suggestedAnswerSource?: string, idempotencyKey?: string, aiDraft?: AiDraft, whatsappTemplate?: WhatsAppTemplateSend, recipients?: ReplyRecipients) => {
    const response = await apiClient.post<ApiResponse<void>>(`/api/messages/${id}/reply`, {
      // Omitted entirely for a template send: the server renders the body from the
      // approved template, and a body we invented here would not be what Meta delivers.
      ...(!whatsappTemplate && { content }),
      resolve,
      usedSuggestedAnswer,
      ...(suggestedAnswerSource && { suggestedAnswerSource }),
      ...(idempotencyKey && { idempotencyKey }),
      ...(aiDraft && { aiDraft }),
      ...(whatsappTemplate && { whatsappTemplate }),
      // Omitted entirely when the agent left the fields alone. The BE reads an
      // absent `to` as "the requester, nobody else" — sending `[]` would be a
      // different statement, and reply-all must stay an explicit act.
      ...(recipients?.to?.length && { to: recipients.to }),
      ...(recipients?.cc?.length && { cc: recipients.cc }),
      ...(recipients?.bcc?.length && { bcc: recipients.bcc }),
    });
    return response.data;
  },

  /**
   * Approved templates this conversation can be continued with.
   *
   * Returns [] rather than throwing when the endpoint is absent. The frontend deploys on
   * merge to `main` while the backend ships on its own cadence, so there is a window
   * where this route 404s in production — and during it the composer must simply not
   * offer templates, not break the thread view around them.
   */
  listWhatsAppTemplates: async (id: number): Promise<WhatsAppTemplate[]> => {
    try {
      const response = await apiClient.get<ApiResponse<WhatsAppTemplate[]>>(
        `/api/messages/${id}/whatsapp-templates`
      );
      return response.data.data ?? [];
    } catch {
      return [];
    }
  },

  replyWithAttachments: async (id: number, content: string, files: File[], resolve = true, usedSuggestedAnswer = false, suggestedAnswerSource?: string, idempotencyKey?: string, aiDraft?: AiDraft, recipients?: ReplyRecipients) => {
    const formData = new FormData();
    formData.append('content', content);
    formData.append('resolve', String(resolve));
    formData.append('usedSuggestedAnswer', String(usedSuggestedAnswer));
    if (suggestedAnswerSource) formData.append('suggestedAnswerSource', suggestedAnswerSource);
    if (idempotencyKey) formData.append('idempotencyKey', idempotencyKey);
    // multipart carries no JSON types — the BE preprocesses this field back from
    // a string, so the attachment path captures reply_style exactly like the
    // JSON path does.
    if (aiDraft) formData.append('aiDraft', JSON.stringify(aiDraft));
    // Same JSON-string trick as aiDraft: multipart carries no arrays, and the BE
    // preprocesses these fields back from a string on this path.
    if (recipients?.to?.length) formData.append('to', JSON.stringify(recipients.to));
    if (recipients?.cc?.length) formData.append('cc', JSON.stringify(recipients.cc));
    if (recipients?.bcc?.length) formData.append('bcc', JSON.stringify(recipients.bcc));

    files.forEach((file) => {
      formData.append('attachments', file);
    });

    const response = await apiClient.post<ApiResponse<void>>(
      `/api/messages/${id}/reply`,
      formData
    );
    return response.data;
  },

  /**
   * The addresses this workspace has actually received mail at, for the
   * "Received at" filter.
   *
   * Returns [] rather than throwing when the endpoint is absent. The frontend
   * deploys on merge while the backend ships on its own cadence, so this route
   * 404s in production during that window — and while it does, the filter must
   * simply not offer itself rather than break the filters bar around it.
   */
  getReceivedAtOptions: async (): Promise<ReceivedAtOption[]> => {
    try {
      // `detailed=1` is opt-in on the backend and an older one ignores it, answering
      // with the plain `string[]` it always did. `normaliseReceivedAtOptions` accepts
      // both — see the note there on why that is not optional.
      const response = await apiClient.get<ApiResponse<unknown>>(
        '/api/messages/received-at-options?detailed=1'
      );
      return normaliseReceivedAtOptions(response.data.data);
    } catch {
      return [];
    }
  },

  /**
   * Every address this workspace has taken delivery on, with provenance: how many
   * conversations, when it was last seen, and whether it is already attached to a
   * message source (as its configured address or a declared alias).
   *
   * 🔑 OBSERVED IS NOT OURS. A cc'd colleague or a supplier on a thread lands in
   * this list too. Adopting one as a mailbox alias tells direction detection that
   * mail FROM that person is our own outgoing — and outgoing mail with no
   * recoverable correspondent leaves the inbox entirely. So this reports and a
   * human adopts; the UI must never pre-select.
   *
   * Returns `null` — not an empty list — when the route is absent, so the caller
   * can say "this backend cannot answer yet" instead of "you receive on nothing".
   * The frontend deploys on merge while the backend ships on its own cadence, so
   * that window is real and the two states are not interchangeable here.
   */
  getReceivedAddresses: async (): Promise<ReceivedAddresses | null> => {
    try {
      const response = await apiClient.get<
        ApiResponse<ReceivedAddressRow[]> & {
          coverage?: Partial<AddressCoverage>;
          senderCandidates?: Partial<SenderCandidate>[];
        }
      >('/api/messages/received-addresses');
      const rows = response.data.data ?? [];
      const candidates = response.data.senderCandidates ?? [];
      // Normalised here rather than at the render site: a field this service does
      // not defend becomes a white screen the first time an older backend omits it.
      return {
        addresses: rows.map((row) => ({
          address: String(row.address ?? ''),
          conversations: Number(row.conversations ?? 0),
          lastSeenAt: row.lastSeenAt ?? null,
          messageSourceIds: Array.isArray(row.messageSourceIds) ? row.messageSourceIds : [],
          configured: row.configured === true,
          declared: row.declared === true,
          attachedToSourceId: row.attachedToSourceId ?? null,
        })).filter((row) => row.address.length > 0),
        // Absent on a backend that predates sender candidates — an empty list, not a
        // crash, so the panel simply offers one source instead of two.
        senderCandidates: candidates
          .map((row) => ({
            address: String(row.address ?? ''),
            conversations: Number(row.conversations ?? 0),
            lastSeenAt: row.lastSeenAt ?? null,
            likelyOurs: row.likelyOurs === true,
          }))
          .filter((row) => row.address.length > 0),
        coverage: {
          conversations: Number(response.data.coverage?.conversations ?? 0),
          withDeliveryAddress: Number(response.data.coverage?.withDeliveryAddress ?? 0),
        },
      };
    } catch (err) {
      // 404 is the ONE failure that means "this backend predates the route". The
      // endpoint takes no id, so a not-found cannot be a missing record — an older
      // deploy simply has nothing mounted here and falls through to
      // `GET /api/messages/:id`, which answers "Message not found".
      //
      // Everything else — 401, 403, a 500, a dropped connection — is a fault, and
      // returning null for it told the panel to say "this backend cannot suggest
      // addresses yet". That sentence is a claim about the DEPLOYMENT, and it read
      // identically whether the route was absent or the request had just failed,
      // so a transient error looked like a permanent capability gap.
      if (getErrorStatus(err) === 404) return null;
      throw err;
    }
  },

  // Compose a brand-new outbound email (#18). Creates a new conversation
  // and dispatches via the chosen integration's email channel. Attachments
  // are optional.
  composeNew: async (input: {
    messageSourceId: number;
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    content: string;
    attachments?: File[];
  }) => {
    const formData = new FormData();
    formData.append('messageSourceId', String(input.messageSourceId));
    formData.append('to', input.to);
    // JSON-encoded, like aiDraft on the reply path: multipart has no array type,
    // and multer would hand the BE a bare string for one address and an array for
    // two — a shape that changes with the input is a validation bug waiting to
    // happen. The BE preprocesses these back.
    if (input.cc?.length) formData.append('cc', JSON.stringify(input.cc));
    if (input.bcc?.length) formData.append('bcc', JSON.stringify(input.bcc));
    formData.append('subject', input.subject);
    formData.append('content', input.content);
    input.attachments?.forEach((file) => formData.append('attachments', file));

    const response = await apiClient.post<
      ApiResponse<{ conversationId: number; messageEventId: number }>
    >('/api/messages/compose', formData);
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

  classify: async (
    id: number,
    action: 'approve' | 'mark_suspicious' | 'move_to_spam',
    createDetectionRule?: boolean,
    // move_to_spam only: opt in to mint a learned spam rule from this message.
    trainSpamFilter?: boolean
  ) => {
    const response = await apiClient.patch<ApiResponse<void>>(`/api/messages/${id}/classify`, {
      action,
      ...(createDetectionRule ? { createDetectionRule: true } : {}),
      ...(trainSpamFilter ? { trainFilter: true } : {}),
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
          // 'knowledge_base' = a mined KB entry (qa_pair / manual_entry / document). Until
          // support-service#367 these could never be returned — the scope resolver read a
          // junction table nothing writes, so every source-linked entry fell out of scope.
          type: 'documentation' | 'ticket' | 'message' | 'knowledge_base';
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
          /** False when the short-query gate skipped the documentation search. */
          documentation: boolean;
          tickets: boolean;
          messages: boolean;
          /**
           * How the mined KB was consulted. 'org-wide-fallback' means the conversation's own
           * department had nothing, so the whole org was searched — results may come from a
           * department this agent doesn't serve. Optional: older backends omit it.
           */
          knowledgeBase?: 'scoped' | 'org-wide-fallback' | false;
        };
        // false when the org has no AI/LLM provider — the endpoint still returns
        // 200 with search-results so the FE can show the similar-message fallback.
        aiConfigured?: boolean;
      }>
    >(`/api/messages/${id}/suggested-answer`);
    return response.data;
  },

  /**
   * Agent-facing draft assistant. One endpoint, three modes:
   *   generate — KB-grounded draft
   *   guided   — KB-grounded draft that also conveys the agent's own facts
   *   polish   — rewrite the agent's rough draft into something sendable to a customer
   *
   * `text` is null when the KB had nothing usable and no draft could be written —
   * a normal outcome, not an error; the caller should fall back to the KB dialog.
   */
  composeReply: async (
    id: number,
    payload: { mode: 'generate' | 'guided' | 'polish'; instructions?: string; draft?: string }
  ) => {
    const response = await apiClient.post<
      ApiResponse<{
        mode: 'generate' | 'guided' | 'polish';
        text: string | null;
        language?: string;
        provider?: string;
        confidence?: number;
        /** false when a guided draft came from the agent's own facts, not the KB. */
        groundedInKb?: boolean;
        aiConfigured?: boolean;
      }>
    >(`/api/messages/${id}/compose-reply`, payload);
    return response.data;
  },

  /**
   * Translate arbitrary text (not a stored message) — used to show an AI draft in
   * the agent's own language before they send it. Drafts are written in the
   * CUSTOMER's language, so an agent who doesn't read it needs a way to check.
   */
  translateText: async (text: string, targetLanguage: string) => {
    const response = await apiClient.post<
      ApiResponse<{ translated: { content: string } }>
    >('/api/translation/text/translate', { text, targetLanguage });
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

  // Per-user read/unread state for the triage queues.
  markRead: async (id: number) => {
    const response = await apiClient.put<ApiResponse<{ conversationId: number; isRead: boolean }>>(
      `/api/messages/${id}/read`,
      {}
    );
    return response.data;
  },

  markUnread: async (id: number) => {
    const response = await apiClient.delete<
      ApiResponse<{ conversationId: number; isRead: boolean }>
    >(`/api/messages/${id}/read`);
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

  // Compact source list for list filters (VIEW_MESSAGES-scoped, unlike /api/integrations).
  getMessageSourcesForFilter: async (): Promise<MessageSourceOption[]> => {
    const response = await apiClient.get<{ success: boolean; data: MessageSourceOption[] }>(
      '/api/messages/sources'
    );
    return response.data.data;
  },

  // `learn` defaults to false: a manual route is a one-off correction and does NOT train
  // the router unless the agent explicitly opts in (BE gates learning/rule-creation on it).
  manualRoute: async (id: number, departmentId: number, learn = false) => {
    await apiClient.patch(`/api/messages/${id}/manual-route`, { departmentId, learn });
  },
};
