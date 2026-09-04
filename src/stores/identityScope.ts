import { useAuthStore } from '@/stores/authStore';

type AuthSnapshot = { selectedOrganizationId: number | null; user: { id: number } | null };

/**
 * The identity a cached list belongs to. Every client-side list cache must mix this
 * into its key.
 *
 * The thread and ticket caches are keyed by what the user is *looking at* — filters,
 * sorting, page, department context, board-vs-list — and twice that set was found to be
 * missing a dimension, each time after a real poisoning incident, each time fixed by
 * adding the missing dimension (`deptCtx`, then `isKanban`). The post-mortems are still
 * in the comments above `messagesCacheKey`.
 *
 * Both keys were missing the dimension that actually matters for disclosure: *who* the
 * rows belong to. The caches are in-memory only — `partialize` persists `filters` and
 * `sorting`, never `cache` — so any path that reloads the page is safe, and most are:
 * the organization switcher assigns `window.location.href`, and the 401, subscription-gate
 * and socket logout paths all do the same. Two do not. `Layout.handleLogout` calls
 * `logout()` then `navigate('/login')`, a client-side route change, and `App.tsx`'s
 * 401/403 profile-restore branch calls `logout()` and leaves routing to the guard.
 * Down either path the store module survives, so signing in as a different person in
 * the same tab could serve the previous person's threads from cache.
 *
 * Keying on identity is preferred over evicting on logout because eviction has to be
 * remembered at five call sites and this does not: a stale entry simply stops being
 * addressable, and ages out on the existing five-minute TTL. Do not "simplify" this
 * back out of a cache key — `cacheKeysAreTenantScoped.test.ts` will fail.
 */
/**
 * Run `listener` whenever the selected organization changes.
 *
 * For the stores that hold ONE global slot rather than a keyed cache — users, audit logs,
 * the current organization — keying is not available, so they evict instead. Without
 * this, an in-place org switch (the console's WorkspaceShell repoints the context on
 * mount and, since the restore fix, on unmount) painted the previous workspace's rows
 * under the new one's context for the whole refetch, and `CreateUserModal` read the
 * previous workspace's `isSystem` to decide whether to offer the global-admin role.
 *
 * Same defensive shape as `identityScope`: test files that mock `@/stores/authStore` as a
 * bare selector expose no `subscribe`, and a store module must never fail to load
 * because of that.
 */
export const onOrganizationSwitch = (listener: () => void): void => {
  const store = useAuthStore as unknown as {
    subscribe?: (fn: (state: Partial<AuthSnapshot>, prev: Partial<AuthSnapshot>) => void) => void;
  };
  if (typeof store.subscribe !== 'function') return;
  store.subscribe((state, prev) => {
    if (state.selectedOrganizationId !== prev.selectedOrganizationId) listener();
  });
};

export const identityScope = (): { org: number | null; user: number | null } => {
  // Total by construction: this runs on every list render, so it must never be the thing
  // that throws. Sixteen test files mock `@/stores/authStore` as a bare selector function
  // with no `getState`, and reaching one of those graphs used to crash the render rather
  // than return an unscoped key. Signed-out is the honest answer when identity is
  // unreadable — and it is safe, because a null identity only ever collides with another
  // null identity, which is the state in which nothing is cached.
  const store = useAuthStore as unknown as { getState?: () => Partial<AuthSnapshot> };
  if (typeof store.getState !== 'function') return { org: null, user: null };
  const { selectedOrganizationId, user } = store.getState();
  return { org: selectedOrganizationId ?? null, user: user?.id ?? null };
};
