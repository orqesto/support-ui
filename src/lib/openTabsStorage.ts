/*
  The open-tabs store's storage, apart from lib/openTabs so that sign-out (authStore, the socket's
  terminal sign-out — both in the main chunk) can clear it without loading the tab rules.
*/

/** The store's storage name; entries are `open-tabs:<workspace>:u<user>` (workspaceScopedStorage). */
export const OPEN_TABS_STORAGE_NAME = 'open-tabs';

/**
 * Sign-out: forget every saved tab row on this browser. Labels and subjects name customers'
 * threads, and a shared computer must not show them to the next person.
 */
export const forgetAllOpenTabs = (): void => {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key !== null && key.startsWith(`${OPEN_TABS_STORAGE_NAME}:`)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Blocked storage: nothing was saved.
  }
};
