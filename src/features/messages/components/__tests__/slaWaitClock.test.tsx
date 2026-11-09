/**
 * The SLA clock runs from the customer's FIRST unanswered message until a PERSON replies (owner
 * 2026-11-09, backend 0230 `slaWaitStartedAt`). All three renderers read it: the detail chip
 * (`computeSlaInfo`), the card text (`getSlaCardText`) and the row badge (`MessageSignalBadges`).
 * A backend without the field keeps the old clock.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { computeSlaInfo, getSlaCardText, slaWaitClock } from '../inboxCardHelpers';
import { MessageSignalBadges } from '../MessageSignalBadges';
import type { Message } from '@/types';

vi.mock('@/features/tickets/services/category.service', () => ({
  categoryService: { getCategories: () => Promise.resolve([]) },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: { getLabels: () => Promise.resolve([]) },
}));

const NOW = Date.parse('2026-11-09T12:00:00Z');
const MIN = 60 * 1000;
const ago = (minutes: number) => new Date(NOW - minutes * MIN).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * A 60-minute SLA. The customer wrote 100 min ago, again 40 and 10 min ago; nobody answered.
 * The old clock read lastReplyAt (10 min ago) and showed nothing.
 */
const thread = (over: Partial<Message> = {}): Message =>
  ({
    id: 1,
    status: 'open',
    slaResponseMinutes: 60,
    slaResponseBreached: false,
    firstResponseAt: null,
    lastReplyFromClient: true,
    lastReplyAt: ago(10),
    createdAt: ago(100),
    metadata: { receivedAt: ago(100) },
    slaWaitStartedAt: ago(100),
    ...over,
  }) as unknown as Message;

describe('SLA clock from the first unanswered message', () => {
  it('several customer messages: breached from the FIRST, on every renderer', () => {
    const message = thread();
    expect(slaWaitClock(message, NOW)).toMatchObject({ elapsed: 100, breached: true });
    expect(getSlaCardText(message)).toMatchObject({ variant: 'breach', detail: '40m over' });
    expect(computeSlaInfo(message, NOW)).toMatchObject({
      elapsed: 100,
      breached: true,
      done: false,
    });
    render(<MessageSignalBadges message={message} />);
    expect(screen.getByText('SLA')).toBeTruthy();
  });

  it('a bot answered (firstResponseAt set) but no person: the clock still runs', () => {
    const message = thread({
      firstResponseAt: ago(95),
      lastReplyFromClient: false,
      lastReplyAt: ago(95),
    });
    expect(getSlaCardText(message)).toMatchObject({ variant: 'breach' });
    expect(computeSlaInfo(message, NOW)).toMatchObject({ breached: true, done: false });
  });

  it('at risk between 80% and 100% of the window', () => {
    const message = thread({ slaWaitStartedAt: ago(50) });
    expect(getSlaCardText(message)).toMatchObject({ variant: 'risk', detail: '10m left' });
  });

  it('breached the moment the target passes, to the second — as the backend filter decides', () => {
    // 60 min 30 s into a 60-minute clock: whole minutes said "at risk, 0m left".
    const message = thread({ slaWaitStartedAt: new Date(NOW - 60 * MIN - 30_000).toISOString() });
    expect(slaWaitClock(message, NOW)).toMatchObject({ breached: true, elapsed: 60 });
    expect(getSlaCardText(message)).toMatchObject({ variant: 'breach' });
    // CONTROL: 59 min 30 s is at risk, not breached.
    const before = thread({ slaWaitStartedAt: new Date(NOW - 59 * MIN - 30_000).toISOString() });
    expect(slaWaitClock(before, NOW)).toMatchObject({ breached: false, atRisk: true });
  });

  it('nobody waiting (null): no clock, even if the thread began long ago', () => {
    const message = thread({ slaWaitStartedAt: null, firstResponseAt: null });
    expect(slaWaitClock(message, NOW)).toBeNull();
    expect(getSlaCardText(message)).toBeNull();
    expect(computeSlaInfo(message, NOW)).toBeNull();
    render(<MessageSignalBadges message={message} />);
    expect(screen.queryByText('SLA')).toBeNull();
  });

  it('a finished thread runs no clock whatever the wait says', () => {
    const message = thread({ status: 'resolved' });
    expect(slaWaitClock(message, NOW)).toBeNull();
    expect(getSlaCardText(message)).toBeNull();
  });

  it('control — an older backend (field absent) keeps the old clock: the newest message', () => {
    const message = thread({ slaWaitStartedAt: undefined });
    expect(slaWaitClock(message, NOW)).toBeUndefined();
    // Old rule: follow-up clock from lastReplyAt (10 min) — within SLA, so no card.
    expect(getSlaCardText(message)).toBeNull();
  });
});
