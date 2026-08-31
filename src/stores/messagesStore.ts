import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDepartmentContextStore } from './departmentContextStore';
import type { PaginationMeta, MessageThread, ListScope } from '@/services/message.service';

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
/**
 * ⚠️ ONE list, because there were two and they had to agree.
 *
 * `useMessagesUrlSync` kept its own `VALID_QUEUES` allowlist. A value in the type but not
 * in that array survives being set and is then wiped by the next URL sync — the filter
 * applies, the list changes, and a beat later it resets to "all" on its own. Deriving the
 * type from the array is what makes adding a queue a one-line change that cannot half-land.
 *
 * `outbound_echo` is the odd member: not a queue anyone works, but the ONLY lens that
 * reaches our own sent mail with no inbound parent. Those rows match no kanban column and
 * no other queue, so without it the scope notice could count them and offer nowhere to go.
 */
export const QUEUE_FILTERS = [
  'all',
  'not_analysed',
  'archived',
  'suspicious',
  'spam',
  'needs_routing',
  'outbound_echo',
] as const;

export type QueueFilter = (typeof QUEUE_FILTERS)[number];

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
  /**
   * Explicit arrival window, as ISO instants — the range the four `ageRange` buckets
   * cannot express. The two are alternatives, not layers: setting one clears the other,
   * so exactly one notion of "received" is ever in play.
   */
  receivedFrom?: string;
  receivedTo?: string;
  departmentId?: string;
  status?: MessageViewStatus;
  threadStatus?: ThreadStatusFilter;
  /** LIST-view single lifecycle filter. Kanban keeps using status/threadStatus. */
  lifecycle?: LifecycleFilter;
  /** LIST-view non-lifecycle classification filter. Mutually exclusive with lifecycle. */
  queue?: QueueFilter;
  /**
   * A kanban column selected as a one-click filter in list view.
   *
   * Holds the COLUMN ID rather than a copy of its predicate, so the list applies the very
   * `fixedFilters` object the board applies. The two views cannot then disagree about what
   * "Spam" or "Not Analysed" contains — which they would within a release if the chip row
   * carried its own mapping table.
   *
   * Takes precedence over `lifecycle`/`queue`/`status` while set; 'all' means no column.
   */
  columnId?: string;
  /** Per-user read/unread filter (triage queues). 'all' = no filter. */
  read?: 'all' | 'read' | 'unread';
  /**
   * One priority or several, comma-separated (`high,critical`) — the API turns a list
   * into an `IN (…)`. Typed as a plain string rather than the four-value union because
   * a CSV of them is no longer one of the four; `'all'` is still how it spells "off",
   * and a single value still reads `high`, so every existing caller is unaffected.
   */
  priority?: string;
  assigneeId?: string;
  aiState?: AiStateFilter;
  /** One label id or several, comma-separated. Same CSV contract as `priority`. */
  labelId?: string;
  /**
   * Which filters are inverted, comma-separated (`lifecycle,aiState`) — "everything
   * except Resolved". Only `lifecycle`, `queue` and `aiState` can be negated; the API
   * ignores any other name, and so does the UI.
   *
   * A modifier, not a filter: it changes what an existing filter means and counts for
   * nothing on its own. An entry whose filter is unset is inert.
   */
  negate?: string;
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
  /**
   * What the lens is hiding, or `null` for "no information". Deliberately NOT defaulted
   * to a zeroed object: "we could not tell you" and "nothing is hidden" are different
   * claims, and collapsing them re-creates the silence this exists to break.
   */
  listScope: ListScope | null;
  timestamp: number;
};

