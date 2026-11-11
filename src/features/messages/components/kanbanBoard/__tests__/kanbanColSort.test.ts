/**
 * A board column's sort is remembered for this user in this workspace (owner, 2026-11-11: it reset
 * to newest-first on leaving the page or reloading). Same harness as `filtersPerWorkspace.test.ts`:
 * a reload is `vi.resetModules()` + a fresh import; localStorage is shared.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAB_WORKSPACE_KEY } from '@/lib/tabWorkspace';

const signIn = (id: number) =>
  window.localStorage.setItem(
    'auth-storage',
    JSON.stringify({ state: { user: { id, email: `u${id}@example.com` } }, version: 0 })
  );
const openTab = (orgId: number) => {
  window.sessionStorage.clear();
  window.sessionStorage.setItem(TAB_WORKSPACE_KEY, String(orgId));
};
const load = async () => {
  vi.resetModules();
  await import('@/stores/authStore');
  return import('../kanbanColSort');
};
const oldest = { sortBy: 'time', sortOrder: 'asc' } as const;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('board column sort is remembered', () => {
  it('a reload keeps each column’s sort', async () => {
    signIn(7);
    openTab(1);
    let mod = await load();
    mod.saveColSort({ needs_us: oldest, on_hold: { sortBy: 'priority', sortOrder: 'desc' } });
    mod = await load();
    expect(mod.loadColSort()).toEqual({
      needs_us: oldest,
      on_hold: { sortBy: 'priority', sortOrder: 'desc' },
    });
  });

  it('per user and per workspace', async () => {
    signIn(7);
    openTab(1);
    (await load()).saveColSort({ needs_us: oldest });

    signIn(8);
    expect((await load()).loadColSort()).toEqual({});
    signIn(7);
    openTab(2);
    expect((await load()).loadColSort()).toEqual({});
    openTab(1);
    expect((await load()).loadColSort()).toEqual({ needs_us: oldest });
  });

  it('drops what it cannot use: unknown sort fields, bad order, garbage', async () => {
    signIn(7);
    openTab(1);
    window.localStorage.setItem(
      'kanban-col-sort:1:u7',
      JSON.stringify({
        needs_us: oldest,
        a: { sortBy: 'nope', sortOrder: 'asc' },
        b: { sortBy: 'time', sortOrder: 'up' },
        c: 'x',
        d: null,
      })
    );
    expect((await load()).loadColSort()).toEqual({ needs_us: oldest });
    window.localStorage.setItem('kanban-col-sort:1:u7', '{not json');
    expect((await load()).loadColSort()).toEqual({});
    window.localStorage.setItem('kanban-col-sort:1:u7', '[1,2]');
    expect((await load()).loadColSort()).toEqual({});
  });
});
