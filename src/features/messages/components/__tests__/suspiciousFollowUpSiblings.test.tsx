/**
 * A thread parked by a suspicious FOLLOW-UP mail: the conversation's own category (a snapshot of
 * its first mail) says legitimate, and the backend's `isSuspicious` — the Suspicious queue's own
 * predicate — says suspicious. Every place that asks "is this thread suspicious?" must give the
 * same answer as the header's Approve: the Suspicious badge and the triage read/unread indicator.
 * An older backend sends no flag, and then the snapshot still decides.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Message } from '@/types';
import { isSuspiciousThread, isTriageMessage } from '@/lib/messageHelpers';

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { MessageSignalBadges } = await import('../MessageSignalBadges');

afterEach(cleanup);

const legitimate = { spamCheck: { category: 'legitimate', isSpam: false } };
const suspicious = { spamCheck: { category: 'suspicious', isSpam: false } };
const thread = (over: Partial<Message>): Message =>
  ({
    id: 5,
    sender: 'customer@example.com',
    subject: 'Order',
    status: 'open',
    createdAt: '2026-11-01T10:00:00Z',
    metadata: legitimate,
    ...over,
  }) as unknown as Message;

describe('suspicious by a follow-up mail, everywhere it is asked', () => {
  it('isSuspiciousThread: the flag first, the snapshot only without it, never when filtered', () => {
    expect(isSuspiciousThread({ status: 'open', isSuspicious: true, metadata: legitimate })).toBe(
      true
    );
    expect(isSuspiciousThread({ status: 'open', isSuspicious: false, metadata: suspicious })).toBe(
      false
    );
    expect(isSuspiciousThread({ status: 'open', metadata: suspicious })).toBe(true);
    expect(
      isSuspiciousThread({ status: 'filtered', isSuspicious: true, metadata: suspicious })
    ).toBe(false);
  });

  it('the triage read/unread indicator applies to it', () => {
    expect(isTriageMessage({ status: 'open', isSuspicious: true, metadata: legitimate })).toBe(
      true
    );
  });

  it('CONTROL: a clean thread is not triage', () => {
    expect(isTriageMessage({ status: 'open', isSuspicious: false, metadata: legitimate })).toBe(
      false
    );
  });

  it('shows the Suspicious badge', () => {
    render(<MessageSignalBadges message={thread({ isSuspicious: true })} />);
    expect(screen.getByText('Suspicious')).toBeInTheDocument();
  });

  it('CONTROL: no badge when the backend says the follow-up cleared it', () => {
    render(<MessageSignalBadges message={thread({ isSuspicious: false, metadata: suspicious })} />);
    expect(screen.queryByText('Suspicious')).toBeNull();
  });
});
