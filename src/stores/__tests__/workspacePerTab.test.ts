/**
 * The selected workspace belongs to the browser TAB. Two tabs on two workspaces used to collapse
 * onto whichever tab wrote `auth-storage` last as soon as either reloaded (owner, 2026-10-07).
 *
 * A "tab" here is a sessionStorage snapshot; localStorage is shared, exactly as in a browser. A
 * reload is `vi.resetModules()` + a fresh import, which re-runs the store's initialiser and the
 * persist hydration against whatever the storages hold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_WORKSPACE_KEY, TAB_WORKSPACE_KEY } from '@/lib/tabWorkspace';

type Tab = Record<string, string>;

const snapshotTab = (): Tab => ({ ...Object.fromEntries(Object.entries(window.sessionStorage)) });
const openTab = (tab: Tab = {}) => {
  window.sessionStorage.clear();
  for (const [key, value] of Object.entries(tab)) window.sessionStorage.setItem(key, value);
};
const loadStore = async () => {
  vi.resetModules();
  return (await import('@/stores/authStore')).useAuthStore;
};
const user = { id: 9, email: 'a@b.c', firstName: 'A', organizationId: 1 };
const legacyBlob = (selectedOrganizationId: number) =>
  JSON.stringify({ state: { user, selectedOrganizationId }, version: 0 });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => vi.resetModules());

describe('workspace per tab', () => {
  it('a reload keeps THIS tab on its workspace after another tab picked a different one', async () => {
    openTab();
    let store = await loadStore();
    store.getState().setSelectedOrganization(1);
    const tabA = snapshotTab();

    openTab(); // tab B: a new tab
    store = await loadStore();
    store.getState().setSelectedOrganization(2);
    store.getState().setUser({ ...user } as never); // B writes auth-storage too

    openTab(tabA); // tab A reloads
    store = await loadStore();
    expect(store.getState().selectedOrganizationId).toBe(1);
  });

  it('a tab that only INHERITED its workspace keeps it after another tab picks a new one', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, '5'); // or a legacy blob: same path
    openTab(); // tab A opens, adopts 5, never touches the switcher
    let store = await loadStore();
    expect(store.getState().selectedOrganizationId).toBe(5);
    const tabA = snapshotTab();

    openTab(); // tab B picks 6
    store = await loadStore();
    store.getState().setSelectedOrganization(6);

    openTab(tabA); // tab A reloads
    store = await loadStore();
    expect(store.getState().selectedOrganizationId).toBe(5);
  });

  it('adopting a workspace does not change the seed for the next new tab', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, '5');
    openTab({ [TAB_WORKSPACE_KEY]: '3' });
    await loadStore();
    expect(window.localStorage.getItem(LAST_WORKSPACE_KEY)).toBe('5');
  });

  it('a legacy selection left in auth-storage (an old-build tab) does not override the tab', async () => {
    window.localStorage.setItem('auth-storage', legacyBlob(2));
    openTab({ [TAB_WORKSPACE_KEY]: '1' });
    const store = await loadStore();
    expect(store.getState().selectedOrganizationId).toBe(1);
    expect(store.getState().user?.id).toBe(9); // the rest of the blob still hydrates
  });

  it('a new tab opens on the workspace chosen last in any tab', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, '5');
    openTab();
    expect((await loadStore()).getState().selectedOrganizationId).toBe(5);
  });

  it('first load after the upgrade keeps the selection the old build stored', async () => {
    window.localStorage.setItem('auth-storage', legacyBlob(7));
    openTab();
    expect((await loadStore()).getState().selectedOrganizationId).toBe(7);
  });

  it('nothing stored anywhere ⇒ no selection', async () => {
    openTab();
    expect((await loadStore()).getState().selectedOrganizationId).toBeNull();
  });

  it('ignores a garbage stored value', async () => {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, 'abc');
    openTab({ [TAB_WORKSPACE_KEY]: '-3' });
    expect((await loadStore()).getState().selectedOrganizationId).toBeNull();
  });

  it('auth-storage no longer carries the selection', async () => {
    openTab();
    const store = await loadStore();
    store.getState().login(null, { ...user } as never);
    store.getState().setSelectedOrganization(4);
    expect(window.localStorage.getItem('auth-storage')).not.toContain('selectedOrganizationId');
    expect(window.sessionStorage.getItem(TAB_WORKSPACE_KEY)).toBe('4');
    expect(window.localStorage.getItem(LAST_WORKSPACE_KEY)).toBe('4');
  });

  it('logout forgets the tab and the last-chosen workspace', async () => {
    openTab();
    const store = await loadStore();
    store.getState().setSelectedOrganization(4);
    expect(window.sessionStorage.getItem(TAB_WORKSPACE_KEY)).toBe('4'); // precondition
    store.getState().logout();
    expect(store.getState().selectedOrganizationId).toBeNull();
    expect(window.sessionStorage.getItem(TAB_WORKSPACE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LAST_WORKSPACE_KEY)).toBeNull();
  });
});