type MessagesState = {
  cache: Record<string, CacheEntry>;
  filters: FilterState;
  sorting: SortingState;
  currentPage: number;

  /**
   * What the lens is hiding on the page currently shown, or `null` for "no information".
   * Deliberately NOT defaulted to a zeroed object: "we could not tell you" and "nothing
   * is hidden" are different claims, and collapsing them re-creates the silence this
   * whole feature exists to break.
   */
  listScope: ListScope | null;

  /**
   * Both take the key as a STRING, computed by the caller with `messagesCacheKey`.
   *
   * ⛔ They used to derive it themselves from `get().filters` — which is the store's state
   * NOW, not the state the request was built from. When filters changed while a request
   * was in flight, the response was filed under the wrong key: the kanban's list query
   * (which deliberately strips `queue`) returned 16 rows and they were stored under a key
   * claiming `queue=outbound_echo`. Every later reader of that key was then handed rows
   * that answered a different question.
   *
   * The caller snapshots the filters it builds the request from and derives the key from
   * that snapshot, so an entry is always labelled with what was actually asked.
   */
  getCached: (cacheKey: string) => {
    threads: MessageThread[];
    pagination: PaginationMeta;
    listScope: ListScope | null;
  } | null;
  setMessages: (
    threads: MessageThread[],
    pagination: PaginationMeta,
    listScope: ListScope | null,
    cacheKey: string
  ) => void;
  /** Restore the notice for a page served from cache. */
  setListScope: (listScope: ListScope | null) => void;
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
  columnId: 'all',
  read: 'all',
  priority: 'all',
  assigneeId: 'all',
  aiState: 'all',
  labelId: 'all',
  linked: 'all',
  linkedTicketStatus: 'all',
  ageRange: 'all',
  receivedFrom: undefined,
  receivedTo: undefined,
  negate: '',
  search: undefined,
  slaBreached: false,
  slaAtRisk: false,
  hasAttachments: false,
};

export const messagesCacheKey = (
  filters: FilterState,
  sorting: SortingState,
  page: number,
  /**
   * ⚠️ Load-bearing, for the same reason `deptCtx` is.
   *
   * On the board, `useMessagesData` deliberately sends a DIFFERENT request than the
   * filters describe — it zeroes `lifecycle`, `queue`, `read` and `columnId`, because the
   * columns hard-set their own and the shared query only feeds the header count. Caching
   * that response under the UNMODIFIED filters poisons the entry: the board stored 16
   * `view=work_queue` rows under a key saying `queue=outbound_echo`, and the list view
   * then read them straight back.
   *
   * That is what made the scope notice say "10 outbound echoes" and land on 16 unrelated
   * threads. There was no second request to watch, which is what made it look like a
   * backend disagreement — the network was silent because the cache answered.
   */
  isKanban: boolean
): string => {
  // Include the checkbox-driven X-Department-Context selection in the key — otherwise
  // changing the DepartmentSwitcher selection short-circuits to a stale cached page
  // (filter dropdown unchanged → same key → cache hit → no re-fetch).
  const deptCtx = useDepartmentContextStore.getState().getSelectedDeptIds().join(',');
  return JSON.stringify({ filters, sorting, page, deptCtx, isKanban });
};

export const useMessagesStore = create<MessagesState>()(
  persist(
    (set, get) => ({
      cache: {},
      filters: defaultFilters,
      sorting: { sortBy: 'time', sortOrder: 'desc' },
      currentPage: 1,
      listScope: null,

      getCached: (cacheKey: string) => {
        const state = get();
        const entry = state.cache[cacheKey];

        if (!entry) return null;

        if (Date.now() - entry.timestamp > 5 * 60 * 1000) return null;

        return {
          threads: entry.threads,
          pagination: entry.pagination,
          // Older persisted entries predate this field; `?? null` keeps them readable
          // and, correctly, says "no information" rather than inventing a zero.
          listScope: entry.listScope ?? null,
        };
      },

      setMessages: (threads, pagination, listScope, cacheKey) => {
        const state = get();
        set({
          cache: {
            ...state.cache,
            [cacheKey]: { threads, pagination, listScope, timestamp: Date.now() },
          },
          currentPage: pagination.page,
          listScope,
        });
      },

      setListScope: (listScope) => set({ listScope }),

      setFilters: (filters) => {
        const currentState = get();
        // The scope describes the OLD lens, so it must go with the cache. Leaving a
        // stale count on screen while new rows load is a smaller version of the same lie.
        set({ filters: { ...currentState.filters, ...filters }, cache: {}, listScope: null });
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
