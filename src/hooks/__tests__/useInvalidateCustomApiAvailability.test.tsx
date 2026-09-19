import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useInvalidateCustomApiAvailability } from '../useCustomApiLookup';

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
