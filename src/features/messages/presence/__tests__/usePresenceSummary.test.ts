import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { usePresenceSummaryStore } from '../presenceSummaryStore';

const fake = vi.hoisted(() => ({
  handlers: new Map<string, Set<(data: unknown) => void>>(),
  emitWithAck: null as unknown as Mock,
}));

vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({ timeout: () => ({ emitWithAck: fake.emitWithAck }), emit: vi.fn() }),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data: unknown) => void) => {
    if (!fake.handlers.has(event)) fake.handlers.set(event, new Set());
    fake.handlers.get(event)?.add(handler);
  },
  unsubscribeFromEvent: (event: string, handler: (data: unknown) => void) => {
    fake.handlers.get(event)?.delete(handler);
  },
}));

const { usePresenceSummary, SNAPSHOT_RETRY_MS, RECONNECT_RESNAPSHOT_JITTER_MS } = await import(
  '../usePresenceSummary'
);
const { SOCKET_RECONNECTED_EVENT } = await import('@/lib/socketEvents');

const fire = (event: string, data?: unknown) =>
  fake.handlers.get(event)?.forEach((handler) => handler(data));
const store = () => usePresenceSummaryStore.getState();
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const OK = { ok: true, organizationId: 1, threads: { '10': [{ userId: 7, state: 'viewing' }] } };

beforeEach(() => {
  vi.useFakeTimers();
  fake.handlers.clear();
  fake.emitWithAck = vi.fn().mockResolvedValue(OK);
  store().reset();
  useAuthStore.setState({ user: { id: 1 } as User, selectedOrganizationId: 1 });
});
afterEach(() => vi.useRealTimers());

describe('usePresenceSummary', () => {
  it('snapshots on mount and becomes available', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    expect(fake.emitWithAck).toHaveBeenCalledWith('presence:snapshot', {});
    expect(store().available).toBe(true);
    expect(store().byConversation[10]).toEqual([{ userId: 7, state: 'viewing' }]);
  });

  it('applies presence:summary changes, and an empty users list deletes the entry', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    act(() =>
      fire('presence:summary', { organizationId: 1, changes: [{ conversationId: 10, users: [] }] })
    );
    expect(10 in store().byConversation).toBe(false);
    act(() =>
      fire('presence:summary', {
        organizationId: 1,
        changes: [{ conversationId: 12, users: [{ userId: 8, state: 'writing_reply' }] }],
      })
    );
    expect(store().byConversation[12]).toHaveLength(1);
  });

  it('retries a refused snapshot at 2/5/10 s, then stops', async () => {
    fake.emitWithAck = vi.fn().mockResolvedValue({ ok: false });
    renderHook(() => usePresenceSummary());
    await flush();
    expect(store().available).toBe(false);
    for (const wait of SNAPSHOT_RETRY_MS)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(wait);
      });
    expect(fake.emitWithAck).toHaveBeenCalledTimes(1 + SNAPSHOT_RETRY_MS.length);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fake.emitWithAck).toHaveBeenCalledTimes(1 + SNAPSHOT_RETRY_MS.length);
  });

  it('a retry that succeeds makes it available', async () => {
    fake.emitWithAck = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue(OK);
    renderHook(() => usePresenceSummary());
    await flush();
    expect(store().available).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SNAPSHOT_RETRY_MS[0]);
    });
    expect(store().available).toBe(true);
  });

  it('goes unavailable on disconnect and re-snapshots on the raw connect after it', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    act(() => fire('disconnect'));
    expect(store().available).toBe(false);
    fake.emitWithAck.mockClear();
    act(() => fire('connect'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_RESNAPSHOT_JITTER_MS);
    });
    expect(fake.emitWithAck).toHaveBeenCalledTimes(1);
    expect(store().available).toBe(true);
  });

  it('re-snapshots on SOCKET_RECONNECTED_EVENT when unavailable, not when fine', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    fake.emitWithAck.mockClear();
    act(() => fire(SOCKET_RECONNECTED_EVENT));
    await flush();
    expect(fake.emitWithAck).not.toHaveBeenCalled();
    act(() => fire('disconnect'));
    act(() => fire(SOCKET_RECONNECTED_EVENT));
    await flush();
    expect(fake.emitWithAck).toHaveBeenCalledTimes(1);
  });

  it('a later refusal after success makes it unavailable again (via a reconnect snapshot)', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    act(() => fire('disconnect'));
    fake.emitWithAck = vi.fn().mockResolvedValue({ ok: false });
    act(() => fire(SOCKET_RECONNECTED_EVENT));
    await flush();
    expect(store().available).toBe(false);
  });

  it('clears the store and snapshots again when the workspace changes', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    fake.emitWithAck = vi.fn().mockResolvedValue({ ok: true, organizationId: 2, threads: {} });
    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 2 });
    });
    expect(store().byConversation).toEqual({});
    await flush();
    expect(fake.emitWithAck).toHaveBeenCalledTimes(1);
    expect(store().available).toBe(true);
  });

  it('ignores an old snapshot answer that arrives after a workspace switch', async () => {
    let release: (value: unknown) => void = () => {};
    fake.emitWithAck = vi.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    renderHook(() => usePresenceSummary());
    fake.emitWithAck.mockResolvedValue({ ok: true, organizationId: 2, threads: {} });
    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 2 });
    });
    await flush();
    await act(async () => {
      release(OK);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(store().byConversation).toEqual({});
  });

  it('does not apply a snapshot answered for the old workspace; unavailable until the matching one', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    // After the switch the server still answers from workspace 1, then from 2.
    fake.emitWithAck = vi
      .fn()
      .mockResolvedValueOnce(OK)
      .mockResolvedValue({
        ok: true,
        organizationId: 2,
        threads: { '20': [{ userId: 8, state: 'viewing' }] },
      });
    act(() => {
      useAuthStore.setState({ selectedOrganizationId: 2 });
    });
    await flush();
    expect(store().available).toBe(false);
    expect(store().byConversation).toEqual({});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SNAPSHOT_RETRY_MS[0]);
    });
    expect(store().available).toBe(true);
    expect(Object.keys(store().byConversation)).toEqual(['20']);
  });

  it('drops a summary tagged with another workspace, keeps one for this workspace', async () => {
    renderHook(() => usePresenceSummary());
    await flush();
    act(() =>
      fire('presence:summary', {
        organizationId: 2,
        changes: [{ conversationId: 12, users: [{ userId: 8, state: 'viewing' }] }],
      })
    );
    expect(12 in store().byConversation).toBe(false);
    act(() =>
      fire('presence:summary', {
        organizationId: 1,
        changes: [{ conversationId: 12, users: [{ userId: 8, state: 'viewing' }] }],
      })
    );
    expect(12 in store().byConversation).toBe(true);
  });

  it('unsubscribes and clears on unmount', async () => {
    const view = renderHook(() => usePresenceSummary());
    await flush();
    view.unmount();
    expect(fake.handlers.get('presence:summary')?.size ?? 0).toBe(0);
    expect(store().available).toBe(false);
  });
});
