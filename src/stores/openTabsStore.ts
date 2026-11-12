import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  closeTab,
  keepTab,
  markTabNews,
  OPEN_TABS_STORAGE_NAME,
  redirectTab,
  sanitizeStoredTabs,
  showTab,
  type OpenTab,
  type OpenTabKind,
  type OpenTabTarget,
} from '@/lib/openTabs';
import {
  rehydrateOnWorkspaceSwitch,
  workspaceScopedStorage,
} from '@/stores/workspaceScopedStorage';

/*
  The open-tabs rows of Threads and Tickets (see lib/openTabs.ts for the rules). Saved per
  person and workspace, so the row comes back after a reload; which tab is ACTIVE is not saved:
  that is the page's URL.

  A click on a list row or card does not know yet which item the page will end up showing (the
  thread is fetched, a merged one redirects), so the row's intent travels as a short-lived
  request: Ctrl/⌘-click or a middle click asks for a new tab, a double-click asks to keep it.
  The page consumes the request when it shows the item (`show`).
*/

type PerKind<T> = Record<OpenTabKind, T>;
const perKind = <T>(make: () => T): PerKind<T> => ({ threads: make(), tickets: make() });

/** A request older than this was not for the item now being shown. */
const REQUEST_TTL_MS = 10_000;
const fresh = (at: number | null): boolean => at !== null && Date.now() - at <= REQUEST_TTL_MS;

type OpenTabsState = {
  tabs: PerKind<OpenTab[]>;
  active: PerKind<string | null>;
  newTabAskedAt: PerKind<number | null>;
  /** A double-click on a row: keep the tab of `key` when it is shown. */
  keepAsked: PerKind<{ key: string; at: number } | null>;
  /** A tab the agent picked in the row, waiting for the page to show its item. */
  activating: PerKind<{ key: string; at: number } | null>;
  requestNewTab: (kind: OpenTabKind) => void;
  /** A double-click on a list row or card for `key`: keep its tab (now, or once it is shown). */
  requestKeep: (kind: OpenTabKind, key: string) => void;
  /** The page shows `target`. Returns the tabs closed for room. */
  show: (
    kind: OpenTabKind,
    target: OpenTabTarget,
    hasDraft: (key: string) => boolean,
    forceNewTab?: boolean
  ) => OpenTab[];
  /** The page that showed `key` went away (unmount): nothing is active any more. */
  leave: (kind: OpenTabKind, key: string) => void;
  /** The page closed its item: a preview tab goes with it, kept tabs stay. */
  hide: (kind: OpenTabKind) => void;
  close: (kind: OpenTabKind, key: string) => OpenTab | null;
  closeOthers: (kind: OpenTabKind, key: string) => void;
  closeAll: (kind: OpenTabKind) => void;
  keep: (kind: OpenTabKind, key: string) => void;
  markNews: (kind: OpenTabKind, key: string) => void;
  startActivating: (kind: OpenTabKind, key: string) => void;
  /** The pending activation, if it is still fresh; cleared either way. */
  finishActivating: (kind: OpenTabKind) => { key: string } | null;
  redirect: (kind: OpenTabKind, fromKey: string, target: OpenTabTarget) => void;
  forget: (kind: OpenTabKind, key: string) => void;
};

