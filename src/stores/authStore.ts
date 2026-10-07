import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { forceDisconnect } from '@/lib/socketManager';
import { similarResultsCache } from '@/components/messages/AiTabPanel';
import type { User } from '@/types';
import { logoutClearsProcessingPanels } from '@/stores/processingPanelStore';
import { pinTabWorkspace, readTabWorkspace, writeTabWorkspace } from '@/lib/tabWorkspace';

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
      // Per TAB, not per browser — see `lib/tabWorkspace.ts`. Deliberately NOT in `partialize`:
      // `auth-storage` is shared by every tab, which is what made all tabs follow the last pick.
      selectedOrganizationId: readTabWorkspace(),

      login: (token: string | null, user: User) => {
        set({ token, user, isAuthenticated: true });
      },

      logout: () => {
        // Every sign-out path comes through here (the menu, a 401, another tab's sign-out):
        // the next user must not inherit panels, closed runs or closed problems.
        logoutClearsProcessingPanels();
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
        // isAuthenticated and token intentionally excluded — derived from user presence on hydration
      }),
      // A blob written before the selection moved per tab still holds `selectedOrganizationId`;
      // the default shallow merge would let it overwrite this tab's own value on every load.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<AuthState>;
        const { selectedOrganizationId: _legacy, ...rest } = stored;
        return { ...current, ...rest };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = state.user !== null;
        }
      },
    }
  )
);

pinTabWorkspace(useAuthStore.getState().selectedOrganizationId);

// Mirror every change — the setter, logout, and direct `setState` alike — into this tab's slot.
useAuthStore.subscribe((state, prev) => {
  if (state.selectedOrganizationId !== prev.selectedOrganizationId) {
    writeTabWorkspace(state.selectedOrganizationId);
  }
});
