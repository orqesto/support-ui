/**
 * The agent's draft is stored by a delayed backend job, about two minutes after the email was
 * read. The open thread said "No suggestion found" until a reload: nothing told it the draft had
 * arrived. The backend now announces the stored draft on `conversation:updated`
 * (`action: 'agent_suggestion'`); the open thread re-reads its record on that event
 * (useConversationStatusRefresh) and the ghost follows the stored draft (useGhostOption).
 *
 * An older backend sends no such event: nothing changes, the draft shows on the next read, as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import type { Message } from '@/types';

const handlers = vi.hoisted(() => new Map<string, (data: unknown) => void>());
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data: unknown) => void) => {
    handlers.set(event, handler);
  },
  unsubscribeFromEvent: (event: string) => {
    handlers.delete(event);
  },
}));

const { useConversationStatusRefresh, CONV_STATUS_REFRESH_MS } = await import(
  '@/features/messages/hooks/useConversationStatusRefresh'
);
const { useGhostOption } = await import('../useGhostOption');

const THREAD = 41;
const without = { id: THREAD, metadata: {} } as unknown as Message;
const withDraft = {
  id: THREAD,
  metadata: {
    suggestedAnswer: {
      answer: 'We are open until 18:00 on Fridays.',
      source: 'knowledge_base',
      origin: 'agent_suggestion',
    },
  },
} as unknown as Message;

/** The open thread: its record, re-read from the server on the event, and the ghost from it. */
const reads = vi.fn();
const useOpenThread = (serverHasDraft: () => boolean) => {
  const [message, setMessage] = useState<Message>(without);
  useConversationStatusRefresh(THREAD, () => {
    reads();
    setMessage(serverHasDraft() ? withDraft : without);
  });
  const { ghostOption } = useGhostOption(message, true);
  return { ghostOption };
};

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
  reads.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the delayed agent draft appears in the open thread without a reload', () => {
  it('conversation:updated (agent_suggestion) for this thread → re-read → the draft is offered', () => {
    let stored = false;
    const { result } = renderHook(() => useOpenThread(() => stored));
    expect(result.current.ghostOption).toBeNull(); // "No suggestion found"

    stored = true;
    act(() => {
      handlers.get('conversation:updated')?.({
        conversationId: THREAD,
        publicId: 'ABC-SUP-1',
        status: 'open',
        action: 'agent_suggestion',
      });
      vi.advanceTimersByTime(CONV_STATUS_REFRESH_MS);
    });
    expect(reads).toHaveBeenCalledTimes(1);
    expect(result.current.ghostOption?.answer).toBe('We are open until 18:00 on Fridays.');
  });

  it("CONTROL: another thread's draft does not touch this one", () => {
    const { result } = renderHook(() => useOpenThread(() => true));
    act(() => {
      handlers.get('conversation:updated')?.({ conversationId: 99, action: 'agent_suggestion' });
      vi.advanceTimersByTime(CONV_STATUS_REFRESH_MS * 2);
    });
    expect(reads).not.toHaveBeenCalled();
    expect(result.current.ghostOption).toBeNull();
  });

  it('an older backend that sends no event: nothing breaks, nothing is re-read', () => {
    const { result } = renderHook(() => useOpenThread(() => true));
    act(() => {
      vi.advanceTimersByTime(CONV_STATUS_REFRESH_MS * 10);
    });
    expect(reads).not.toHaveBeenCalled();
    expect(result.current.ghostOption).toBeNull();
  });
});
