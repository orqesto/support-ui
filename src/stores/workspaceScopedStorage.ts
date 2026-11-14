import { createJSONStorage, type StateStorage } from 'zustand/middleware';
import { identityScope, onIdentitySwitch } from '@/stores/identityScope';

/**
 * Storage for view preferences that name workspace-specific ids — a department, a label, a board
 * column, an assignee. Saved once per browser, they followed the user from one workspace into
 * another; with each browser tab now in its own workspace (`lib/tabWorkspace.ts`), a reload of
 * one tab would apply a filter set in another tab's workspace — ids that mean nothing here.
 *
 * Each workspace keeps its own entry per user (key below) in localStorage, so a new tab in the
 * same workspace still opens with that user's last filters. With no workspace selected nothing
 * is read or written.
 *
 * An entry written under the old unscoped `<name>` is not adopted: it cannot say which workspace
 * it belonged to, so filters start from the defaults once after this change.
 */
/**
 * The key a preference lives under: `<name>:<orgId>:u<userId>`, so two people signing in on the
 * same browser keep their own view (owner, 2026-11-11: "for this user until he changes it").
 * `<name>:<orgId>` is the earlier per-workspace key: read when the per-user one is missing, so a
 * saved view survives this change (once; the next save writes the per-user key), and used as is
 * while no user is known.
 */
const scopedKeys = (name: string): { key: string; previous: string | null } | null => {
  const { org, user } = identityScope();
  if (org === null) return null;
  const workspaceKey = `${name}:${org}`;
  return user === null
    ? { key: workspaceKey, previous: null }
    : { key: `${workspaceKey}:u${user}`, previous: workspaceKey };
};

/**
 * Raw get/set of a per-user, per-workspace preference. Also used outside zustand (the board's
 * column sorts). Blocked storage: the preference lasts until reload.
 */
export const workspaceStateStorage: StateStorage = {
  getItem: (name) => {
    const keys = scopedKeys(name);
    if (keys === null) return null;
    try {
      const own = window.localStorage.getItem(keys.key);
      if (own !== null || keys.previous === null) return own;
      return window.localStorage.getItem(keys.previous);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    const keys = scopedKeys(name);
    if (keys === null) return;
    try {
      window.localStorage.setItem(keys.key, value);
    } catch {
      // Blocked storage: the preference lasts until reload, as it would have before.
    }
  },
  removeItem: (name) => {
    const keys = scopedKeys(name);
    if (keys === null) return;
    try {
      window.localStorage.removeItem(keys.key);
    } catch {
      // nothing to do
    }
  },
};

export const workspaceScopedStorage = <S>() => createJSONStorage<S>(() => workspaceStateStorage);

/**
 * A switch made without a reload (the console's workspace view, a shared-link landing, another
 * person signing in in this tab) loads the new workspace's or person's saved preferences — or the
 * defaults, through the store's `merge` — instead of carrying the previous ones along and then
 * saving them under the new key.
 */
export const rehydrateOnWorkspaceSwitch = (store: {
  persist: { rehydrate: () => Promise<void> | void };
}): void => {
  onIdentitySwitch(() => {
    void store.persist.rehydrate();
  });
};
