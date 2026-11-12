import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOpenTabsStore } from '@/stores/openTabsStore';
import { useOpenTabs } from '../useOpenTabs';

const target = { key: '7', urlId: 'SUP-7', label: 'SUP-7', title: 'Refund' };

const openWith = (preview: boolean) => {
  const view = renderHook(
    ({ shown }) =>
      useOpenTabs({
        kind: 'threads',
        shown,
        activate: () => undefined,
        closeShown: () => undefined,
        draftScopes: () => [],
        noun: 'thread',
        keyboard: false,
        preview,
      }),
    { initialProps: { shown: target as typeof target | null } }
  );
  return view;
};

describe('where a thread opens decides whether its tab is a preview', () => {
  beforeEach(() => {
    useOpenTabsStore.setState({
      tabs: { threads: [], tickets: [] },
      active: { threads: null, tickets: null },
      newTabAskedAt: { threads: null, tickets: null },
      keepAsked: { threads: null, tickets: null },
      activating: { threads: null, tickets: null },
    });
  });

  it('beside the list (split): a preview, dropped when the thread is closed', () => {
    const view = openWith(true);
    expect(useOpenTabsStore.getState().tabs.threads[0].preview).toBe(true);
    view.rerender({ shown: null });
    expect(useOpenTabsStore.getState().tabs.threads).toEqual([]);
  });

  it('over the list (slide-over) or on a page: kept, and still there after closing', () => {
    const view = openWith(false);
    expect(useOpenTabsStore.getState().tabs.threads[0].preview).toBe(false);
    view.rerender({ shown: null });
    expect(useOpenTabsStore.getState().tabs.threads.map((tab) => tab.key)).toEqual(['7']);
  });
});
