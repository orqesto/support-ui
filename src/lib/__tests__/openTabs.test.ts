import { describe, expect, it } from 'vitest';
import {
  closeTab,
  evictOverLimit,
  keepTab,
  markTabNews,
  MAX_OPEN_TABS,
  OPEN_TAB_TTL_MS,
  redirectTab,
  sanitizeStoredTabs,
  showTab,
  type OpenTab,
} from '../openTabs';

const tab = (key: string, extra: Partial<OpenTab> = {}): OpenTab => ({
  key,
  urlId: `SUP-${key}`,
  label: `SUP-${key}`,
  title: `Subject ${key}`,
  preview: false,
  news: false,
  lastActiveAt: Number(key),
  ...extra,
});
const target = (key: string) => ({
  key,
  urlId: `SUP-${key}`,
  label: `SUP-${key}`,
  title: `Subject ${key}`,
});
const noDraft = () => false;
const keys = (tabs: OpenTab[]) => tabs.map((item) => item.key);
const opts = (extra: Partial<Parameters<typeof showTab>[2]> = {}) => ({
  now: 1000,
  activeKey: null,
  newTab: false,
  keep: false,
  hasDraft: noDraft,
  ...extra,
});

describe('showTab', () => {
  it('a plain open reuses the preview tab, in its place', () => {
    const tabs = [tab('1'), tab('2', { preview: true }), tab('3')];
    const { tabs: next } = showTab(tabs, target('9'), opts({ activeKey: '2' }));
    expect(keys(next)).toEqual(['1', '9', '3']);
    expect(next[1].preview).toBe(true);
  });

  it('a new-tab open is kept and goes right after the active tab', () => {
    const tabs = [tab('1'), tab('2'), tab('3')];
    const { tabs: next } = showTab(tabs, target('9'), opts({ activeKey: '1', newTab: true }));
    expect(keys(next)).toEqual(['1', '9', '2', '3']);
    expect(next[1].preview).toBe(false);
  });

  it('a keep request (double-click on a row) opens a kept tab', () => {
    const { tabs: next } = showTab([], target('9'), opts({ keep: true }));
    expect(next[0].preview).toBe(false);
  });

  it('a preview holding a draft is kept, never replaced', () => {
    const tabs = [tab('1', { preview: true })];
    const { tabs: next } = showTab(
      tabs,
      target('9'),
      opts({ activeKey: '1', hasDraft: (key) => key === '1' })
    );
    expect(keys(next)).toEqual(['1', '9']);
    expect(next[0].preview).toBe(false);
    expect(next[1].preview).toBe(true);
  });

  it('showing an open tab refreshes it and clears its news', () => {
    const tabs = [tab('1', { news: true, title: 'old' })];
    const { tabs: next } = showTab(tabs, target('1'), opts({ now: 5000 }));
    expect(next[0]).toMatchObject({ news: false, title: 'Subject 1', lastActiveAt: 5000 });
  });

  it('past the limit the least recently used goes, the new tab never', () => {
    const tabs = Array.from({ length: MAX_OPEN_TABS }, (_, index) => tab(String(index + 1)));
    const { tabs: next, evicted } = showTab(tabs, target('99'), opts({ newTab: true, now: 100 }));
    expect(next).toHaveLength(MAX_OPEN_TABS);
    expect(keys(evicted)).toEqual(['1']);
    expect(keys(next)).toContain('99');
  });
});

describe('evictOverLimit', () => {
  it('spares tabs with a draft while others remain', () => {
    const tabs = [tab('1'), tab('2'), tab('3')];
    const { evicted } = evictOverLimit(tabs, '3', (key) => key === '1', 2);
    expect(keys(evicted)).toEqual(['2']);
  });
});

describe('closeTab', () => {
  it('closing the active tab moves to its right-hand neighbour, else the left', () => {
    const tabs = [tab('1'), tab('2'), tab('3')];
    expect(closeTab(tabs, '2', '2').next?.key).toBe('3');
    expect(closeTab(tabs, '3', '3').next?.key).toBe('2');
    expect(closeTab([tab('1')], '1', '1').next).toBeNull();
  });
  it('closing a background tab changes nothing on screen', () => {
    expect(closeTab([tab('1'), tab('2')], '1', '2').next).toBeNull();
  });
});

describe('keepTab / markTabNews / redirectTab', () => {
  it('keep turns a preview into a kept tab', () => {
    expect(keepTab([tab('1', { preview: true })], '1')[0].preview).toBe(false);
  });
  it('news marks a background tab only', () => {
    const tabs = [tab('1'), tab('2')];
    expect(markTabNews(tabs, '1', '1')).toBe(tabs);
    expect(markTabNews(tabs, '2', '1')[1].news).toBe(true);
  });
  it('a redirect becomes the survivor, or drops into its existing tab', () => {
    expect(keys(redirectTab([tab('1'), tab('2')], '1', target('7'), 10))).toEqual(['7', '2']);
    expect(keys(redirectTab([tab('1'), tab('2')], '1', target('2'), 10))).toEqual(['2']);
  });
});

describe('sanitizeStoredTabs', () => {
  it('drops malformed, duplicate and week-old entries and keeps one preview', () => {
    const now = OPEN_TAB_TTL_MS + 100;
    const stored = [
      tab('1', { lastActiveAt: now, preview: true }),
      tab('1', { lastActiveAt: now }),
      { key: 2 },
      tab('3', { lastActiveAt: 50 }),
      tab('4', { lastActiveAt: now, preview: true }),
    ];
    const tabs = sanitizeStoredTabs(stored, now);
    expect(keys(tabs)).toEqual(['1', '4']);
    expect(tabs.map((item) => item.preview)).toEqual([true, false]);
    expect(sanitizeStoredTabs('nonsense', now)).toEqual([]);
  });
});
