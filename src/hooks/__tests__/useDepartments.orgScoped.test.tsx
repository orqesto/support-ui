/**
 * Departments are per-workspace, so the query cache entry must be too.
 *
 * `['departments']` alone kept serving workspace A's list for the five-minute staleTime
 * after an in-place org switch, so workspace B's threads wore A's department labels.
 * `useTicketsCount` and `useNotificationCounts` already key on the org. Audit u40 #7.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  type State = { user: null; selectedOrganizationId: number | null };
  const useAuthStore = create<State>(() => ({ user: null, selectedOrganizationId: 1 }));
  return { useAuthStore };
});

const getAll = vi.fn();
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => getAll() as unknown },
}));

const { useDepartments } = await import('../useDepartments');
const { useAuthStore } = await import('@/stores/authStore');

const deptsOf = (orgId: number) => [{ id: orgId * 10, name: `Dept of org ${orgId}` }];

beforeEach(() => {
  getAll.mockReset();
  getAll.mockImplementation(() =>
    Promise.resolve(deptsOf(useAuthStore.getState().selectedOrganizationId ?? 0))
  );
  useAuthStore.setState({ selectedOrganizationId: 1 });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('useDepartments — cache keyed on the selected organization', () => {
  it('THE FIX: an in-place org switch fetches that workspace’s departments', async () => {
    const { result } = renderHook(() => useDepartments(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(deptsOf(1)));

    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 2 });
    });

    // Unkeyed, this stayed at org 1's list — fresh within staleTime, so no second call.
    await waitFor(() => expect(result.current.data).toEqual(deptsOf(2)));
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it('CONTROL: the same organization is served from cache', async () => {
    const { result, rerender } = renderHook(() => useDepartments(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(deptsOf(1)));
    rerender();
    expect(getAll).toHaveBeenCalledTimes(1);
  });
});
