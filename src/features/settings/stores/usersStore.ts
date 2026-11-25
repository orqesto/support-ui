import { create } from 'zustand';
import type { User } from '@/types';
import { onOrganizationSwitch } from '@/stores/identityScope';
import { onOwnPhotoChanged } from '@/lib/ownPhotoSignal';

type UsersState = {
  users: User[];
  /** The backend sent `isMentor` on the list's rows: it knows mentors (review 1.1.330 F4). */
  mentorSupported: boolean;
  searchQuery: string;
  lastFetch: number | null;

  /** `mentorSupported` left out (a row edit) keeps what the last fetch said. */
  setUsers: (users: User[], mentorSupported?: boolean) => void;
  setSearchQuery: (query: string) => void;
  clearCache: () => void;
  shouldRefetch: () => boolean;
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  mentorSupported: false,
  searchQuery: '',
  lastFetch: null,

  setUsers: (users, mentorSupported) => {
    set((state) => ({
      users,
      mentorSupported: mentorSupported ?? state.mentorSupported,
      lastFetch: Date.now(),
    }));
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  clearCache: () => {
    set({ users: [], mentorSupported: false, lastFetch: null });
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

// A changed own photo: drop cached pages so the next view carries the new key (ownPhotoSignal).
onOwnPhotoChanged(() => useUsersStore.getState().clearCache());
