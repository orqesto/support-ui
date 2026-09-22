import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SIDEBAR_WIDTH = 256;
export const SIDEBAR_RAIL_WIDTH = 64;

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
    {
      name: 'sidebar-collapsed',
      // Take only the flag from storage: a `width` left by a pre-release build is dropped.
      merge: (persisted, current) => ({
        ...current,
        collapsed: (persisted as Partial<SidebarState> | undefined)?.collapsed === true,
      }),
    }
  )
);

/** The sidebar's current on-screen width at desktop size. */
export const sidebarWidthPx = (state: Pick<SidebarState, 'collapsed'>) =>
  state.collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;
