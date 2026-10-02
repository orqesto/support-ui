/**
 * FE audit pass 9 (LOW): the bell re-reads the limit notices only once dismiss-all has ANSWERED
 * (an older backend dismissed them too). That needs `clearAll()` to stay pending until the PATCH
 * answers — a promise that settled at once let the re-read race the dismiss.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

let answerPatch: () => void = () => {};
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => Promise.resolve({ data: { data: { notifications: [], total: 0, unreadCount: 0 } } }),
    patch: () => new Promise((resolve) => (answerPatch = () => resolve({ data: {} }))),
  },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => null,
  releaseSocket: () => {},
  subscribeToEvent: () => {},
  unsubscribeFromEvent: () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 4, user: { organizationId: 4, role: 'admin' } }),
}));

const { useSLANotifications } = await import('../useSLANotifications');

describe('useSLANotifications.clearAll', () => {
  it('stays pending until the dismiss-all PATCH answers, then settles', async () => {
    const { result } = renderHook(() => useSLANotifications());
    let settled = false;
    await act(async () => {
      void result.current.clearAll().then(() => (settled = true));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    await act(async () => {
      answerPatch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(settled).toBe(true);
  });
});
