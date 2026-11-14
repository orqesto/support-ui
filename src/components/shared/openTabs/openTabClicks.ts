import type { MouseEvent } from 'react';
import type { OpenTabKind } from '@/lib/openTabs';
import { useOpenTabsStore } from '@/stores/openTabsStore';

/*
  What a click on a list row or board card asks of the open-tabs row. The row cannot be told
  directly: the page shows the item only once it is fetched, so the wish is left in the store
  for `show` to pick up.
*/

const asksForNewTab = (event: MouseEvent): boolean =>
  event.ctrlKey || event.metaKey || event.button === 1;

/** On a row's click: Ctrl/⌘-click opens the item in a new, kept tab. */
export const noteOpenTabClick = (kind: OpenTabKind, event: MouseEvent): void => {
  if (asksForNewTab(event)) useOpenTabsStore.getState().requestNewTab(kind);
};

/**
 * On a row's auxclick: a middle click opens the item in a new tab instead of the browser's
 * autoscroll. Returns whether it handled the event.
 */
export const openInNewTabOnMiddleClick = (
  kind: OpenTabKind,
  event: MouseEvent,
  open: () => void
): boolean => {
  if (event.button !== 1) return false;
  event.preventDefault();
  useOpenTabsStore.getState().requestNewTab(kind);
  open();
  return true;
};

/**
 * On a row's double-click: keep the tab of the item it opens (`key`: the tab's key, the id the
 * page will show), as a double-click on the tab does.
 */
export const keepOpenTabOnDoubleClick = (kind: OpenTabKind, key: string): void => {
  useOpenTabsStore.getState().requestKeep(kind, key);
};

/**
 * The tab key of the thread a list row or board card opens: the message the open shows (the
 * latest incoming, else the latest — useOpenThread).
 */
export const threadTabKey = (thread: {
  latestMessage?: { id: number } | null;
  latestIncomingMessage?: { id: number } | null;
}): string => String((thread.latestIncomingMessage ?? thread.latestMessage)?.id ?? '');
