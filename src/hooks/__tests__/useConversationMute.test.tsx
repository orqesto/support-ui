/** The mute hook: optimistic, newest call wins, revert on failure, reset per thread. */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { toast } from '@/lib/toast';
import { useConversationMute, CALL_TIMEOUT_MS } from '../useConversationMute';

const mute = vi.hoisted(() => ({ setThreadMute: vi.fn() }));
vi.mock('@/services/message.service', () => ({
  messageService: { setThreadMute: mute.setThreadMute },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));

describe('useConversationMute', () => {
  it('is unavailable without an initial value', () => {
    const { result } = renderHook(() => useConversationMute(1, undefined));
    expect(result.current.available).toBe(false);
  });

  it('flips at once and reverts with a toast when the call fails', async () => {
    mute.setThreadMute.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useConversationMute(1, false));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.toggle();
    });
    expect(result.current.muted).toBe(true);
    await act(async () => pending);
    expect(result.current.muted).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it('a double click ends in the last state asked for', async () => {
    mute.setThreadMute.mockReset();
    const resolvers: Array<(v: boolean) => void> = [];
    mute.setThreadMute.mockImplementation(
      () => new Promise<boolean>((resolve) => resolvers.push(resolve))
    );
    const { result } = renderHook(() => useConversationMute(1, false));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.toggle();
    });
    act(() => {
      second = result.current.toggle();
    });
    expect(result.current.muted).toBe(false);
    // The second request is not sent while the first is in flight: the server cannot apply them
    // in the opposite order.
    await waitFor(() => expect(mute.setThreadMute).toHaveBeenCalledTimes(1));
    expect(mute.setThreadMute).toHaveBeenLastCalledWith(1, true);
    await act(async () => {
      resolvers[0](true);
      await first;
    });
    await waitFor(() => expect(mute.setThreadMute).toHaveBeenCalledTimes(2));
    expect(mute.setThreadMute).toHaveBeenLastCalledWith(1, false);
    await act(async () => {
      resolvers[1](false);
      await second;
    });
    expect(result.current.muted).toBe(false);
  });

  it('shows the mute as off at once when the backend ends it (resolved / assigned to me)', () => {
    const { result, rerender } = renderHook(({ ends }) => useConversationMute(1, true, { ended: ends }), {
      initialProps: { ends: false },
    });
    expect(result.current.muted).toBe(true);
    rerender({ ends: true });
    expect(result.current.muted).toBe(false);
  });

  it('CONTROL: a thread that already starts in an ending state keeps the mute the backend reports', () => {
    const { result } = renderHook(() => useConversationMute(1, true, { ended: true }));
    expect(result.current.muted).toBe(true);
  });

  it('resets to the new thread when the conversation changes', () => {
    mute.setThreadMute.mockResolvedValue(true);
    const { result, rerender } = renderHook(({ id, init }) => useConversationMute(id, init), {
      initialProps: { id: 1, init: false as boolean | undefined },
    });
    act(() => {
      void result.current.toggle();
    });
    expect(result.current.muted).toBe(true);
    rerender({ id: 2, init: false });
    expect(result.current.muted).toBe(false);
  });

  it('muted, then closed/filtered/resolved (the backend deletes the mute), then open again: NOT muted', () => {
    const { result, rerender } = renderHook(({ gone }) => useConversationMute(1, true, { ended: gone }), {
      initialProps: { gone: false },
    });
    expect(result.current.muted).toBe(true);
    rerender({ gone: true }); // filtered
    expect(result.current.muted).toBe(false);
    rerender({ gone: false }); // opened again
    expect(result.current.muted).toBe(false);
  });

  it('a 409 (finished thread) shows a toast, reads the thread again, and sends no second mute call', async () => {
    mute.setThreadMute.mockReset();
    vi.mocked(toast.error).mockClear();
    mute.setThreadMute.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const onReconcile = vi.fn();
    const { result } = renderHook(() => useConversationMute(1, false, { onReconcile }));
    await act(async () => {
      await result.current.toggle();
    });
    expect(toast.error).toHaveBeenCalledWith("Finished threads can't be muted.");
    expect(onReconcile).toHaveBeenCalledTimes(1);
    expect(result.current.muted).toBe(false);
    await act(async () => {
      await result.current.toggle();
    });
    expect(mute.setThreadMute).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: any other failure keeps the generic toast and allows another try', async () => {
    mute.setThreadMute.mockReset();
    vi.mocked(toast.error).mockClear();
    mute.setThreadMute.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const { result } = renderHook(() => useConversationMute(1, false));
    await act(async () => {
      await result.current.toggle();
      await result.current.toggle();
    });
    expect(mute.setThreadMute).toHaveBeenCalledTimes(2);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe('Could not mute this thread');
  });

  it('a mute call that answers after the backend ended the mute asks for a re-read', async () => {
    mute.setThreadMute.mockReset();
    let release: (v: boolean) => void = () => {};
    mute.setThreadMute.mockImplementation(() => new Promise<boolean>((resolve) => { release = resolve; }));
    const onReconcile = vi.fn();
    const { result, rerender } = renderHook(
      ({ ended }) => useConversationMute(1, false, { ended, onReconcile }),
      { initialProps: { ended: false } }
    );
    let pending: Promise<void> = Promise.resolve();
    act(() => { pending = result.current.toggle(); });
    await waitFor(() => expect(mute.setThreadMute).toHaveBeenCalledTimes(1));
    rerender({ ended: true }); // assigned to me while the call is in flight
    await act(async () => { release(true); await pending; });
    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a mute call with no ending in between asks for no re-read', async () => {
    mute.setThreadMute.mockReset();
    mute.setThreadMute.mockResolvedValue(true);
    const onReconcile = vi.fn();
    const { result } = renderHook(() => useConversationMute(1, false, { onReconcile }));
    await act(async () => { await result.current.toggle(); });
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it('a hung call gives up, tells the person, and does not block the next toggle', async () => {
    vi.useFakeTimers();
    try {
      mute.setThreadMute.mockReset();
      mute.setThreadMute.mockImplementationOnce(() => new Promise<boolean>(() => undefined));
      mute.setThreadMute.mockResolvedValue(true);
      vi.mocked(toast.error).mockClear();
      const { result } = renderHook(() => useConversationMute(1, false));
      let first: Promise<void> = Promise.resolve();
      act(() => { first = result.current.toggle(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(CALL_TIMEOUT_MS + 10); await first; });
      expect(toast.error).toHaveBeenCalled();
      expect(result.current.muted).toBe(false); // back to the last confirmed state
      await act(async () => { await result.current.toggle(); });
      expect(mute.setThreadMute).toHaveBeenCalledTimes(2); // the queue moved on
      expect(result.current.muted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
