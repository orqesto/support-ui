/** A kept ticket update that comes back is viewing, not writing (spec §5.1). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { resetUnsentDraftPruneForTests } from '@/lib/unsentDrafts';
import type { User } from '@/types';
import { useAgentEditStamp } from '../ticketSendGuard';
import { useUnsentTicketUpdate } from '../useUnsentTicketUpdate';

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  resetUnsentDraftPruneForTests();
  useAuthStore.setState({
    user: { id: 1 } as User,
    isAuthenticated: true,
    selectedOrganizationId: 5,
  });
});
afterEach(() => {
  vi.useRealTimers();
});

const useTicket = () => {
  const [draft, setDraft] = useState('');
  const restoredHtml = useRef<string | null>(null);
  const lastAgentEditAt = useAgentEditStamp(draft, restoredHtml);
  useUnsentTicketUpdate({
    ticketId: 9,
    draft,
    fileCount: 0,
    setDraft,
    restoredHtml,
    clearText: () => setDraft(''),
    setNotice: () => {},
  });
  return { draft, setDraft, lastAgentEditAt };
};

describe('ticket composer presence', () => {
  it('a restored update leaves no edit time (viewing); typing afterwards stamps it (writing_reply)', () => {
    const first = renderHook(useTicket);
    act(() => first.result.current.setDraft('<p>kept</p>'));
    act(() => {
      vi.advanceTimersByTime(600);
    });
    first.unmount();

    const again = renderHook(useTicket);
    expect(again.result.current.draft).toBe('<p>kept</p>');
    // No edit time ⇒ presence computes viewing (computePresenceState needs one to say writing).
    expect(again.result.current.lastAgentEditAt.current).toBeNull();
    act(() => again.result.current.setDraft('<p>kept and more</p>'));
    expect(again.result.current.lastAgentEditAt.current).not.toBeNull();
  });
});
