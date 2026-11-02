/**
 * The search the thread list showed, per browser TAB and workspace. Not in the URL (it is routinely
 * a customer's address), so a remount of the list lost it — on a phone, open a result and Back.
 * Tab storage keeps it out of history, links and logs. Restored only when the agent goes BACK to
 * the list inside the app (useMessagesUrlSync), never on a full page load or a pasted link, and
 * forgotten at sign-out so the next person on this tab does not get it (release review).
 */
const PREFIX = 'threads.search.';

const keyFor = (organizationId: number | null | undefined): string | null =>
  organizationId ? `${PREFIX}${organizationId}` : null;

export const rememberSearch = (organizationId: number | null | undefined, search: string): void => {
  const key = keyFor(organizationId);
  if (!key) return;
  try {
    if (search.trim()) sessionStorage.setItem(key, search);
    else sessionStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode): the search is simply not restored.
  }
};

export const recalledSearch = (organizationId: number | null | undefined): string | null => {
  const key = keyFor(organizationId);
  if (!key) return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

/** Sign-out: every workspace's remembered search on this tab. */
export const forgetRememberedSearches = (): void => {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Nothing stored, nothing to forget.
  }
};
