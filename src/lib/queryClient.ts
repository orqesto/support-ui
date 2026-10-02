import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';

/**
 * The app's one react-query client, created here (not in main.tsx) so the identity watch below
 * can reach it.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type IdentitySnapshot = {
  user?: { id: number } | null;
  selectedOrganizationId?: number | null;
};

/**
 * Evict every cached query when the identity behind it changes: a sign-out, a sign-in as
 * someone else, or an in-place workspace switch (the console's WorkspaceShell, a shared link
 * landing in another workspace). The two client-side logout paths — the sidebar's `logout()` +
 * `navigate('/login')`, and App.tsx's 401/403 profile-restore branch — never reload the page,
 * so the cache outlived the person it belonged to: the next user in the same tab could see the
 * previous workspace's SLA breach list (customers' addresses and subjects), source names and
 * model lists until a refetch landed, up to the 5–30 minute staleTimes some keys carry (FE audit
 * 2026-09-29, E-H3). The Zustand list caches key on identity (`identityScope.ts`); react-query
 * keys are spread over dozens of files, so the one subscription here evicts instead.
 *
 * Defensive shape, as `identityScope.ts`: test files mock `@/stores/authStore` as a bare
 * selector with no `subscribe`, and loading this module must never throw there.
 */
export const evictQueriesOnIdentityChange = (client: QueryClient = queryClient): (() => void) => {
  const store = useAuthStore as unknown as {
    subscribe?: (
      fn: (state: IdentitySnapshot, prev: IdentitySnapshot) => void
    ) => (() => void) | void;
  };
  if (typeof store.subscribe !== 'function') return () => undefined;
  const unsubscribe = store.subscribe((state, prev) => {
    const userChanged = (state.user?.id ?? null) !== (prev.user?.id ?? null);
    const orgChanged =
      (state.selectedOrganizationId ?? null) !== (prev.selectedOrganizationId ?? null);
    if (userChanged || orgChanged) client.clear();
  });
  return typeof unsubscribe === 'function' ? unsubscribe : () => undefined;
};