export const useOpenTabsStore = create<OpenTabsState>()(
  persist(
    (set, get) => {
      const setTabs = (kind: OpenTabKind, tabs: OpenTab[]) =>
        set((state) => ({ tabs: { ...state.tabs, [kind]: tabs } }));
      const setActive = (kind: OpenTabKind, key: string | null) =>
        set((state) => ({ active: { ...state.active, [kind]: key } }));
      return {
        tabs: perKind<OpenTab[]>(() => []),
        active: perKind<string | null>(() => null),
        newTabAskedAt: perKind<number | null>(() => null),
        keepAsked: perKind<{ key: string; at: number } | null>(() => null),
        activating: perKind<{ key: string; at: number } | null>(() => null),
        requestNewTab: (kind) =>
          set((state) => ({ newTabAskedAt: { ...state.newTabAskedAt, [kind]: Date.now() } })),
        requestKeep: (kind, key) => {
          const state = get();
          // The first click of the double-click already showed it: keep it now. Otherwise it is
          // still loading (the thread on screen is the PREVIOUS one): keep it when it is shown.
          if (state.active[kind] === key) {
            setTabs(kind, keepTab(state.tabs[kind], key));
            return;
          }
          set((current) => ({
            keepAsked: { ...current.keepAsked, [kind]: { key, at: Date.now() } },
          }));
        },
        show: (kind, target, hasDraft, forceNewTab = false) => {
          const state = get();
          const { tabs, evicted } = showTab(state.tabs[kind], target, {
            now: Date.now(),
            activeKey: state.active[kind],
            newTab: forceNewTab || fresh(state.newTabAskedAt[kind]),
            keep:
              state.keepAsked[kind]?.key === target.key && fresh(state.keepAsked[kind]?.at ?? null),
            hasDraft,
          });
          set((current) => ({
            tabs: { ...current.tabs, [kind]: tabs },
            active: { ...current.active, [kind]: target.key },
            newTabAskedAt: { ...current.newTabAskedAt, [kind]: null },
            keepAsked: { ...current.keepAsked, [kind]: null },
          }));
          return evicted;
        },
        leave: (kind, key) => {
          if (get().active[kind] === key) setActive(kind, null);
        },
        hide: (kind) => {
          const state = get();
          const activeKey = state.active[kind];
          set((current) => ({
            tabs: {
              ...current.tabs,
              [kind]: state.tabs[kind].filter((tab) => !(tab.key === activeKey && tab.preview)),
            },
            active: { ...current.active, [kind]: null },
          }));
        },
        close: (kind, key) => {
          const state = get();
          const { tabs, next } = closeTab(state.tabs[kind], key, state.active[kind]);
          setTabs(kind, tabs);
          if (key === state.active[kind] && !next) setActive(kind, null);
          return next;
        },
        closeOthers: (kind, key) =>
          setTabs(
            kind,
            get().tabs[kind].filter((tab) => tab.key === key)
          ),
        closeAll: (kind) => {
          setTabs(kind, []);
          setActive(kind, null);
        },
        keep: (kind, key) => {
          const tabs = get().tabs[kind];
          const kept = keepTab(tabs, key);
          if (kept !== tabs) setTabs(kind, kept);
        },
        markNews: (kind, key) => {
          const state = get();
          const marked = markTabNews(state.tabs[kind], key, state.active[kind]);
          if (marked !== state.tabs[kind]) setTabs(kind, marked);
        },
        startActivating: (kind, key) =>
          set((state) => ({
            activating: { ...state.activating, [kind]: { key, at: Date.now() } },
          })),
        finishActivating: (kind) => {
          const pending = get().activating[kind];
          if (!pending) return null;
          set((state) => ({ activating: { ...state.activating, [kind]: null } }));
          return fresh(pending.at) ? { key: pending.key } : null;
        },
        redirect: (kind, fromKey, target) =>
          setTabs(kind, redirectTab(get().tabs[kind], fromKey, target, Date.now())),
        forget: (kind, key) =>
          setTabs(
            kind,
            get().tabs[kind].filter((tab) => tab.key !== key)
          ),
      };
    },
    {
      name: OPEN_TABS_STORAGE_NAME,
      version: 1,
      storage: workspaceScopedStorage<Pick<OpenTabsState, 'tabs'>>(),
      partialize: (state) => ({ tabs: state.tabs }),
      // Whatever was stored is checked, and nothing is active until the page shows something.
      merge: (persisted, current) => {
        const stored = (persisted as Partial<Pick<OpenTabsState, 'tabs'>> | undefined)?.tabs;
        const now = Date.now();
        return {
          ...current,
          tabs: {
            threads: sanitizeStoredTabs(stored?.threads, now),
            tickets: sanitizeStoredTabs(stored?.tickets, now),
          },
          active: perKind<string | null>(() => null),
        };
      },
    }
  )
);

rehydrateOnWorkspaceSwitch(useOpenTabsStore);
