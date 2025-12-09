import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, DepartmentRole } from '@/types';

type AuthState = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  selectedOrganizationId: number | null; // Current organization context for admin
  selectedDepartmentRole: DepartmentRole | null; // Current department context for multi-department users
  login: (token: string, user: User) => void;
  logout: () => void;
  setSelectedOrganization: (organizationId: number) => void;
  setSelectedDepartment: (departmentRole: DepartmentRole) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      selectedOrganizationId: null,
      selectedDepartmentRole: null,

      login: (token: string, user: User) => {
        set({ token, user, isAuthenticated: true });
      },

      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          selectedOrganizationId: null,
          selectedDepartmentRole: null,
        });
      },

      setSelectedOrganization: (organizationId: number) => {
        set({ selectedOrganizationId: organizationId });
      },

      setSelectedDepartment: (departmentRole: DepartmentRole) => {
        set({ selectedDepartmentRole: departmentRole });
      },
    }),
    {
      name: 'auth-storage', // localStorage key
    }
  )
);
