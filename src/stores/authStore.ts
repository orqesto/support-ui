import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { forceDisconnect } from '@/lib/socketManager';
import { similarResultsCache } from '@/components/messages/AiTabPanel';
import type { User } from '@/types';

type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  selectedOrganizationId: number | null;
  login: (token: string | null, user: User) => void;
  logout: () => void;
  setSelectedOrganization: (organizationId: number) => void;
  setUser: (user: User) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      selectedOrganizationId: null,

      login: (token: string | null, user: User) => {
        set({ token, user, isAuthenticated: true });
      },

      logout: () => {
        forceDisconnect();
        similarResultsCache.clear();
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          selectedOrganizationId: null,
        });
      },

      setSelectedOrganization: (organizationId: number) => {
        set({ selectedOrganizationId: organizationId });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Persist only non-sensitive identity fields. Role and organizationRole are
        // intentionally excluded — storing them in localStorage allows client-side tampering
        // that can bypass FE route guards. The BE re-validates roles on every request.
        user: state.user
          ? {
              id: state.user.id,
              email: state.user.email,
              firstName: state.user.firstName,
              organizationId: state.user.organizationId,
            }
          : null,
        selectedOrganizationId: state.selectedOrganizationId,
        // isAuthenticated and token intentionally excluded — derived from user presence on hydration
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = state.user !== null;
        }
      },
    }
  )
);
