/**
 * Names for the presence UI come from GET /api/presence/members, which any workspace member may
 * read (associates included). An older backend without it (403/404) gives "Another agent" for
 * everyone — asked once, never again on every mount. A workspace whose subscription lapsed (402) is
handled the same way.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiClient: { get } }));

const { useOrgMemberNames, UNKNOWN_AGENT_NAME } = await import('../useOrgMemberNames');

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  });

let client: QueryClient;
// The app's own default (retry: 1): the hook must turn retries off itself.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children);

beforeEach(() => {
  get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
  useAuthStore.setState({ user: { id: 1, role: 'user' } as User, selectedOrganizationId: 1 });
});

describe('useOrgMemberNames', () => {
  it('reads the names from /api/presence/members, keyed by user id', async () => {
    get.mockResolvedValue({
      data: { members: [{ id: 7, firstName: 'Anna', lastName: 'Kim' }] },
    });
    const { result } = renderHook(() => useOrgMemberNames(), { wrapper });
    await waitFor(() => expect(result.current(7).name).toBe('Anna Kim'));
    expect(get).toHaveBeenCalledWith('/api/presence/members');
    expect(result.current(7)).toMatchObject({ initials: 'AK', known: true });
  });

  it('an actor not in the list (a global admin, someone removed) is "Another agent"', async () => {
    get.mockResolvedValue({
      data: { members: [{ id: 7, firstName: 'Anna', lastName: 'Kim' }] },
    });
    const { result } = renderHook(() => useOrgMemberNames(), { wrapper });
    await waitFor(() => expect(result.current(7).known).toBe(true));
    expect(result.current(99)).toMatchObject({ name: UNKNOWN_AGENT_NAME, known: false });
  });

  it.each([402, 403, 404])(
    'an older backend or a lapsed subscription (%s): "Another agent", one request, none again on later mounts',
    async (status) => {
      get.mockRejectedValue(httpError(status));
      const first = renderHook(() => useOrgMemberNames(), { wrapper });
      await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(get).toHaveBeenCalledTimes(1); // no retry
      expect(first.result.current(7).name).toBe(UNKNOWN_AGENT_NAME);
      first.unmount();
      // Every eye, banner and tooltip mounts it again: no request each time.
      const second = renderHook(() => useOrgMemberNames(), { wrapper });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(get).toHaveBeenCalledTimes(1);
      expect(second.result.current(7).name).toBe(UNKNOWN_AGENT_NAME);
    }
  );

  it('any other failure (500): "Another agent", not retried', async () => {
    get.mockRejectedValue(httpError(500));
    const { result } = renderHook(() => useOrgMemberNames(), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(get).toHaveBeenCalledTimes(1);
    expect(result.current(7).name).toBe(UNKNOWN_AGENT_NAME);
  });

  it('keyed by workspace: another workspace asks again', async () => {
    get.mockResolvedValue({ data: { members: [] } });
    const { rerender } = renderHook(() => useOrgMemberNames(), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    useAuthStore.setState({ selectedOrganizationId: 2 });
    rerender();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(client.getQueryData(['presence-members', 2])).toEqual([]);
  });
});
