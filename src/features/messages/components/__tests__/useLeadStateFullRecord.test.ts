/**
 * The detail opens from the list row and the full record replaces it a moment later — the same
 * thread as a new object. The lead panel must not read the thread again for that.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getThreadMessages = vi.fn(() => Promise.resolve({ data: [] }));
vi.mock('@/services/message.service', () => ({
  messageService: { getThreadMessages: () => getThreadMessages() },
}));

const { useLeadState } = await import('../useLeadState');

const record = (
  leadState: unknown
): { id: number; isLead: boolean; metadata: Record<string, unknown> } => ({
  id: 7,
  isLead: true,
  metadata: { leadState },
});

describe('useLeadState and the full record', () => {
  it('the same lead state on a new record object reads nothing again', async () => {
    const { rerender } = renderHook(({ message }) => useLeadState(message), {
      initialProps: { message: record({ score: 2 }) },
    });
    await waitFor(() => expect(getThreadMessages).toHaveBeenCalledTimes(1));
    rerender({
      message: { ...record({ score: 2 }), metadata: { leadState: { score: 2 }, other: 1 } },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getThreadMessages).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a changed lead state reads again', async () => {
    getThreadMessages.mockClear();
    const { rerender } = renderHook(({ message }) => useLeadState(message), {
      initialProps: { message: record({ score: 2 }) },
    });
    await waitFor(() => expect(getThreadMessages).toHaveBeenCalledTimes(1));
    rerender({ message: record({ score: 5 }) });
    await waitFor(() => expect(getThreadMessages).toHaveBeenCalledTimes(2));
  });
});
