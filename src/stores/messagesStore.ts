import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDepartmentContextStore } from './departmentContextStore';
import type { PaginationMeta, MessageThread } from '@/services/message.service';

export type MessageViewStatus =
  | 'all'
  | 'active'
  | 'awaiting_response'
  | 'client_replied'
  | 'suspicious'
  | 'not_analysed'
  | 'spam'
  | 'resolved';

export type ThreadStatusFilter =
  | 'all'
  | 'open'
  | 'in_progress'
  | 'pending'
  | 'closed';

// LIST-view single lifecycle dropdown (replaces the old status/threadStatus pair
// in list mode). Mutually exclusive with `queue` in the FE.
export type LifecycleFilter =
  | 'all'
  // The dropdown has always SENT 'open' (unreviewed+replied fold into it) — the union
  // just never listed it, because the select casts its options through `as unknown`
  // and the mismatch had nowhere to surface.
  | 'open'
  | 'unreviewed'
  | 'in_progress'
  | 'awaiting'
  | 'replied'
  | 'pending'
  | 'resolved'
  | 'closed';

// LIST-view non-lifecycle classification dropdown. Mutually exclusive with
// `lifecycle` in the FE.
export type QueueFilter = 'all' | 'not_analysed' | 'archived' | 'suspicious' | 'spam' | 'needs_routing';

export type AiStateFilter =
  | 'all'
  | 'needs_review'
  | 'needs_info'
  | 'ai_suggested'
  | 'bot_handled'
  | 'lead'
  | 'contradiction';

export type LinkedFilter = 'all' | 'has_ticket' | 'has_jira';
export type LinkedTicketStatusFilter = 'all' | 'pending' | 'open' | 'in_progress' | 'resolved' | 'closed';

export type FilterState = {
  messageSourceId?: string;
  /**
   * Show only threads that arrived at this address of ours. Distinct from
   * messageSourceId: one source answers to several aliases, so the source
   * picker cannot separate them.
   */
  receivedAt?: string;
  /**
   * Age bucket — how long ago the thread arrived. Maps to the API's `ageRange`.
   *
   * Distinct from `receivedAt` above, which is an ADDRESS, not a time. The design
   * prototype used one name for both; the API has always had two params.
   */
  ageRange?: 'all' | 'lt24h' | '1to7d' | '1to4w' | 'gt1mo';
  departmentId?: string;
  status?: MessageViewStatus;
  threadStatus?: ThreadStatusFilter;
  /** LIST-view single lifecycle filter. Kanban keeps using status/threadStatus. */
  lifecycle?: LifecycleFilter;
  /** LIST-view non-lifecycle classification filter. Mutually exclusive with lifecycle. */
  queue?: QueueFilter;
  /** Per-user read/unread filter (triage queues). 'all' = no filter. */
  read?: 'all' | 'read' | 'unread';
  priority?: 'all' | 'low' | 'medium' | 'high' | 'critical';
  assigneeId?: string;
  aiState?: AiStateFilter;
  labelId?: string;
  linked?: LinkedFilter;
  linkedTicketStatus?: LinkedTicketStatusFilter;
  search?: string;
  /** SLA quick-filter pills. Independent toggles — both true = OR (show
   * breached or at-risk). Replaces the old mutually-exclusive `slaFilter`
   * enum so the two pills can light up together. */
  slaBreached?: boolean;
  slaAtRisk?: boolean;
  /** Quick-filter toggle: show only conversations that have at least one
   * attachment on any of their messages. Maps to the BE `hasAttachments` param. */
  hasAttachments?: boolean;
  /** Inbox toolbar checkbox: hide convs that are waiting on the customer so
   * the list shows only items needing agent attention. Session-only (no URL
   * sync, no localStorage). */
  excludeAwaitingResponse?: boolean;
};

export type SortingState = {
  sortBy: 'time' | 'priority' | 'sla' | 'priority_sla' | 'last_client_reply' | 'last_our_reply';
  sortOrder: 'asc' | 'desc';
};

type CacheEntry = {
  threads: MessageThread[];
  pagination: PaginationMeta;
  timestamp: number;
};

type MessagesState = {
  cache: Record<string, CacheEntry>;
  filters: FilterState;
  sorting: SortingState;
  currentPage: number;

  getCached: (page: number) => { threads: MessageThread[]; pagination: PaginationMeta } | null;
  setMessages: (threads: MessageThread[], pagination: PaginationMeta) => void;
  setFilters: (filters: FilterState) => void;
  setSorting: (sorting: SortingState) => void;
  updateFilter: (key: keyof FilterState, value: FilterState[keyof FilterState]) => void;
  clearFilters: () => void;
  clearCache: () => void;
};

export const defaultFilters: FilterState = {
  messageSourceId: 'all',
  departmentId: 'all',
  status: 'all',
  threadStatus: 'all',
  lifecycle: 'all',
  queue: 'all',
  read: 'all',
  priority: 'all',
  assigneeId: 'all',
  aiState: 'all',
  labelId: 'all',
  linked: 'all',
  linkedTicketStatus: 'all',
  ageRange: 'all',
  search: undefined,
  slaBreached: false,
  slaAtRisk: false,
  hasAttachments: false,
};

const getCacheKey = (filters: FilterState, sorting: SortingState, page: number): string => {
  // Include the checkbox-driven X-Department-Context selection in the key — otherwise
  // changing the DepartmentSwitcher selection short-circuits to a stale cached page
  // (filter dropdown unchanged → same key → cache hit → no re-fetch).
  const deptCtx = useDepartmentContextStore.getState().getSelectedDeptIds().join(',');
  return JSON.stringify({ filters, sorting, page, deptCtx });
};

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => ({
      cache: {},
      filters: defaultFilters,
      sorting: { sortBy: 'time', sortOrder: 'desc' },
      currentPage: 1,

      getCached: (page: number) => {
        const state = get();
        const cacheKey = getCacheKey(state.filters, state.sorting, page);
        const entry = state.cache[cacheKey];

        if (!entry) return null;

        if (Date.now() - entry.timestamp > 5 * 60 * 1000) return null;

        return { threads: entry.threads, pagination: entry.pagination };
      },

      setMessages: (threads, pagination) => {
        const state = get();
        const cacheKey = getCacheKey(state.filters, state.sorting, pagination.page);
        set({
          cache: {
            ...state.cache,
            [cacheKey]: { threads, pagination, timestamp: Date.now() },
          },
          currentPage: pagination.page,
        });
      },

      setFilters: (filters) => {
        const currentState = get();
        set({ filters: { ...currentState.filters, ...filters }, cache: {} });
      },

      setSorting: (sorting) => {
        set({ sorting, cache: {} });
      },

      updateFilter: (key, value) => {
        set((state) => ({
          filters: { ...state.filters, [key]: value },
          cache: {},
        }));
      },

      clearFilters: () => {
        set({ filters: defaultFilters });
      },

      clearCache: () => {
        set({ cache: {} });
      },
    }),
    {
      name: 'messages-filters',
      partialize: (state) => ({ filters: state.filters, sorting: state.sorting }),
    }
  )
);
