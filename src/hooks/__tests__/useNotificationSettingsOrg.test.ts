import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fetchSettings = vi.fn<() => Promise<unknown>>();
vi.mock('@/services/notificationSettingsService', () => ({
  fetchNotificationSettings: () => fetchSettings(),
  saveNotificationSettings: (lines: Record<string, unknown>) => saveSettings(lines),
  resetNotificationSettings: vi.fn(),
}));
const saveSettings = vi.fn<(lines: Record<string, unknown>) => Promise<unknown>>();
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

  it('a save that answers after a switch does not show the old workspace lines in the new one', async () => {
    fetchSettings.mockResolvedValueOnce({
      role: 'support',
      legacy: false,
      lines: [{ key: 'a', value: false }],
    });
    const hook = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(hook.result.current.settings?.lines).toHaveLength(1));
    let release: (value: unknown) => void = () => {};
    saveSettings.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = hook.result.current.save({ a: true });
    });
    fetchSettings.mockResolvedValueOnce({
      role: 'moderator',
      legacy: false,
      lines: [{ key: 'z', value: 1 }],
    });
    org = 2;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.settings?.role).toBe('moderator'));
    await act(async () => {
      release({ role: 'support', legacy: false, lines: [{ key: 'a', value: true }] });
      await saving;
    });
    expect(hook.result.current.settings?.role).toBe('moderator');
    expect(hook.result.current.settings?.lines.map((line) => line.key)).toEqual(['z']);
  });

  it('a late save from the old workspace does not clear the new workspace in-flight count', async () => {
    const lineA = (value: unknown) => ({
      key: 'a', value, default: null, source: 'own', locked: false, alwaysOn: false,
    });
    const snap = (value: unknown, bValue: unknown) => ({
      role: 'support', legacy: false,
      lines: [lineA(value), { ...lineA(bValue), key: 'b' }],
    });
    fetchSettings.mockResolvedValueOnce(snap(0, 0));
    const hook = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(hook.result.current.settings?.lines).toHaveLength(2));
    const value = (key: string) => hook.result.current.settings?.lines.find((line) => line.key === key)?.value;
    // A save of "a" starts in workspace 1 and hangs.
    let releaseOld: (reply: unknown) => void = () => {};
    saveSettings.mockReturnValueOnce(new Promise((resolve) => { releaseOld = resolve; }));
    let savingOld: Promise<unknown> = Promise.resolve();
    act(() => { savingOld = hook.result.current.save({ a: 1 }); });
    // Switch to workspace 2, which shows a=5, and start a save of "a" there that also hangs.
    fetchSettings.mockResolvedValueOnce(snap(5, 0));
    org = 2;
    hook.rerender();
    await waitFor(() => expect(value('a')).toBe(5));
    let releaseNew: (reply: unknown) => void = () => {};
    saveSettings.mockReturnValueOnce(new Promise((resolve) => { releaseNew = resolve; }));
    let savingNew: Promise<unknown> = Promise.resolve();
    act(() => { savingNew = hook.result.current.save({ a: 6 }); });
    // The old workspace's save answers late: it must not count as the new "a" save having settled.
    await act(async () => {
      releaseOld(snap(1, 0));
      await savingOld;
    });
    // Another save in workspace 2 answers with a stale "a" while the new "a" save is in flight.
    saveSettings.mockResolvedValueOnce(snap(0, 9));
    await act(async () => {
      await hook.result.current.save({ b: 9 });
    });
    expect(value('b')).toBe(9);
    expect(value('a')).toBe(5); // not the stale 0
    await act(async () => {
      releaseNew(snap(6, 9));
      await savingNew;
    });
    expect(value('a')).toBe(6);
  });
});
