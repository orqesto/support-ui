import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaginationMeta } from '@/services/message.service';
import type { Message } from '@/types';

export type FilterState = {
  view?: 'all' | 'active' | 'suspicious' | 'not_analysed' | 'resolved'; // classification lens
  processed?: 'all' | 'open' | 'in_progress' | 'pending' | 'closed'; // workflow progress
  channel?: 'all' | 'email' | 'telegram' | 'slack';
  messageSourceId?: string; // 'all' or integration ID
  showSpam?: boolean;
  showSuspicious?: boolean; // Show only suspicious messages (needs review)
  excludeSpam?: boolean; // Filter out spam messages (show only legitimate)
  showNeedsInfo?: boolean;
  showWorthy?: boolean;
  hasAttachments?: boolean;
  isLead?: boolean;
  isQualifiedLead?: boolean;
  hasReplies?: boolean;
  hasTicket?: boolean;
  showFailed?: boolean;
  showKBOnly?: boolean; // Show only KB messages
  excludeKB?: boolean; // Filter out KB messages (show only support requests)
  awaitingCustomerResponse?: boolean;
  customerResponded?: boolean; // Show customer responses needing agent attention
  assigneeId?: string; // Filter by specific assignee ('all', 'unassigned', or user ID)
  search?: string;
  departmentRole?: 'all' | 'support' | 'sales' | 'billing' | 'general' | 'hr';
  needsHumanReview?: boolean; // Escalated messages that need human attention
  ageRange?: 'lt24h' | '1to7d' | '1to4w' | 'gt1mo';
  priority?: 'all' | 'low' | 'medium' | 'high' | 'critical';
  labelId?: string; // 'all' or label ID
};

export type SortingState = {
  sortOrder: 'asc' | 'desc';
};

type CacheEntry = {
  messages: Message[];
  pagination: PaginationMeta;
  timestamp: number;
};

type MessagesState = {
  cache: Record<string, CacheEntry>; // Cache per filter+page combination
  filters: FilterState;
  sorting: SortingState;
  currentPage: number; // Track current page

  getCached: (page: number) => { messages: Message[]; pagination: PaginationMeta } | null;
  setMessages: (messages: Message[], pagination: PaginationMeta) => void;
  setFilters: (filters: FilterState) => void;
  setSorting: (sorting: SortingState) => void;
  updateFilter: (key: keyof FilterState, value: FilterState[keyof FilterState]) => void;
  updatePrimaryFilter: (key: 'view' | 'channel' | 'messageSourceId', value: string) => void;
  updateSecondaryFilter: (key: keyof FilterState, value: FilterState[keyof FilterState]) => void;
  clearFilters: () => void;
  clearCache: () => void;
};

export const defaultFilters: FilterState = {
  view: 'active',
  processed: 'all',
  channel: 'all',
  messageSourceId: 'all',
  showSpam: false,
  showSuspicious: false,
  excludeSpam: false,
  showNeedsInfo: false,
  showWorthy: false,
  hasAttachments: false,
  isLead: false,
  isQualifiedLead: false,
  hasReplies: false,
  hasTicket: undefined,
  showFailed: false,
  showKBOnly: false,
  excludeKB: false, // KB messages now flow through normal processing
  awaitingCustomerResponse: false,
  customerResponded: false,
  assigneeId: 'all',
  departmentRole: 'all',
  needsHumanReview: false,
  ageRange: undefined,
  priority: 'all',
  labelId: 'all',
};

const getCacheKey = (filters: FilterState, sorting: SortingState, page: number): string =>
  JSON.stringify({ filters, sorting, page });

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

        if (!entry) {
          return null;
        }

        // Cache expired (older than 5 minutes)
        if (Date.now() - entry.timestamp > 5 * 60 * 1000) {
          return null;
        }

        return { messages: entry.messages, pagination: entry.pagination };
      },

      setMessages: (messages, pagination) => {
        const state = get();
        const cacheKey = getCacheKey(state.filters, state.sorting, pagination.page);

        set({
          cache: {
            ...state.cache,
            [cacheKey]: {
              messages,
              pagination,
              timestamp: Date.now(),
            },
          },
          currentPage: pagination.page,
        });
      },

      setFilters: (filters) => {
        const currentState = get();
        const newFilters = { ...currentState.filters, ...filters };
        set({ filters: newFilters, cache: {} }); // Merge with existing filters and clear cache
      },

      setSorting: (sorting) => {
        set({ sorting, cache: {} }); // Clear cache when sorting changes
      },

      updateFilter: (key, value) => {
        set((state) => ({
          filters: { ...state.filters, [key]: value },
          cache: {}, // Clear cache on filter change
        }));
      },

      // Update primary filter: Keep other primary filters, clear secondary filters
      updatePrimaryFilter: (key, value) => {
        set((state) => {
          const { view, channel, messageSourceId } = state.filters;

          return {
            filters: {
              view,
              channel,
              messageSourceId,
              [key]: value,
              processed: 'all',
              showSpam: false,
              showSuspicious: false,
              excludeSpam: false,
              showNeedsInfo: false,
              showWorthy: false,
              hasAttachments: false,
              isLead: false,
              isQualifiedLead: false,
              hasReplies: false,
              hasTicket: undefined,
              showFailed: false,
              showKBOnly: false,
              excludeKB: false,
              awaitingCustomerResponse: false,
              customerResponded: false,
              assigneeId: 'all',
              search: undefined,
              departmentRole: 'all',
              needsHumanReview: false,
              ageRange: undefined,
              priority: 'all',
              labelId: 'all',
            },
            cache: {},
          };
        });
      },

      // Update secondary filter: Keep all filters
      updateSecondaryFilter: (key, value) => {
        set((state) => ({
          filters: { ...state.filters, [key]: value },
          cache: {}, // Clear cache on filter change
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
