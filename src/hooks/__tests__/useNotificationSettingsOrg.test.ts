import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fetchSettings = vi.fn<() => Promise<unknown>>();
vi.mock('@/services/notificationSettingsService', () => ({
  fetchNotificationSettings: () => fetchSettings(),
  saveNotificationSettings: vi.fn(),
  resetNotificationSettings: vi.fn(),
}));
let org = 1;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: org, user: { organizationId: 1 } }),
}));

const { useNotificationSettings } = await import('../useNotificationSettings');

beforeEach(() => {
  fetchSettings.mockReset();
  org = 1;
});

describe('useNotificationSettings workspace switch', () => {
  it('re-fetches on a switch and does not show the previous workspace lines', async () => {
    fetchSettings.mockResolvedValueOnce({ role: 'support', legacy: false, lines: [{ key: 'a' }] });
    const hook = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(hook.result.current.settings?.lines).toHaveLength(1));

    let release: (value: unknown) => void = () => {};
    fetchSettings.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    org = 2;
    hook.rerender();
    await waitFor(() => expect(fetchSettings).toHaveBeenCalledTimes(2));
    expect(hook.result.current.settings).toBeNull();
    expect(hook.result.current.loading).toBe(true);
    await act(() => {
      release({ role: 'moderator', legacy: false, lines: [] });
      return Promise.resolve();
    });
    await waitFor(() => expect(hook.result.current.settings?.role).toBe('moderator'));
  });
});
