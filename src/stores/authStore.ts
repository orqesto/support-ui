import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  selectedOrganizationId: number | null; // Current organization context for admin
  login: (token: string, user: User) => void;
  logout: () => void;
  setSelectedOrganization: (organizationId: number) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      selectedOrganizationId: null,

      login: (token: string, user: User) => {
        set({ token, user, isAuthenticated: true });
      },

      logout: () => {
        set({ token: null, user: null, isAuthenticated: false, selectedOrganizationId: null });
      },

      setSelectedOrganization: (organizationId: number) => {
        set({ selectedOrganizationId: organizationId });
      },
    }),
    {
      name: 'auth-storage', // localStorage key
    }
  )
);
