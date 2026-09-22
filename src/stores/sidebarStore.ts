import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SidebarState = {
  // Desktop-only: the mobile drawer always shows full labels.
  collapsed: boolean;
  toggle: () => void;
};

// One setting for every shell (app Layout, AdminShell, WorkspaceShell), so moving
// between the app and a console keeps the same width.
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    { name: 'sidebar-collapsed' }
  )
);
