import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fetchSettings = vi.fn<() => Promise<unknown>>();
const saveSettings = vi.fn<(lines: Record<string, unknown>) => Promise<unknown>>();
vi.mock('@/services/notificationSettingsService', () => ({
  fetchNotificationSettings: () => fetchSettings(),
  saveNotificationSettings: (lines: Record<string, unknown>) => saveSettings(lines),
  resetNotificationSettings: vi.fn(),
}));

const { useNotificationSettings } = await import('../useNotificationSettings');

const withValue = (key: string, value: unknown) => ({
  role: 'support',
  legacy: false,
  lines: [{ key, value, default: null, source: 'own', locked: false, alwaysOn: false }],
});

beforeEach(() => {
  fetchSettings.mockReset();
  saveSettings.mockReset();
  fetchSettings.mockResolvedValue(withValue('a', false));
});

describe('useNotificationSettings reply order', () => {
  it('toggle A then B, B fails: A shows its saved value', async () => {
    const hook = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(hook.result.current.settings).not.toBeNull());
    let releaseA: (value: unknown) => void = () => {};
    saveSettings.mockReturnValueOnce(new Promise((resolve) => { releaseA = resolve; }));
    saveSettings.mockRejectedValueOnce(new Error('nope'));
    let savingA: Promise<unknown> = Promise.resolve();
    let savingB: Promise<unknown> = Promise.resolve();
    act(() => {
      savingA = hook.result.current.save({ a: true });
      savingB = hook.result.current.save({ b: true }).catch(() => 'failed');
    });
    await act(async () => { await savingB; });
    await act(async () => {
      releaseA(withValue('a', true));
      await savingA;
    });
    expect(hook.result.current.settings?.lines[0].value).toBe(true);
  });

  it('CONTROL: an older reply arriving after a newer applied one is dropped', async () => {
    const hook = renderHook(() => useNotificationSettings());
    await waitFor(() => expect(hook.result.current.settings).not.toBeNull());
    let releaseA: (value: unknown) => void = () => {};
    saveSettings.mockReturnValueOnce(new Promise((resolve) => { releaseA = resolve; }));
    saveSettings.mockResolvedValueOnce(withValue('a', 'newer'));
    let savingA: Promise<unknown> = Promise.resolve();
    await act(async () => {
      savingA = hook.result.current.save({ a: 1 });
      await hook.result.current.save({ a: 2 });
    });
    await act(async () => {
      releaseA(withValue('a', 'older'));
      await savingA;
    });
    expect(hook.result.current.settings?.lines[0].value).toBe('newer');
  });
});
