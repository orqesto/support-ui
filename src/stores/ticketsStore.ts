import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ticket, TicketStatus, TicketPriority } from '@/types';

type TicketFilters = {
  status: TicketStatus | 'all';
  priority: TicketPriority | 'all';
  categoryId: string;
  messageSourceId?: string;
  assigneeId?: string;
  labelId?: string;
  search?: string;
  linked?: 'all' | 'synced_to_jira' | 'not_synced';
};

type TicketSorting = {
  sortBy: 'createdAt' | 'updatedAt' | 'priority';
  sortOrder: 'asc' | 'desc';
};

type CacheEntry = {
  tickets: Ticket[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  timestamp: number;
  filters: TicketFilters;
  sorting: TicketSorting;
};

type TicketsState = {
  filters: TicketFilters;
  sorting: TicketSorting;
  cache: Map<string, CacheEntry>;
  setFilters: (filters: TicketFilters) => void;
  setSorting: (sorting: TicketSorting) => void;
  clearFilters: () => void;
  setTickets: (tickets: Ticket[], pagination: CacheEntry['pagination']) => void;
  getCached: (page: number) => CacheEntry | null;
  clearCache: () => void;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const defaultFilters: TicketFilters = {
  status: 'all',
  priority: 'all',
  categoryId: 'all',
  messageSourceId: 'all',
  assigneeId: 'all',
  linked: 'all',
};

const defaultSorting: TicketSorting = {
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

const getCacheKey = (filters: TicketFilters, sorting: TicketSorting, page: number): string =>
  JSON.stringify({ filters, sorting, page });

export const useTicketsStore = create<TicketsState>()(
  persist(
    (set, get) => ({
      filters: defaultFilters,
      sorting: defaultSorting,
      cache: new Map(),

      setFilters: (filters) => {
        set({ filters, cache: new Map() });
      },

      setSorting: (sorting) => {
        set({ sorting, cache: new Map() }); // Clear cache when sorting changes
      },

      clearFilters: () => {
        set({
          filters: defaultFilters,
          // Keep cache - just changing back to "all" filters
        });
      },

      setTickets: (tickets, pagination) => {
        const { filters, sorting, cache } = get();
        const cacheKey = getCacheKey(filters, sorting, pagination.page);

        const newCache = new Map(cache);
        newCache.set(cacheKey, {
          tickets,
          pagination,
          timestamp: Date.now(),
          filters,
          sorting,
        });

        set({ cache: newCache });
      },

      getCached: (page) => {
        const { filters, sorting, cache } = get();
        const cacheKey = getCacheKey(filters, sorting, page);
        const cached = cache.get(cacheKey);

        if (!cached) {
          return null;
        }

        const age = Date.now() - cached.timestamp;
        if (age > CACHE_TTL) {
          return null;
        }

        return cached;
      },

      clearCache: () => {
        set({ cache: new Map() });
      },
    }),
    {
      name: 'tickets-filters',
      partialize: (state) => ({ filters: state.filters, sorting: state.sorting }),
    }
  )
);
