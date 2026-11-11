/**
 * Saved inbox / ticket filters belong to a WORKSPACE. They name a department, label, column or
 * assignee of one workspace; saved once per browser, a reload of a tab in workspace B applied a
 * filter set in another tab's workspace A — A's ids, in B (owner chose "per workspace", 2026-10-07).
 *
 * Same harness as `workspacePerTab.test.ts`: a tab is a sessionStorage snapshot, localStorage is
 * shared, a reload is `vi.resetModules()` + a fresh import.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TAB_WORKSPACE_KEY } from '@/lib/tabWorkspace';

const openTab = (orgId: number | null) => {
  window.sessionStorage.clear();
  if (orgId !== null) window.sessionStorage.setItem(TAB_WORKSPACE_KEY, String(orgId));
};
const load = async () => {
  vi.resetModules();
  const { useAuthStore } = await import('@/stores/authStore');
  const { useMessagesStore } = await import('@/features/messages/stores/messagesStore');
  const { useTicketsStore } = await import('@/features/tickets/shell');
  return { useAuthStore, useMessagesStore, useTicketsStore };
};
const dept = (store: Awaited<ReturnType<typeof load>>) =>
  store.useMessagesStore.getState().filters.departmentId;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('saved filters per workspace', () => {
  it('a tab in another workspace does not inherit the filter set in this one, and back', async () => {
    openTab(1);
    let store = await load();
    store.useMessagesStore.getState().updateFilter('departmentId', '12');

    openTab(2); // tab B, another workspace
    store = await load();
    expect(dept(store)).toBe('all');
    store.useMessagesStore.getState().updateFilter('departmentId', '30');

    openTab(1); // tab A reloads
    store = await load();
    expect(dept(store)).toBe('12');
  });

  it('a new tab in the same workspace opens with that workspace’s filters', async () => {
    openTab(1);
    let store = await load();
    store.useMessagesStore.getState().setSorting({ sortBy: 'priority', sortOrder: 'asc' });
    openTab(1);
    store = await load();
    expect(store.useMessagesStore.getState().sorting).toEqual({
      sortBy: 'priority',
      sortOrder: 'asc',
    });
  });

  it('an in-place switch loads the new workspace’s filters and keeps the old one’s saved', async () => {
    openTab(1);
    const store = await load();
    store.useMessagesStore.getState().updateFilter('departmentId', '12');

    store.useAuthStore.getState().setSelectedOrganization(2);
    await vi.waitFor(() => expect(dept(store)).toBe('all'));
    store.useMessagesStore.getState().updateFilter('departmentId', '30');

    store.useAuthStore.getState().setSelectedOrganization(1);
    await vi.waitFor(() => expect(dept(store)).toBe('12'));
  });

  it('an old unscoped entry is not adopted — it cannot say which workspace it was for', async () => {
    window.localStorage.setItem(
      'messages-filters',
      JSON.stringify({ state: { filters: { departmentId: '99' } }, version: 0 })
    );
    openTab(1);
    expect(dept(await load())).toBe('all');
  });

  it('with no workspace selected nothing is written', async () => {
    openTab(null);
    const store = await load();
    store.useMessagesStore.getState().updateFilter('departmentId', '12');
    expect(
      Object.keys(window.localStorage).filter((key) => key.startsWith('messages-filters'))
    ).toEqual([]);
  });

  it('ticket filters are per workspace too', async () => {
    openTab(1);
    let store = await load();
    store.useTicketsStore.getState().setFilters({
      ...store.useTicketsStore.getState().filters,
      categoryId: '7',
    });
    openTab(2);
    store = await load();
    expect(store.useTicketsStore.getState().filters.categoryId).toBe('all');
    openTab(1);
    store = await load();
    expect(store.useTicketsStore.getState().filters.categoryId).toBe('7');

    store.useAuthStore.getState().setSelectedOrganization(2); // in place
    await vi.waitFor(() => expect(store.useTicketsStore.getState().filters.categoryId).toBe('all'));
  });

  // Owner 2026-11-11: a sort the user picks stays for THIS user until they change it.
  describe('per user', () => {
    const signIn = (id: number) =>
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({ state: { user: { id, email: `u${id}@example.com` } }, version: 0 })
      );
    const sorting = (store: Awaited<ReturnType<typeof load>>) =>
      store.useMessagesStore.getState().sorting;
    const oldest = { sortBy: 'time', sortOrder: 'asc' } as const;

    it('a reload keeps the sort this user picked', async () => {
      signIn(7);
      openTab(1);
      let store = await load();
      store.useMessagesStore.getState().setSorting(oldest);
      store = await load();
      expect(sorting(store)).toEqual(oldest);
      expect(window.localStorage.getItem('messages-filters:1:u7')).toContain('"asc"');
    });

    it('another person on the same browser and workspace keeps their own sort', async () => {
      signIn(7);
      openTab(1);
      let store = await load();
      store.useMessagesStore.getState().setSorting(oldest);

      signIn(8);
      store = await load();
      store.useMessagesStore.getState().setSorting({ sortBy: 'priority', sortOrder: 'desc' });

      signIn(7);
      store = await load();
      expect(sorting(store)).toEqual(oldest);
    });

    it('signing in as someone else in place loads their sort, not the previous person’s', async () => {
      signIn(7);
      openTab(1);
      const store = await load();
      store.useMessagesStore.getState().setSorting(oldest);

      store.useAuthStore.getState().setUser({ id: 8, email: 'u8@example.com' } as never);
      await vi.waitFor(() => expect(sorting(store)).toEqual({ sortBy: 'time', sortOrder: 'desc' }));
    });

    it('the earlier per-workspace entry is read until this user saves their own', async () => {
      window.localStorage.setItem(
        'messages-filters:1',
        JSON.stringify({ state: { sorting: oldest }, version: 0 })
      );
      signIn(7);
      openTab(1);
      expect(sorting(await load())).toEqual(oldest);
    });

    it('CONTROL: without a saved entry the list opens newest first', async () => {
      signIn(7);
      openTab(1);
      expect(sorting(await load())).toEqual({ sortBy: 'time', sortOrder: 'desc' });
    });
  });
});
