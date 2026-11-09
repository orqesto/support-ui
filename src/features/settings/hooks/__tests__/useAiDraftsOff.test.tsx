import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * The setting is per workspace. Switching workspace must re-ask, never carry the last answer
 * over — an agent moving from a drafts-off workspace to a normal one would otherwise lose the AI
 * actions there, and the reverse would offer a stored AI reply where drafts are off.
 */

const auth = vi.hoisted(() => ({ orgId: 1 }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ selectedOrganizationId: auth.orgId, user: { organizationId: 1 } }),
}));
const getAiDrafts = vi.fn<() => Promise<{ off: boolean }>>(() =>
  Promise.resolve({ off: auth.orgId === 1 })
);
vi.mock('@/services/organization.service', () => ({
  organizationService: { getAiDrafts: () => getAiDrafts() },
}));

import { useAiDraftsOff } from '../useAiDraftsOff';

describe('useAiDraftsOff', () => {
  it('re-reads the setting when the workspace changes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(() => useAiDraftsOff(), { wrapper });
    await waitFor(() =>
      expect(result.current).toEqual({ off: true, resolved: true, available: true })
    );

    auth.orgId = 2;
    rerender();
    await waitFor(() =>
      expect(result.current).toEqual({ off: false, resolved: true, available: true })
    );
    expect(getAiDrafts).toHaveBeenCalledTimes(2);
  });

  // The app's QueryClient switches focus refetching OFF for every query (main.tsx). A setting an
  // admin flips in another tab must still reach an agent who comes back to this one.
  it('re-reads on window focus once stale, under the app-wide "no focus refetch" default', async () => {
    auth.orgId = 1;
    getAiDrafts.mockClear();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAiDraftsOff(), { wrapper });
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(getAiDrafts).toHaveBeenCalledTimes(1);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await waitFor(() => expect(getAiDrafts).toHaveBeenCalledTimes(2));
  });
});

describe('useAiDraftsOff — failed read', () => {
  // Offering a STORED AI draft needs positive evidence that drafts are on; a 500 is not that.
  it('a 500 leaves the setting unresolved (fail closed); a 404 resolves as "no such mode"', async () => {
    const { apiError } = await import('@/test/apiError');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    getAiDrafts.mockRejectedValueOnce(await apiError(500, { error: 'boom' }));
    auth.orgId = 31;
    const failed = renderHook(() => useAiDraftsOff(), { wrapper });
    await waitFor(() => expect(getAiDrafts).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failed.result.current).toEqual({ off: false, resolved: false, available: false });

    getAiDrafts.mockRejectedValueOnce(await apiError(404, { error: 'Not found' }));
    auth.orgId = 32;
    const missing = renderHook(() => useAiDraftsOff(), { wrapper });
    await waitFor(() =>
      expect(missing.result.current).toEqual({ off: false, resolved: true, available: false })
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});
