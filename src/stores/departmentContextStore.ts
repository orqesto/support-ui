import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';

type DepartmentContextState = {
  // Keyed by "{userId}:{orgId}" so org-switch and user-switch both auto-reset
  _selectedByKey: Record<string, number[]>;

  // Derived helpers — call these in components / interceptors
  getSelectedDeptIds: () => number[];
  setSelected: (ids: number[]) => void;
  clear: () => void;

  // Internal key builder
  _key: () => string | null;
};

export const useDepartmentContextStore = create<DepartmentContextState>()(
  persist(
    (set, get) => ({
      _selectedByKey: {},

      _key: () => {
        const { user, selectedOrganizationId } = useAuthStore.getState();
        if (!user || !selectedOrganizationId) return null;
        return `${user.id}:${selectedOrganizationId}`;
      },

      getSelectedDeptIds: () => {
        const key = get()._key();
        if (!key) return [];
        return get()._selectedByKey[key] ?? [];
      },

      setSelected: (ids: number[]) => {
        const key = get()._key();
        if (!key) return;
        set(state => ({
          _selectedByKey: { ...state._selectedByKey, [key]: ids },
        }));
      },

      clear: () => {
        const key = get()._key();
        if (!key) return;
        set(state => {
          const updated = { ...state._selectedByKey };
          delete updated[key];
          return { _selectedByKey: updated };
        });
      },
    }),
    {
      name: 'dept-context',
      // Only persist the selection map; derived state re-computes on mount
      partialize: state => ({ _selectedByKey: state._selectedByKey }),
    }
  )
);
