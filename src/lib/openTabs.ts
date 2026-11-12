/*
  Open tabs for threads and tickets: the pure rules, kept apart from the store so they can be
  tested without one.

  A tab is a thread or ticket the agent opened. Two kinds:
  - a PREVIEW tab (shown in italics): a plain click on desktop opens into it, replacing what it
    showed, so browsing the list does not pile up tabs;
  - a KEPT tab: stays until closed. A preview is kept by a double-click, by typing in it, by
    "Keep this tab open", or by opening it with Ctrl/⌘-click or a middle click.

  There is at most one preview. A tab with an unsent draft is never replaced and is the last to
  be closed for room. At most MAX_OPEN_TABS stay open: past that the least recently used goes.
*/

export type OpenTabKind = 'threads' | 'tickets';

/** What the page knows about the item it shows: the tab is made (or refreshed) from this. */
export type OpenTabTarget = {
  /** Stable id: the message id of a thread, the id of a ticket. */
  key: string;
  /** The id that goes into the URL to open it again. */
  urlId: string;
  /** What the tab shows first: the thread or ticket id ("NORD-SUP-101", "T-21"). */
  label: string;
  /** The subject or title, after the label where it fits. */
  title: string;
};

export type OpenTab = OpenTabTarget & {
  preview: boolean;
  /** Something happened while it was in the background: a reply, a status change, a comment. */
  news: boolean;
  lastActiveAt: number;
};

export const MAX_OPEN_TABS = 8;
/** A tab not looked at for a week is not restored on the next visit. */
export const OPEN_TAB_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Insert `tab` right after the active one — where the agent is looking — else at the end. */
export const insertAfterActive = (
  tabs: OpenTab[],
  activeKey: string | null,
  tab: OpenTab
): OpenTab[] => {
  const at = activeKey === null ? -1 : tabs.findIndex((other) => other.key === activeKey);
  return at < 0 ? [...tabs, tab] : [...tabs.slice(0, at + 1), tab, ...tabs.slice(at + 1)];
};

/**
 * Close tabs for room until at most `limit` are open: the least recently used first, never
 * `keepKey` (the one just opened), and a tab with a draft only when nothing else is left.
 */
export const evictOverLimit = (
  tabs: OpenTab[],
  keepKey: string,
  hasDraft: (key: string) => boolean,
  limit = MAX_OPEN_TABS
): { tabs: OpenTab[]; evicted: OpenTab[] } => {
  let left = tabs;
  const evicted: OpenTab[] = [];
  while (left.length > limit) {
    const candidates = left.filter((tab) => tab.key !== keepKey);
    const withoutDraft = candidates.filter((tab) => !hasDraft(tab.key));
    const pool = withoutDraft.length > 0 ? withoutDraft : candidates;
    const oldest = pool.reduce((least, tab) =>
      tab.lastActiveAt < least.lastActiveAt ? tab : least
    );
    evicted.push(oldest);
    left = left.filter((tab) => tab.key !== oldest.key);
  }
  return { tabs: left, evicted };
};

/**
 * The page shows `target`: refresh its tab, or make one. `newTab` (Ctrl/⌘-click, middle click,
 * tablet and phone) makes a kept tab beside the active one; otherwise the open goes into the
 * preview tab — unless the preview holds a draft, then that one is kept and a new preview opens.
 */
export const showTab = (
  tabs: OpenTab[],
  target: OpenTabTarget,
  options: {
    now: number;
    activeKey: string | null;
    newTab: boolean;
    keep: boolean;
    hasDraft: (key: string) => boolean;
  }
): { tabs: OpenTab[]; evicted: OpenTab[] } => {
  const { now, activeKey, newTab, keep, hasDraft } = options;
  if (tabs.some((tab) => tab.key === target.key)) {
    return {
      tabs: tabs.map((tab) =>
        tab.key === target.key
          ? {
              ...tab,
              ...target,
              preview: tab.preview && !newTab && !keep,
              news: false,
              lastActiveAt: now,
            }
          : tab
      ),
      evicted: [],
    };
  }
  const fresh: OpenTab = { ...target, preview: !newTab && !keep, news: false, lastActiveAt: now };
  if (!newTab) {
    const previewAt = tabs.findIndex((tab) => tab.preview);
    if (previewAt >= 0) {
      const preview = tabs[previewAt];
      if (!hasDraft(preview.key)) {
        const replaced = [...tabs];
        replaced[previewAt] = fresh;
        return evictOverLimit(replaced, fresh.key, hasDraft);
      }
      // The preview holds a draft: it is kept, never replaced.
      const kept = tabs.map((tab) => (tab.preview ? { ...tab, preview: false } : tab));
      return evictOverLimit(insertAfterActive(kept, activeKey, fresh), fresh.key, hasDraft);
    }
  }
  return evictOverLimit(insertAfterActive(tabs, activeKey, fresh), fresh.key, hasDraft);
};

