import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const SIDEBAR_DEFAULT_WIDTH = 256;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_RAIL_WIDTH = 64;

const clampWidth = (width: number) =>
  Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));

type SidebarState = {
  // Desktop-only: the mobile drawer always shows full labels at its fixed width.
  collapsed: boolean;
  /** Expanded width in px, set by dragging the sidebar edge. */
  width: number;
  toggle: () => void;
  setWidth: (width: number) => void;
};

// One setting for every shell (app Layout, AdminShell, WorkspaceShell), so moving
// between the app and a console keeps the same width.
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      width: SIDEBAR_DEFAULT_WIDTH,
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      setWidth: (width) => set({ width: clampWidth(width) }),
    }),
    {
      name: 'sidebar-collapsed',
      // A hand-edited or older stored value must not produce a 0px or 2000px sidebar.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<SidebarState>;
        return {
          ...current,
          collapsed: stored.collapsed === true,
          width:
            typeof stored.width === 'number' && Number.isFinite(stored.width)
              ? clampWidth(stored.width)
              : SIDEBAR_DEFAULT_WIDTH,
        };
      },
    }
  )
);

/** The sidebar's current on-screen width at desktop size. */
export const sidebarWidthPx = (state: Pick<SidebarState, 'collapsed' | 'width'>) =>
  state.collapsed ? SIDEBAR_RAIL_WIDTH : state.width;
