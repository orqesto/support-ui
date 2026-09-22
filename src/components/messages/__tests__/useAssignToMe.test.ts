/**
 * "Assign to me" (message detail v3). The request, the no-op guard and — the part that matters
 * most — the failure path: the backend refuses an assignee outside the conversation's department,
 * and a button that swallows that reads as broken.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const assignThread = vi.fn<(threadId: string, userId: number | null) => Promise<void>>();
const toastError = vi.fn<(message: string) => void>();
vi.mock('@/services/assignment.service', () => ({
  assignmentService: {
    assignThread: (threadId: string, userId: number | null) => assignThread(threadId, userId),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: (message: string) => toastError(message) } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));

import { useAssignToMe } from '../useAssignToMe';

beforeEach(() => {
  assignThread.mockReset();
  toastError.mockReset();
});

describe('useAssignToMe', () => {
  it('assigns the conversation to the signed-in user by its conv_<id> key, then refreshes', async () => {
    assignThread.mockResolvedValue(undefined);
    const onAssigned = vi.fn();
    const { result } = renderHook(() =>
      useAssignToMe({ messageId: 42, assigneeId: null, currentUserId: 7, onAssigned })
    );
    await act(() => result.current.assignToMe());
    expect(assignThread).toHaveBeenCalledWith('conv_42', 7);
    expect(onAssigned).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('offers nothing when the conversation is already this user’s', () => {
    const { result } = renderHook(() =>
      useAssignToMe({ messageId: 42, assigneeId: 7, currentUserId: 7 })
    );
    expect(result.current.canAssign).toBe(false);
  });

  it('offers nothing when nobody is signed in', () => {
    const { result } = renderHook(() =>
      useAssignToMe({ messageId: 42, assigneeId: 3, currentUserId: null })
    );
    expect(result.current.canAssign).toBe(false);
  });

  it('CONTROL: offers it on a colleague’s conversation', () => {
    const { result } = renderHook(() =>
      useAssignToMe({ messageId: 42, assigneeId: 3, currentUserId: 7 })
    );
    expect(result.current.canAssign).toBe(true);
  });

  it('⛔ surfaces the backend’s refusal instead of swallowing it', async () => {
    // The shape an axios 4xx carries: the reason is in the response body.
    assignThread.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { error: 'User is not a member of this department' } },
    });
    const onAssigned = vi.fn();
    const { result } = renderHook(() =>
      useAssignToMe({ messageId: 42, assigneeId: null, currentUserId: 7, onAssigned })
    );
    await act(() => result.current.assignToMe());
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(String(toastError.mock.calls[0][0])).toMatch(/not a member of this department/);
    expect(onAssigned).not.toHaveBeenCalled();
    expect(result.current.assigning).toBe(false);
  });
});
