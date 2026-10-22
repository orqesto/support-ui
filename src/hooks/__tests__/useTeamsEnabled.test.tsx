/**
 * Teams on/off. The backend's `teamsEnabled` wins; an older backend that does not send it is
 * read from the active team count (1 ⇒ off, 2+ ⇒ on), so a frontend ahead of the backend
 * behaves the same.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Department } from '@/types';

vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  const useAuthStore = create(() => ({ user: null, selectedOrganizationId: 1 }));
  return { useAuthStore };
});

const get = vi.fn<(url: string) => Promise<unknown>>();
vi.mock('@/lib/api-client', () => ({ apiClient: { get: (url: string) => get(url) } }));

const { useTeamsEnabled, deriveTeamsEnabled, deriveTeamsMode, pickDefaultTeam } = await import(
  '../useTeamsEnabled'
);

const team = (id: number, extra: Partial<Department> = {}): Department => ({
  id,
  name: `Team ${id}`,
  slug: `team-${id}`,
  description: null,
  color: null,
  active: true,
  isDefault: false,
  ...extra,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => get.mockReset());

describe('deriveTeamsEnabled', () => {
  it('the backend flag wins over the count, both ways', () => {
    expect(deriveTeamsEnabled(false, [team(1), team(2), team(3)])).toBe(false);
    expect(deriveTeamsEnabled(true, [team(1)])).toBe(true);
  });

  it('old backend (no flag): one active team is off, two are on', () => {
    expect(deriveTeamsEnabled(undefined, [team(1)])).toBe(false);
    expect(deriveTeamsEnabled(undefined, [team(1), team(2)])).toBe(true);
  });

  it('old backend: an inactive team does not count', () => {
    expect(deriveTeamsEnabled(undefined, [team(1), team(2, { active: false })])).toBe(false);
  });

  it('nothing known yet (loading or failed) is "unknown", which renders as on', () => {
    expect(deriveTeamsMode(undefined, undefined)).toBe('unknown');
    expect(deriveTeamsMode(null, [team(1)])).toBe('unknown');
    expect(deriveTeamsEnabled(undefined, undefined)).toBe(true);
    expect(deriveTeamsEnabled(null, [])).toBe(true);
  });

  it('CONTROL: a known off stays off', () => {
    expect(deriveTeamsMode(false, undefined)).toBe('off');
    expect(deriveTeamsMode(undefined, [team(1)])).toBe('off');
  });
});

describe('pickDefaultTeam', () => {
  it('is the active default team, or the only active team', () => {
    expect(pickDefaultTeam([team(1), team(2, { isDefault: true })])?.id).toBe(2);
    expect(pickDefaultTeam([team(5)])?.id).toBe(5);
    expect(pickDefaultTeam([team(1), team(2)])).toBeUndefined();
  });
});

describe('useTeamsEnabled — through the real list call', () => {
  it('reads teamsEnabled from GET /api/departments', async () => {
    get.mockResolvedValue({
      data: { success: true, data: [team(1), team(2)], teamsEnabled: false },
    });
    const { result } = renderHook(() => useTeamsEnabled(), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/departments'));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('CONTROL — an older backend without the field: two active teams read as on', async () => {
    get.mockResolvedValue({ data: { success: true, data: [team(1), team(2)] } });
    const { result } = renderHook(() => useTeamsEnabled(), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
