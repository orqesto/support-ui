import { create } from 'zustand';
import type { User } from '@/types';
import { onOrganizationSwitch } from './identityScope';

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
    if (!state.lastFetch) {
      return true;
    }
    return Date.now() - state.lastFetch > CACHE_TTL;
  },
}));

// One global slot, not a keyed cache: evict on an org switch rather than paint the previous
// workspace's users under the new one's context while the refetch is in flight.
onOrganizationSwitch(() => useUsersStore.getState().clearCache());
