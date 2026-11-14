import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { OpenTab } from '@/lib/openTabs';
import { useOpenTabsStore } from '@/stores/openTabsStore';
import { OpenTabsRowView } from '../OpenTabsRow';
import { keepOpenTabOnDoubleClick } from '../openTabClicks';

afterEach(cleanup);

const tab = (key: string, extra: Partial<OpenTab & { draft: boolean }> = {}) => ({
  key,
  urlId: key,
  label: `SUP-${key}`,
  title: `Subject ${key}`,
  preview: false,
  news: false,
  lastActiveAt: 1,
  draft: false,
  ...extra,
});

const Harness = ({ initial }: { initial: string[] }) => {
  const [items, setItems] = useState(initial.map((key) => tab(key)));
  return (
    <OpenTabsRowView
      items={items}
      activeKey={items[0]?.key ?? null}
      onSelect={() => undefined}
      onClose={(key) => setItems((current) => current.filter((item) => item.key !== key))}
      ariaLabel="Open threads"
    />
  );
};

describe('OpenTabsRowView keyboard', () => {
  it('Delete closes the focused tab and focus moves to its neighbour', () => {
    render(<Harness initial={['1', '2', '3']} />);
    const second = screen.getByRole('tab', { name: /SUP-2/ });
    second.focus();
    fireEvent.keyDown(second, { key: 'Delete' });
    expect(screen.queryByRole('tab', { name: /SUP-2/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /SUP-3/ }));
  });

  it('Delete on the last tab moves focus to the one before it', () => {
    render(<Harness initial={['1', '2']} />);
    const last = screen.getByRole('tab', { name: /SUP-2/ });
    last.focus();
    fireEvent.keyDown(last, { key: 'Delete' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /SUP-1/ }));
  });

  it('arrows, Home and End move focus along the row', () => {
    render(<Harness initial={['1', '2', '3']} />);
    const first = screen.getByRole('tab', { name: /SUP-1/ });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /SUP-2/ }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /SUP-3/ }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(first);
  });

  it('says preview, news and draft to a screen reader', () => {
    render(
      <OpenTabsRowView
        items={[tab('1', { preview: true, news: true, draft: true })]}
        activeKey={null}
        onSelect={() => undefined}
        onClose={() => undefined}
        ariaLabel="Open threads"
      />
    );
    expect(screen.getByRole('tab').getAttribute('aria-label')).toBe(
      'SUP-1, Subject 1, preview, new activity, unsent draft'
    );
  });
});

describe('a double-click on a list row keeps its tab', () => {
  beforeEach(() => {
    useOpenTabsStore.setState({
      tabs: { threads: [], tickets: [] },
      active: { threads: null, tickets: null },
      newTabAskedAt: { threads: null, tickets: null },
      keepAsked: { threads: null, tickets: null },
      activating: { threads: null, tickets: null },
    });
  });
  const target = { key: '7', urlId: 'SUP-7', label: 'SUP-7', title: 'Refund' };

  it('the first click already showed the thread: kept at once', () => {
    act(() => {
      useOpenTabsStore.getState().show('threads', target, () => false);
    });
    expect(useOpenTabsStore.getState().tabs.threads[0].preview).toBe(true);
    keepOpenTabOnDoubleClick('threads', '7');
    expect(useOpenTabsStore.getState().tabs.threads[0].preview).toBe(false);
  });

  it('the thread is still loading: kept when it is shown', () => {
    vi.useFakeTimers();
    try {
      keepOpenTabOnDoubleClick('threads', '7');
      vi.advanceTimersByTime(800);
      useOpenTabsStore.getState().show('threads', target, () => false);
      expect(useOpenTabsStore.getState().tabs.threads[0].preview).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('another thread on screen: that one is not kept, the double-clicked one is', () => {
    const other = { key: '3', urlId: 'SUP-3', label: 'SUP-3', title: 'Other' };
    useOpenTabsStore.getState().show('threads', other, () => false);
    // The double-click lands while thread 7 is still loading: 3 is still the one on screen.
    keepOpenTabOnDoubleClick('threads', '7');
    useOpenTabsStore.getState().show('threads', target, () => false);
    const tabs = useOpenTabsStore.getState().tabs.threads;
    expect(tabs.map((item) => [item.key, item.preview])).toEqual([['7', false]]);
  });

  it('an old double-click does not keep a later open', () => {
    vi.useFakeTimers();
    try {
      keepOpenTabOnDoubleClick('threads', '7');
      vi.advanceTimersByTime(20_000);
      useOpenTabsStore.getState().show('threads', target, () => false);
      expect(useOpenTabsStore.getState().tabs.threads[0].preview).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
