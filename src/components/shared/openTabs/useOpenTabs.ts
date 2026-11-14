import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MAX_OPEN_TABS, type OpenTab, type OpenTabKind, type OpenTabTarget } from '@/lib/openTabs';
import {
  getSocket,
  releaseSocket,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '@/lib/socketManager';
import { toast } from '@/lib/toast';
import { readUnsentDraft, unsentDraftKey } from '@/lib/unsentDrafts';
import { useAuthStore } from '@/stores/authStore';
import { useOpenTabsStore } from '@/stores/openTabsStore';

/** A socket event that puts a dot on a background tab, and how to find the tab it is about. */
export type OpenTabNewsEvent = {
  event: string;
  keyOf: (payload: unknown) => string | null;
};

export type OpenTabsHandle = {
  kind: OpenTabKind;
  hasDraft: (key: string) => boolean;
  select: (key: string) => void;
  close: (key: string) => void;
  closeOthers: (key: string) => void;
  closeAll: () => void;
  keep: (key: string) => void;
  /** Typing in the open item keeps its tab. */
  keepActive: () => void;
};

type UseOpenTabsOptions = {
  kind: OpenTabKind;
  /** The item the page shows now; null when it shows none (the list, the board). */
  shown: OpenTabTarget | null;
  /** Show this tab's item (the page navigates to it). */
  activate: (tab: OpenTab) => void;
  /** The page closes the item it shows (the last tab was closed). */
  closeShown: () => void;
  /** The unsent-draft scopes an item writes to (see useUnsentDraft). */
  draftScopes: (key: string) => string[];
  /** "thread" / "ticket", for the notices. */
  noun: string;
  newsEvents?: OpenTabNewsEvent[];
  /** `[` / `]` and Ctrl+Alt shortcuts on the window. Off for a second row on the same page. */
  keyboard?: boolean;
  /**
   * The list stays live beside the item (split view): a plain click opens a preview tab that
   * the next click replaces, as in an editor. Anywhere else (a slide-over over the list, a
   * page of its own) every open is kept — the list cannot be clicked while the item is up, so
   * a preview was dropped on every close and the row never held more than one tab.
   */
  preview?: boolean;
};

/** Typing somewhere: a shortcut key is text there. */
const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  (target.closest('input, textarea, select') !== null ||
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null);

/** A dialog or menu is open (other than the tabs' own ▾ menu): the keys belong to it. */
const overlayOpen = (): boolean =>
  typeof document !== 'undefined' &&
  Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]')
  ).some(
    (overlay) =>
      overlay.querySelector('[data-open-tabs]') === null && !overlay.closest('[data-open-tabs]')
  );

/**
 * Tablet, phone, any touch screen: there is no preview to browse with, so every open is kept
 * (a plain tap is all there is — no Ctrl-click, no double-click).
 */
const EVERY_OPEN_KEPT_QUERY = 'not all and (min-width: 1024px), (pointer: coarse)';
const everyOpenKept = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(EVERY_OPEN_KEPT_QUERY).matches;

/** `]` / `[` step through the tabs; Ctrl+Alt with arrows or brackets too. ⌘ is the browser's. */
const stepFromKey = (event: KeyboardEvent): 1 | -1 | null => {
  if (event.metaKey) return null;
  if (event.ctrlKey && event.altKey) {
    if (event.key === 'ArrowRight' || event.key === ']') return 1;
    if (event.key === 'ArrowLeft' || event.key === '[') return -1;
    return null;
  }
  if (event.ctrlKey || event.altKey) return null;
  if (event.key === ']') return 1;
  if (event.key === '[') return -1;
  return null;
};

// Over the tab row's ▾ menu (top right), where the toasts stack by default.
const NOTICE = { position: 'bottom-right' } as const;

/**
 * The open-tabs row of a page: keeps the store in step with what the page shows, and gives the
 * row its actions. One call per page and kind.
 */
