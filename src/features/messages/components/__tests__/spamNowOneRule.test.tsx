/**
 * One "is this thread spam now" rule everywhere (owner 2026-11-13): the backend's `isSpam`, which
 * is the Spam lane's own test (`isSpamQueue`: the newest inbound mail's junk category OR a person's
 * confirmation, on a thread not resolved or closed). A confirmed thread stays spam until approved.
 * The first mail's frozen flag is read only when an older backend sends no `isSpam`.
 *
 * Fixtures are shapes the backend sends (GET /api/messages, /api/messages/threads):
 * `isSpam`, `isSuspicious`, `latestSpamCategory` (newest mail's, falling back to the first mail's
 * copy) and `spamConfirmedAt` side by side.
 *
 * The SLA clock is NOT the spam rule: the backend's `slaClockRuns` stops only on a junk newest
 * category (and filtered/finished statuses), so a confirmed thread whose newest mail is legitimate
 * keeps its clock there, and here.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@/types';
import type { MessageThread } from '@/services/message.service';
import { isTriageMessage } from '@/lib/messageHelpers';
import { isSpamThread } from '@/lib/spamVerdict';
import { computeSlaInfo, getRiskSignals, getSpine, slaClockRuns } from '../inboxCardHelpers';
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
    isSuspicious: false,
    metadata: { spamCheck: { isSpam: false, category: 'legitimate' } },
    ...over,
  }) as unknown as Message;
const thread = { lastReplyFromClient: true } as unknown as MessageThread;
const signal = (row: Message, key: string) =>
  getRiskSignals(row).find((entry) => entry.key === key);

describe('a person-confirmed thread stays spam until approved', () => {
  // The backend sends isSpam true for it (spamConfirmedAt), whatever the newest mail's category.
  const confirmedOpen = msg({
    status: 'open',
    isSpam: true,
    spamConfirmedAt: confirmedAt,
    latestSpamCategory: 'legitimate',
  });

  it('spam on the card, the badge, the detail flags and the triage indicator', () => {
    expect(isSpamThread(confirmedOpen)).toBe(true);
    expect(signal(confirmedOpen, 'spam')?.label).toBe('Spam · confirmed');
    expect(getSpine(confirmedOpen, thread)).toBe('red');
    expect(deriveThreadFlags(confirmedOpen).isSpamFlaggedOutsideTriage).toBe(true);
    expect(isTriageMessage(confirmedOpen)).toBe(true);
    render(<MessageSignalBadges message={confirmedOpen} />);
    expect(screen.getByText('Spam · confirmed')).toBeInTheDocument();
  });

  it('review 2: its SLA clock runs, as the backend’s does (the newest category is not junk)', () => {
    expect(slaClockRuns(confirmedOpen)).toBe(true);
    expect(computeSlaInfo(confirmedOpen)).not.toBeNull();
  });

  it('review 2 CONTROL: a junk newest category stops the clock', () => {
    const junk = msg({ status: 'open', isSpam: true, latestSpamCategory: 'phishing' });
    expect(slaClockRuns(junk)).toBe(false);
    expect(computeSlaInfo(junk)).toBeNull();
  });

  it('review 2 CONTROL: an older backend (no latestSpamCategory) keeps today’s rule: no clock on spam', () => {
    const older = msg({ status: 'open', spamConfirmedAt: confirmedAt });
    expect(slaClockRuns(older)).toBe(false);
  });
});

describe('approved (confirmation cleared): not spam', () => {
  const approved = msg({
    status: 'open',
    isSpam: false,
    spamConfirmedAt: null,
    latestSpamCategory: 'legitimate',
    metadata: { spamCheck: { isSpam: true, category: 'spam' } },
  });

  it('no mark anywhere: the backend flag outranks the first mail', () => {
    expect(isSpamThread(approved)).toBe(false);
    expect(signal(approved, 'spam')).toBeUndefined();
    expect(deriveThreadFlags(approved).isSpamFlaggedOutsideTriage).toBe(false);
    expect(isTriageMessage(approved)).toBe(false);
    render(<MessageSignalBadges message={approved} />);
    expect(screen.queryByText(/^Spam/)).toBeNull();
  });

  it('review 5 CONTROL: an older backend (no isSpam) reads the first mail for triage', () => {
    expect(
      isTriageMessage(msg({ status: 'open', metadata: { spamCheck: { isSpam: true } } }))
    ).toBe(true);
  });
});

describe('review 4: the card’s Suspicious mark is the backend’s isSuspicious', () => {
  it('a thread a follow-up made suspicious (first mail legitimate) is marked', () => {
    const row = msg({ status: 'open', isSpam: false, isSuspicious: true });
    expect(signal(row, 'suspicious')).toBeDefined();
  });

  it('a first-mail suspicious verdict the backend has cleared is not marked', () => {
    const row = msg({
      status: 'open',
      isSpam: false,
      isSuspicious: false,
      metadata: { spamCheck: { isSpam: false, category: 'suspicious' } },
    });
    expect(signal(row, 'suspicious')).toBeUndefined();
  });

  it('CONTROL: an older backend (no isSuspicious) still reads the first mail', () => {
    const row = msg({
      status: 'open',
      isSuspicious: undefined,
      metadata: { spamCheck: { isSpam: false, category: 'suspicious' } },
    });
    expect(signal(row, 'suspicious')).toBeDefined();
  });
});
