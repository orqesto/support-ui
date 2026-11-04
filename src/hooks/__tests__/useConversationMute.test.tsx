/** The mute hook: optimistic, newest call wins, revert on failure, reset per thread. */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from '@/lib/toast';
import { useConversationMute } from '../useConversationMute';

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
    // Replies arrive out of order: the older one last.
    await act(async () => {
      resolvers[1](false);
      await second;
      resolvers[0](true);
      await first;
    });
    expect(result.current.muted).toBe(false);
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
});