/**
 * Close `key`. When it was the active tab, `next` is the tab to show instead — its right-hand
 * neighbour, else its left — or null when it was the last.
 */
export const closeTab = (
  tabs: OpenTab[],
  key: string,
  activeKey: string | null
): { tabs: OpenTab[]; next: OpenTab | null } => {
  const at = tabs.findIndex((tab) => tab.key === key);
  if (at < 0) return { tabs, next: null };
  const left = tabs.filter((tab) => tab.key !== key);
  return key !== activeKey
    ? { tabs: left, next: null }
    : { tabs: left, next: left[at] ?? left[at - 1] ?? null };
};

export const keepTab = (tabs: OpenTab[], key: string): OpenTab[] =>
  tabs.some((tab) => tab.key === key && tab.preview)
    ? tabs.map((tab) => (tab.key === key ? { ...tab, preview: false } : tab))
    : tabs;

/** News on a background tab; the tab on screen never gets a dot. */
export const markTabNews = (tabs: OpenTab[], key: string, activeKey: string | null): OpenTab[] =>
  key !== activeKey && tabs.some((tab) => tab.key === key && !tab.news)
    ? tabs.map((tab) => (tab.key === key ? { ...tab, news: true } : tab))
    : tabs;

/**
 * A tab was activated but the page landed on another item (a merged thread redirects to its
 * survivor): the tab becomes that item, or goes when the item already has a tab of its own.
 */
export const redirectTab = (
  tabs: OpenTab[],
  fromKey: string,
  target: OpenTabTarget,
  now: number
): OpenTab[] => {
  if (!tabs.some((tab) => tab.key === fromKey)) return tabs;
  if (tabs.some((tab) => tab.key === target.key)) {
    return tabs
      .filter((tab) => tab.key !== fromKey)
      .map((tab) =>
        tab.key === target.key ? { ...tab, ...target, news: false, lastActiveAt: now } : tab
      );
  }
  return tabs.map((tab) =>
    tab.key === fromKey ? { ...tab, ...target, news: false, lastActiveAt: now } : tab
  );
};

/**
 * Tabs read back from storage, which another version or a hand edit may have written: only
 * well-formed entries, each key once, none older than the TTL, at most one preview, within the
 * limit.
 */
export const sanitizeStoredTabs = (stored: unknown, now: number): OpenTab[] => {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const tabs: OpenTab[] = [];
  for (const entry of stored) {
    if (!entry || typeof entry !== 'object') continue;
    const tab = entry as Partial<OpenTab>;
    if (
      typeof tab.key !== 'string' ||
      typeof tab.urlId !== 'string' ||
      typeof tab.label !== 'string' ||
      typeof tab.lastActiveAt !== 'number' ||
      seen.has(tab.key) ||
      now - tab.lastActiveAt > OPEN_TAB_TTL_MS
    ) {
      continue;
    }
    seen.add(tab.key);
    tabs.push({
      key: tab.key,
      urlId: tab.urlId,
      label: tab.label,
      title: typeof tab.title === 'string' ? tab.title : '',
      preview: tab.preview === true,
      news: tab.news === true,
      lastActiveAt: tab.lastActiveAt,
    });
  }
  let previewSeen = false;
  const onePreview = tabs.map((tab) => {
    if (!tab.preview) return tab;
    if (previewSeen) return { ...tab, preview: false };
    previewSeen = true;
    return tab;
  });
  return evictOverLimit(onePreview, '', () => false).tabs;
};

export { OPEN_TABS_STORAGE_NAME } from './openTabsStorage';
