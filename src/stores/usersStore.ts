import { create } from 'zustand';
import type { User } from '@/types';

type UsersState = {
  users: User[];
  searchQuery: string;
  lastFetch: number | null;
  
  setUsers: (users: User[]) => void;
  setSearchQuery: (query: string) => void;
  clearCache: () => void;
  shouldRefetch: () => boolean;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  searchQuery: '',
  lastFetch: null,

  setUsers: (users) => {
    set({ users, lastFetch: Date.now() });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  clearCache: () => {
    set({ users: [], lastFetch: null });
  },

  shouldRefetch: () => {
    const state = get();
    if (!state.lastFetch) return true;
    return Date.now() - state.lastFetch > CACHE_TTL;
  },
}));
