/* eslint-disable no-console */
import { create } from 'zustand';
import type { Ticket } from '@/types';

type TicketFilters = {
  status: string;
  priority: string;
  categoryId: string;
  search?: string;
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

const getCacheKey = (filters: TicketFilters, sorting: TicketSorting, page: number): string =>
  JSON.stringify({ filters, sorting, page });

export const useTicketsStore = create<TicketsState>((set, get) => ({
  filters: {
    status: 'all',
    priority: 'all',
    categoryId: 'all',
  },
  sorting: {
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  cache: new Map(),

  setFilters: (filters) => {
    console.log('🔄 Tickets filters updated:', filters);
    set({ filters }); // Keep cache for other filter combinations
  },

  setSorting: (sorting) => {
    console.log('🔄 Tickets sorting updated:', sorting);
    set({ sorting, cache: new Map() }); // Clear cache when sorting changes
  },

  clearFilters: () => {
    console.log('🧹 Clearing tickets filters');
    set({
      filters: {
        status: 'all',
        priority: 'all',
        categoryId: 'all',
      },
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

    console.log(`💾 Cached tickets for page ${pagination.page}:`, filters);
    set({ cache: newCache });
  },

  getCached: (page) => {
    const { filters, sorting, cache } = get();
    const cacheKey = getCacheKey(filters, sorting, page);
    const cached = cache.get(cacheKey);

    if (!cached) {
      console.log(`❌ Cache MISS for page ${page}`);
      return null;
    }

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_TTL) {
      console.log(`⏰ Cache EXPIRED for page ${page} (${Math.round(age / 1000)}s old)`);
      return null;
    }

    console.log(`✅ Cache HIT for page ${page}:`, filters);
    return cached;
  },

  clearCache: () => {
    // eslint-disable-next-line no-console
    console.log('🧹 Clearing tickets cache');
    set({ cache: new Map() });
  },
}));
