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
  departmentId?: string;
  status?: MessageViewStatus;
  threadStatus?: ThreadStatusFilter;
  priority?: 'all' | 'low' | 'medium' | 'high' | 'critical';
  assigneeId?: string;
  aiState?: AiStateFilter;
  labelId?: string;
  linked?: LinkedFilter;
  linkedTicketStatus?: LinkedTicketStatusFilter;
  search?: string;
  slaFilter?: 'all' | 'breached' | 'at_risk';
  /** Inbox toolbar checkbox: hide convs that are waiting on the customer so
   * the list shows only items needing agent attention. Session-only (no URL
   * sync, no localStorage). */
  excludeAwaitingResponse?: boolean;
};

export type SortingState = {
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
  priority: 'all',
  assigneeId: 'all',
  aiState: 'all',
  labelId: 'all',
  linked: 'all',
  linkedTicketStatus: 'all',
  search: undefined,
  slaFilter: 'all',
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
      sorting: { sortOrder: 'desc' },
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
