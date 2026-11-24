/**
 * "Show advanced settings": numbers, patterns and engine knobs sit behind one switch so a workspace
 * admin sees the decisions a business owner makes (settings simplification, 2026-11-23). Nothing is
 * deleted or changed by hiding it; a link into a hidden section still opens it.
 *
 * The choice is remembered PER USER on this browser, and defaults to on only for a global admin.
 * Not for self-hosted: a self-hosted deployment's workspace admins should see the simpler screens.
 */
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useAuthStore } from '@/stores/authStore';
import { identityScope, onIdentitySwitch } from '@/stores/identityScope';

export const SHOW_ADVANCED_KEY = 'odly.settings.showAdvanced';

/**
 * The key is built at CALL time from the signed-in user: a `persist` name is fixed when the store
 * is created, before anyone is known. Signed out, nothing is read or written. Blocked storage keeps
 * the choice in memory until reload.
 */
const perUserStorage: StateStorage = {
  getItem: (name) => {
    const { user } = identityScope();
    if (user === null) return null;
    try {
      return window.localStorage.getItem(`${name}:u${user}`);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    const { user } = identityScope();
    if (user === null) return;
    try {
      window.localStorage.setItem(`${name}:u${user}`, value);
    } catch {
      // Blocked storage: the choice lasts until reload.
    }
  },
  removeItem: (name) => {
    const { user } = identityScope();
    if (user === null) return;
    try {
      window.localStorage.removeItem(`${name}:u${user}`);
    } catch {
      // nothing to do
    }
  },
};

type AdvancedState = { show: boolean | null; setShow: (next: boolean) => void };

export const useAdvancedStore = create<AdvancedState>()(
  persist(
    (set) => ({
      show: null,
      setShow: (next) => set({ show: next }),
    }),
    {
      name: SHOW_ADVANCED_KEY,
      version: 1,
      storage: createJSONStorage(() => perUserStorage),
      partialize: (state) => ({ show: state.show }),
      // The default merge keeps the CURRENT state when nothing is stored, so a user who never
      // chose would inherit the previous user's choice. `null` = never chosen.
      merge: (persisted, current) => ({
        ...current,
        show: (persisted as { show?: boolean | null } | undefined)?.show ?? null,
      }),
    }
  )
);

onIdentitySwitch(() => {
  void useAdvancedStore.persist.rehydrate();
});

export const useShowAdvanced = (): [boolean, (next: boolean) => void] => {
  const show = useAdvancedStore((state) => state.show);
  const setShow = useAdvancedStore((state) => state.setShow);
  const isGlobalAdmin = useAuthStore((state) => state.user?.role === 'admin');
  return [show ?? isGlobalAdmin, setShow];
};

/** The sections to show: all with Advanced on; otherwise the plain ones plus the one a link asked for. */
export const visibleSections = <T extends { id: string; advanced?: boolean }>(
  all: T[],
  show: boolean,
  requested?: string
): T[] => (show ? all : all.filter((section) => !section.advanced || section.id === requested));

/** `preferred` when it is visible, else the first visible section, else null (nothing to show). */
export const firstVisibleId = <T extends { id: string }>(
  visible: T[],
  preferred: string
): string | null =>
  visible.some((section) => section.id === preferred) ? preferred : (visible[0]?.id ?? null);
