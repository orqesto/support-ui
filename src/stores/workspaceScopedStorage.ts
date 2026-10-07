import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { identityScope, onOrganizationSwitch } from '@/stores/identityScope';

/**
 * Storage for view preferences that name workspace-specific ids — a department, a label, a board
 * column, an assignee. Saved once per browser, they followed the user from one workspace into
 * another; with each browser tab now in its own workspace (`lib/tabWorkspace.ts`), a reload of
 * one tab would apply a filter set in another tab's workspace — ids that mean nothing here.
 *
 * Each workspace keeps its own entry, `<name>:<orgId>`, in localStorage, so a new tab in the
 * same workspace still opens with that workspace's last filters. With no workspace selected
 * nothing is read or written.
 *
 * An entry written under the old unscoped `<name>` is not adopted: it cannot say which workspace
 * it belonged to, so filters start from the defaults once after this change.
 */
const scopedKey = (name: string): string | null => {
  const { org } = identityScope();
  return org === null ? null : `${name}:${org}`;
};

const workspaceStateStorage: StateStorage = {
  getItem: (name) => {
    const key = scopedKey(name);
    if (key === null) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    const key = scopedKey(name);
    if (key === null) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Blocked storage: the preference lasts until reload, as it would have before.
    }
  },
  removeItem: (name) => {
    const key = scopedKey(name);
    if (key === null) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // nothing to do
    }
  },
};

export const workspaceScopedStorage = <S>() => createJSONStorage<S>(() => workspaceStateStorage);

/**
 * A switch made without a reload (the console's workspace view, a shared-link landing) loads the
 * new workspace's saved preferences — or the defaults, through the store's `merge` — instead of
 * carrying the previous workspace's ids along and then saving them under the new one.
 */
export const rehydrateOnWorkspaceSwitch = (store: {
  persist: { rehydrate: () => Promise<void> | void };
}): void => {
  onOrganizationSwitch(() => {
    void store.persist.rehydrate();
  });
};