export const useOpenTabs = ({
  kind,
  shown,
  activate,
  closeShown,
  draftScopes,
  noun,
  newsEvents,
  keyboard = true,
  preview = false,
}: UseOpenTabsOptions): OpenTabsHandle => {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const workspaceId = useAuthStore((state) => state.selectedOrganizationId);
  const draftScopesRef = useRef(draftScopes);
  draftScopesRef.current = draftScopes;
  const hasDraft = useCallback(
    (key: string) =>
      draftScopesRef.current(key).some((scope) => {
        const storageKey = unsentDraftKey(userId, workspaceId, scope);
        return storageKey !== null && readUnsentDraft(storageKey) !== null;
      }),
    [userId, workspaceId]
  );
  const activateRef = useRef(activate);
  activateRef.current = activate;
  const closeShownRef = useRef(closeShown);
  closeShownRef.current = closeShown;

  // Show / hide: the page's item becomes the active tab.
  const shownKey = shown?.key ?? null;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const wasShowing = useRef(false);
  useEffect(() => {
    const store = useOpenTabsStore.getState();
    const target = shownRef.current;
    if (target) {
      wasShowing.current = true;
      const pending = store.finishActivating(kind);
      // A tab was picked but the page landed elsewhere (a merged thread's survivor).
      if (pending && pending.key !== target.key) store.redirect(kind, pending.key, target);
      const touch = !preview || everyOpenKept();
      const evicted = store.show(kind, target, hasDraft, touch);
      const draftKept = evicted.some((tab) => hasDraft(tab.key));
      if (evicted.length > 0 && (!touch || draftKept)) {
        toast.info(
          `Closed ${evicted.map((tab) => tab.label).join(', ')}: up to ${MAX_OPEN_TABS} ${noun}s stay open.` +
            (draftKept ? ' The unsent draft is kept for when you open it again.' : ''),
          NOTICE
        );
      }
      return;
    }
    if (!wasShowing.current) return;
    wasShowing.current = false;
    const pending = store.finishActivating(kind);
    if (pending) {
      // The picked tab's item could not be opened (deleted, no access): its tab goes.
      const lost = store.tabs[kind].find((tab) => tab.key === pending.key);
      store.forget(kind, pending.key);
      if (lost) toast.warning(`${lost.label} could not be opened, so its tab was closed.`, NOTICE);
    }
    store.hide(kind);
    // The label and title are part of the target: a renamed subject refreshes the tab.
  }, [kind, shownKey, shown?.label, shown?.title, shown?.urlId, hasDraft, noun, preview]);

  // The page itself goes (another route): nothing is active any more.
  const lastShownKey = useRef<string | null>(null);
  lastShownKey.current = shownKey;
  useEffect(
    () => () => {
      if (lastShownKey.current) useOpenTabsStore.getState().leave(kind, lastShownKey.current);
    },
    [kind]
  );

  const select = useCallback(
    (key: string) => {
      const store = useOpenTabsStore.getState();
      if (key === store.active[kind]) return;
      const tab = store.tabs[kind].find((other) => other.key === key);
      if (!tab) return;
      store.startActivating(kind, key);
      activateRef.current(tab);
    },
    [kind]
  );

  const sayDraftsKept = useCallback(
    (closing: OpenTab[]) => {
      const withDraft = closing.filter((tab) => hasDraft(tab.key));
      if (withDraft.length === 0) return;
      toast.info(
        withDraft.length === 1
          ? `Your unsent draft on ${withDraft[0].label} is kept. It is there when you open it again.`
          : `Your unsent drafts on ${withDraft.length} ${noun}s are kept. They are there when you open them again.`,
        NOTICE
      );
    },
    [hasDraft, noun]
  );

  const close = useCallback(
    (key: string) => {
      const store = useOpenTabsStore.getState();
      sayDraftsKept(store.tabs[kind].filter((tab) => tab.key === key));
      const wasActive = key === store.active[kind];
      const next = store.close(kind, key);
      if (!wasActive) return;
      if (next) {
        store.startActivating(kind, next.key);
        activateRef.current(next);
      } else {
        closeShownRef.current();
      }
    },
    [kind, sayDraftsKept]
  );

  const closeOthers = useCallback(
    (key: string) => {
      const store = useOpenTabsStore.getState();
      sayDraftsKept(store.tabs[kind].filter((tab) => tab.key !== key));
      const activeKey = store.active[kind];
      store.closeOthers(kind, key);
      if (activeKey !== key) select(key);
    },
    [kind, select, sayDraftsKept]
  );

  const closeAll = useCallback(() => {
    const store = useOpenTabsStore.getState();
    sayDraftsKept(store.tabs[kind]);
    const showing = store.active[kind] !== null;
    store.closeAll(kind);
    if (showing) closeShownRef.current();
  }, [kind, sayDraftsKept]);

  const keep = useCallback((key: string) => useOpenTabsStore.getState().keep(kind, key), [kind]);
  const keepActive = useCallback(() => {
    const store = useOpenTabsStore.getState();
    const activeKey = store.active[kind];
    if (activeKey) store.keep(kind, activeKey);
  }, [kind]);

  // News on background tabs.
  const newsEventsRef = useRef(newsEvents);
  newsEventsRef.current = newsEvents;
  const eventNames = (newsEvents ?? []).map((entry) => entry.event).join(',');
  useEffect(() => {
    if (!eventNames) return undefined;
    // Holds the shared socket while the row listens (released below), as other listeners do.
    if (!getSocket()) return undefined;
    const handlers = eventNames.split(',').map((event) => {
      const handler = (payload: unknown) => {
        const entry = newsEventsRef.current?.find((candidate) => candidate.event === event);
        const key = entry?.keyOf(payload) ?? null;
        if (key !== null) useOpenTabsStore.getState().markNews(kind, key);
      };
      subscribeToEvent(event, handler);
      return { event, handler };
    });
    return () => {
      for (const { event, handler } of handlers) unsubscribeFromEvent(event, handler);
      releaseSocket();
    };
  }, [kind, eventNames]);

  // Keyboard: [ and ] anywhere on the page (not while typing, not under a dialog or menu).
  useEffect(() => {
    if (!keyboard) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (isTypingTarget(event.target) || overlayOpen()) return;
      const store = useOpenTabsStore.getState();
      const tabs = store.tabs[kind];
      const activeKey = store.active[kind];
      const step = stepFromKey(event);
      if (step !== null) {
        if (tabs.length === 0) return;
        const at = tabs.findIndex((tab) => tab.key === activeKey);
        const nextAt =
          at < 0 ? (step === 1 ? 0 : tabs.length - 1) : (at + step + tabs.length) % tabs.length;
        event.preventDefault();
        if (tabs[nextAt].key !== activeKey) select(tabs[nextAt].key);
        return;
      }
      if (event.ctrlKey && event.altKey && !event.metaKey && event.code === 'KeyW' && activeKey) {
        event.preventDefault();
        close(activeKey);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboard, kind, select, close]);

  return useMemo(
    () => ({ kind, hasDraft, select, close, closeOthers, closeAll, keep, keepActive }),
    [kind, hasDraft, select, close, closeOthers, closeAll, keep, keepActive]
  );
};

/** The tabs of a kind, for the row: which is active and which hold a draft. */
export const useOpenTabsView = (handle: OpenTabsHandle) => {
  const tabs = useOpenTabsStore((state) => state.tabs[handle.kind]);
  const activeKey = useOpenTabsStore((state) => state.active[handle.kind]);
  const { hasDraft } = handle;
  const draftKeys = useMemo(
    () => new Set(tabs.filter((tab) => hasDraft(tab.key)).map((tab) => tab.key)),
    [tabs, hasDraft]
  );
  return { tabs, activeKey, draftKeys };
};
