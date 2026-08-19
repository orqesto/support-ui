import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

/**
 * The staff-preview rule lives in this hook so the sidebar and the route gate cannot drift
 * apart — one saying a surface is visible while the other hides it would leave a nav entry
 * pointing at an "isn't available yet" page.
 *
 * The distinction under test: `isSurfaceVisibleToMe` answers "should this viewer see it",
 * `isSurfaceEnabled` answers "is it actually launched". A global admin previewing an
 * unfinished page must never make the second one true.
 */
const getUiFlags = vi.fn<() => Promise<Record<string, boolean>>>();
vi.mock('@/services/featureFlags.service', () => ({
  featureFlagsService: { getUiFlags: () => getUiFlags() },
}));

type AuthState = {
  isAuthenticated: boolean;
  selectedOrganizationId: number | null;
  user: { role: string; organizationId: number } | null;
};
let authState: AuthState;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: AuthState) => unknown) => selector(authState),
}));

const { useUiFlags } = await import('../useUiFlags');

const asRole = (role: string) => {
  authState = {
    isAuthenticated: true,
    selectedOrganizationId: 1,
    user: { role, organizationId: 1 },
  };
};

beforeEach(() => {
  getUiFlags.mockReset();
  getUiFlags.mockResolvedValue({ 'ui.billing_intelligence': false });
  asRole('agent');
});

describe('useUiFlags', () => {
  it('reports a switched-off surface as hidden for a normal user', async () => {
    const { result } = renderHook(() => useUiFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSurfaceEnabled('ui.billing_intelligence')).toBe(false);
    expect(result.current.isSurfaceVisibleToMe('ui.billing_intelligence')).toBe(false);
    expect(result.current.isPreviewing('ui.billing_intelligence')).toBe(false);
  });

  it('lets a global admin see a switched-off surface, and marks it as a preview', async () => {
    asRole('admin');
    const { result } = renderHook(() => useUiFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSurfaceVisibleToMe('ui.billing_intelligence')).toBe(true);
    expect(result.current.isPreviewing('ui.billing_intelligence')).toBe(true);
    // The concession is visibility ONLY. Anything asking "is this launched" must still
    // get false, or a preview would read as a release.
    expect(result.current.isSurfaceEnabled('ui.billing_intelligence')).toBe(false);
  });

  it('does not mark an admin as previewing a surface that is genuinely on', async () => {
    asRole('admin');
    getUiFlags.mockResolvedValue({ 'ui.billing_intelligence': true });
    const { result } = renderHook(() => useUiFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSurfaceEnabled('ui.billing_intelligence')).toBe(true);
    expect(result.current.isPreviewing('ui.billing_intelligence')).toBe(false);
  });

  it('keeps a surface hidden for a normal user when the request fails', async () => {
    getUiFlags.mockResolvedValue({}); // the service itself fails closed
    const { result } = renderHook(() => useUiFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isSurfaceVisibleToMe('ui.billing_intelligence')).toBe(false);
  });

  it('does not call the API when unauthenticated', async () => {
    authState = { isAuthenticated: false, selectedOrganizationId: null, user: null };
    const { result } = renderHook(() => useUiFlags());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getUiFlags).not.toHaveBeenCalled();
    expect(result.current.isSurfaceVisibleToMe('ui.billing_intelligence')).toBe(false);
  });
});
