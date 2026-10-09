import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { useLookupsTab } from '../lookupsTab';

const availability = vi.fn<(surface: string) => Promise<boolean>>();
const lookupOptions = vi.fn<(surface: string) => Promise<unknown>>();
vi.mock('@/services/customApiLookup.service', () => ({
  customApiLookupService: {
    availability: (surface: string) => availability(surface),
    lookupOptions: (surface: string) => lookupOptions(surface),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  availability.mockReset();
  lookupOptions.mockReset();
  // The same store setup as MessagePanelTabs.v4order.test.tsx: the queries are keyed on the org.
  useAuthStore.setState({ selectedOrganizationId: 1, user: { id: 9 } as User });
});

describe('useLookupsTab', () => {
  it('available, counted and named from the options for that surface', async () => {
    availability.mockResolvedValue(true);
    lookupOptions.mockResolvedValue([{ category: 'order' }, { category: 'order' }]);
    const { result } = renderHook(() => useLookupsTab('contact'), { wrapper });
    await waitFor(() => expect(result.current.label).toBe('Orders'));
    expect(result.current).toEqual({ available: true, count: 2, label: 'Orders' });
    expect(lookupOptions).toHaveBeenCalledWith('contact');
    expect(availability).toHaveBeenCalledWith('contact');
  });

  it('⛔ options failing while availability says yes ⇒ still available, "Lookups", count 0', async () => {
    availability.mockResolvedValue(true);
    lookupOptions.mockRejectedValue(Object.assign(new Error('nf'), { status: 404 }));
    const { result } = renderHook(() => useLookupsTab('thread'), { wrapper });
    await waitFor(() => expect(result.current.available).toBe(true));
    await waitFor(() => expect(lookupOptions).toHaveBeenCalled());
    expect(result.current).toEqual({ available: true, count: 0, label: 'Lookups' });
  });

  it('not available ⇒ available false (the caller shows no tab)', async () => {
    availability.mockResolvedValue(false);
    lookupOptions.mockResolvedValue([]);
    const { result } = renderHook(() => useLookupsTab('thread'), { wrapper });
    await waitFor(() => expect(availability).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.available).toBe(false);
  });
});
