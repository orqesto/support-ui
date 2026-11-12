/**
 * One "is this thread spam now" rule everywhere (owner 2026-11-13): the NEWEST inbound mail's
 * verdict, plus a person's confirmation while the thread is still in the Spam lane (`filtered`).
 * A confirmed thread that is back in work with a clean newest mail wears no spam mark anywhere and
 * runs its SLA clock; one still in the Spam lane keeps "Spam · confirmed" (staging 2026-10-13).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';
import {
  computeSlaInfo,
  getRiskSignals,
  getSpine,
  isSpamThread,
  slaClockRuns,
} from '../inboxCardHelpers';
import { deriveThreadFlags } from '../messageDetail/threadFlags';
import { MessageSignalBadges } from '../MessageSignalBadges';

const confirmedAt = '2026-11-01T10:00:00Z';
const msg = (over: Record<string, unknown>): Message =>
  ({
    id: 1,
    channel: 'email',
    sender: 'customer@example.com',
    subject: 'Order question',
    createdAt: '2026-11-02T10:00:00Z',
    slaResponseMinutes: 60,
    slaWaitStartedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    lastReplyFromClient: true,
    metadata: { spamCheck: { isSpam: true, category: 'spam' } },
    ...over,
  }) as unknown as Message;
const thread = { lastReplyFromClient: true } as unknown as MessageThread;
const spamSignal = (row: Message) => getRiskSignals(row).find((signal) => signal.key === 'spam');

describe('a confirmed thread back in work whose newest mail is clean', () => {
  const backInWork = msg({ status: 'open', isSpam: false, spamConfirmedAt: confirmedAt });

  it('is not spam: no card mark, no red spine, no badge, not flagged in the detail', () => {
    expect(isSpamThread(backInWork)).toBe(false);
    expect(spamSignal(backInWork)).toBeUndefined();
    expect(getSpine(backInWork, thread)).not.toBe('red');
    expect(deriveThreadFlags(backInWork).isSpamFlaggedOutsideTriage).toBe(false);
    render(<MessageSignalBadges message={backInWork} />);
    expect(screen.queryByText(/^Spam/)).toBeNull();
  });

  it('runs its SLA clock as normal', () => {
    expect(slaClockRuns(backInWork)).toBe(true);
    expect(computeSlaInfo(backInWork)).not.toBeNull();
  });
});

describe('CONTROL: a confirmed thread still in the Spam lane', () => {
  const inLane = msg({ status: 'filtered', isSpam: false, spamConfirmedAt: confirmedAt });

  it('keeps "Spam · confirmed" and the red spine, and no SLA clock', () => {
    expect(isSpamThread(inLane)).toBe(true);
    expect(spamSignal(inLane)?.label).toBe('Spam · confirmed');
    expect(getSpine(inLane, thread)).toBe('red');
    expect(slaClockRuns(inLane)).toBe(false);
  });

  it('CONTROL: a thread whose newest mail is spam is spam in any status', () => {
    const newestSpam = msg({ status: 'open', isSpam: true, spamConfirmedAt: null });
    expect(isSpamThread(newestSpam)).toBe(true);
    expect(deriveThreadFlags(newestSpam).isSpamFlaggedOutsideTriage).toBe(true);
  });
});
