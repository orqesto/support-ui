/* eslint-disable no-console */
import { create } from 'zustand';
import type { PaginationMeta } from '@/services/message.service';
import type { Message } from '@/types';

export type FilterState = {
  processed?: 'all' | 'unprocessed' | 'processed' | 'resolved';
  channel?: 'all' | 'email' | 'telegram' | 'slack';
  messageSourceId?: string; // 'all' or integration ID
  showSpam?: boolean;
  excludeSpam?: boolean; // Filter out spam messages (show only legitimate)
  showNeedsInfo?: boolean;
  showWorthy?: boolean;
  hasAttachments?: boolean;
  hasReplies?: boolean;
  hasTicket?: boolean;
  showFailed?: boolean;
  awaitingCustomerResponse?: boolean;
  search?: string;
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
  updatePrimaryFilter: (key: 'processed' | 'channel' | 'messageSourceId', value: string) => void;
  updateSecondaryFilter: (key: keyof FilterState, value: FilterState[keyof FilterState]) => void;
  clearFilters: () => void;
  clearCache: () => void;
};

const defaultFilters: FilterState = {
  processed: 'all',
  channel: 'all',
  messageSourceId: 'all',
  showSpam: false,
  excludeSpam: false,
  showNeedsInfo: false,
  showWorthy: false,
  hasAttachments: false,
  hasReplies: false,
  hasTicket: undefined,
  showFailed: false,
  awaitingCustomerResponse: false,
};

const getCacheKey = (filters: FilterState, sorting: SortingState, page: number): string =>
  JSON.stringify({ filters, sorting, page });

export const useMessagesStore = create<MessagesState>((set, get) => ({
  cache: {},
  filters: defaultFilters,
  sorting: { sortOrder: 'desc' },
  currentPage: 1,

  getCached: (page: number) => {
    const state = get();
    const cacheKey = getCacheKey(state.filters, state.sorting, page);
    const entry = state.cache[cacheKey];

    if (!entry) {
      console.log(`❌ Cache MISS for page ${page}:`, state.filters);
      return null;
    }

    // Cache expired (older than 5 minutes)
    if (Date.now() - entry.timestamp > 5 * 60 * 1000) {
      console.log(`⏰ Cache EXPIRED for page ${page}`);
      return null;
    }

    console.log(`✅ Cache HIT for page ${page}:`, state.filters);
    return { messages: entry.messages, pagination: entry.pagination };
  },

  setMessages: (messages, pagination) => {
    const state = get();
    const cacheKey = getCacheKey(state.filters, state.sorting, pagination.page);

    console.log(`💾 Caching page ${pagination.page}:`, {
      filters: state.filters,
      total: pagination.total,
      cacheKey: cacheKey.substring(0, 100) + '...',
    });

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
    console.log('🔄 Messages sorting updated:', sorting);
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
      const { processed, channel, messageSourceId } = state.filters;

      console.log(`🔵 Primary filter changed: ${key} = ${value}`);
      console.log('   Keeping: processed, channel, messageSourceId');
      console.log('   Clearing: all secondary filters');

      return {
        filters: {
          // Keep all primary filters
          processed,
          channel,
          messageSourceId,
          // Update the changed one
          [key]: value,
          // Clear all secondary filters
          showSpam: false,
          excludeSpam: false,
          showNeedsInfo: false,
          showWorthy: false,
          hasAttachments: false,
          hasReplies: false,
          hasTicket: undefined,
          showFailed: false,
          awaitingCustomerResponse: false,
          search: undefined,
        },
        cache: {}, // Clear cache on filter change
      };
    });
  },

  // Update secondary filter: Keep all filters
  updateSecondaryFilter: (key, value) => {
    set((state) => {
      console.log(`🟢 Secondary filter changed: ${key} = ${value}`);
      console.log('   Keeping: all filters');

      return {
        filters: { ...state.filters, [key]: value },
        cache: {}, // Clear cache on filter change
      };
    });
  },

  clearFilters: () => {
    set({ filters: defaultFilters });
  },

  clearCache: () => {
    set({ cache: {} });
  },
}));
