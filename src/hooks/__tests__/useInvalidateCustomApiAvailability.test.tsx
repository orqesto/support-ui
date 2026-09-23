import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { useCustomApiLookupCount, useInvalidateCustomApiAvailability } from '../useCustomApiLookup';

const lookupOptions = vi.fn();
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    availability: vi.fn(),
    lookupOptions: (surface: string) => lookupOptions(surface) as unknown,
  },
}));

/**
 * The settings screen drops the thread panel's cached availability through this hook (F2,
 * 2026-09-19). The components are tested with it spied; this proves the spy stands for the real
 * thing — it marks EVERY org/user/surface entry under the panel's key stale, and nothing else.
 */
describe('useInvalidateCustomApiAvailability', () => {
  it('marks every cached availability answer stale, and leaves other queries alone', () => {
    const client = new QueryClient();
    client.setQueryData(['custom-api-lookup-availability', 1, 7, 'thread'], true);
    client.setQueryData(['custom-api-lookup-availability', 1, 7, 'contact'], false);
    client.setQueryData(['conversations'], []);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useInvalidateCustomApiAvailability(), { wrapper });

    result.current();

    const stale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;
    // ⛔ RED: invalidate a different key and the panel still serves its five-minute "no".
    expect(stale(['custom-api-lookup-availability', 1, 7, 'thread'])).toBe(true);
    expect(stale(['custom-api-lookup-availability', 1, 7, 'contact'])).toBe(true);
    expect(stale(['conversations'])).toBe(false);
  });
});

describe('the Customer tab count follows a settings save (2026-09-23)', () => {
  it('refetches the runnable-lookup list when the settings screen invalidates', async () => {
    useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 7 } as User });
    lookupOptions.mockReset().mockResolvedValueOnce([{ endpointId: 1 }]);
    lookupOptions.mockResolvedValue([{ endpointId: 1 }, { endpointId: 2 }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({
        count: useCustomApiLookupCount('thread'),
        invalidate: useInvalidateCustomApiAvailability(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.count).toBe(1));

    result.current.invalidate();

    // ⛔ RED if the count lives under its own key: an admin adds a lookup, the tab says 1 for
    // five more minutes.
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(lookupOptions).toHaveBeenCalledTimes(2);
  });
});
