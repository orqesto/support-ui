/**
 * A slow lead-state answer for customer A must not land in customer B's panel.
 *
 * The lead-state effect in `MessageDetail` was the only per-message effect without a
 * `cancelled` guard: open A (slow thread fetch), open B (fast), A answers — and B's
 * panel showed A's lead data. Audit u36 P1-13.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getThreadMessages } = vi.hoisted(() => ({ getThreadMessages: vi.fn() }));
vi.mock('@/services/message.service', () => ({
  messageService: { getThreadMessages },
}));

import { useLeadState, type LeadState } from '../useLeadState';

type ThreadResponse = { success: boolean; data: { id: number; metadata: unknown }[] };

const deferred = () => {
  let resolve!: (value: ThreadResponse) => void;
  const promise = new Promise<ThreadResponse>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const lead = (label: string) => ({ qualificationFields: { stage: label } }) as unknown as LeadState;
const thread = (label: string): ThreadResponse => ({
  success: true,
  data: [{ id: 1, metadata: { leadState: lead(label) } }],
});
const message = (id: number) => ({ id, isLead: true, metadata: {} });

afterEach(() => {
  getThreadMessages.mockReset();
});

describe('useLeadState', () => {
  it('THE FIX: ignores a late answer for the previously opened message', async () => {
    const slowA = deferred();
    getThreadMessages.mockImplementation((id: number) =>
      id === 1 ? slowA.promise : Promise.resolve(thread('B'))
    );

    const { result, rerender } = renderHook(({ msg }) => useLeadState(msg), {
      initialProps: { msg: message(1) },
    });
    rerender({ msg: message(2) });
    await waitFor(() => expect(result.current[0]).toEqual(lead('B')));

    // Customer A's thread finally answers, after B is on screen.
    await act(async () => {
      slowA.resolve(thread('A'));
      await slowA.promise;
    });

    expect(result.current[0]).toEqual(lead('B'));
    expect(getThreadMessages).toHaveBeenCalledTimes(2);
  });

  it('CONTROL: the open message’s own answer is applied', async () => {
    getThreadMessages.mockResolvedValue(thread('A'));
    const { result } = renderHook(() => useLeadState(message(1)));
    await waitFor(() => expect(result.current[0]).toEqual(lead('A')));
  });

  it('CONTROL: a message that is not a lead has no lead state and no fetch', () => {
    const { result } = renderHook(() => useLeadState({ id: 3, isLead: false, metadata: {} }));
    expect(result.current[0]).toBeNull();
    expect(getThreadMessages).not.toHaveBeenCalled();
  });
});
