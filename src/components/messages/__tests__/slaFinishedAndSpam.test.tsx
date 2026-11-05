/**
 * No running SLA clock on a finished ticket, none at all on spam (owner decisions 2026-09-24).
 *
 * Prod before this: 34 resolved/closed tickets nobody answered kept an SLA clock counting up in
 * red (the renderers checked `resolved` but not `closed`, and the detail chip checked neither),
 * and ODL-HR-1 — closed, answered 5 h late on a 1 h target — showed a red progress bar that reads
 * as a live countdown. Spam carried SLA too.
 *
 * All three renderers are covered: the detail chip (`computeSlaInfo`), the card text
 * (`getSlaCardText`) and the full-mode row badge (`MessageSignalBadges`, rendered).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { computeSlaInfo, getSlaCardText, slaClockRuns } from '../inboxCardHelpers';
import { MessageSignalBadges } from '../MessageSignalBadges';
import type { Message } from '@/types';

vi.mock('@/services/category.service', () => ({
  categoryService: { getCategories: () => Promise.resolve([]) },
}));
vi.mock('@/services/settings.service', () => ({
  labelService: { getLabels: () => Promise.resolve([]) },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = Date.parse('2026-09-24T12:00:00Z');
const HOUR = 60 * 60 * 1000;

/** Opened 3 h ago on a 60-minute clock, the customer waiting, nobody answered. */
const thread = (over: Partial<Message> = {}): Message =>
  ({
    id: 1,
    status: 'open',
    slaResponseMinutes: 60,
    slaResponseBreached: false,
    firstResponseAt: null,
    lastReplyFromClient: true,
    lastReplyAt: null,
    createdAt: new Date(NOW - 3 * HOUR).toISOString(),
    metadata: { receivedAt: new Date(NOW - 3 * HOUR).toISOString() },
    ...over,
  }) as unknown as Message;

describe('slaClockRuns — the one rule', () => {
  it.each(['resolved', 'closed', 'filtered'] as const)('no clock on %s', (status) => {
    expect(slaClockRuns(thread({ status }))).toBe(false);
  });

  it('no clock on spam (the server flag)', () => {
    expect(slaClockRuns(thread({ isSpam: true }))).toBe(false);
  });

  it('CONTROL: an open customer thread runs', () => {
    expect(slaClockRuns(thread())).toBe(true);
  });
});

describe('computeSlaInfo — the detail header chip', () => {
  it('closed and never answered: NOTHING (it used to count up in red after close)', () => {
    expect(computeSlaInfo(thread({ status: 'closed' }), NOW)).toBeNull();
    expect(computeSlaInfo(thread({ status: 'resolved' }), NOW)).toBeNull();
  });

  it('closed and answered late (ODL-HR-1): a muted RECORD, "missed", no bar', () => {
    const info = computeSlaInfo(
      thread({
        status: 'closed',
        slaResponseBreached: true,
        firstResponseAt: new Date(NOW - 3 * HOUR + 5 * HOUR).toISOString(),
      }),
      NOW
    );
    expect(info).toMatchObject({
      record: true,
      breached: true,
      elapsed: 300,
      target: 60,
      barColor: '',
    });
    expect(info?.colorClasses).not.toMatch(/destructive/);
  });

  it("the record's minutes and verdict come from ONE source — the backend's recorded seconds", () => {
    // Flag says breached, but the recorded response was 18 min on a 60 min target: the record
    // must not read "18m/1h missed". The backend's own rule decides: floor(s / 60) > target.
    const info = computeSlaInfo(
      thread({
        status: 'closed',
        slaResponseBreached: true,
        actualResponseSeconds: 18 * 60,
        firstResponseAt: new Date(NOW - 2 * HOUR).toISOString(),
      }),
      NOW
    );
    expect(info).toMatchObject({ record: true, elapsed: 18, breached: false });
  });

  it('the boundary follows the backend: 60 min 59 s on a 60 min target is met', () => {
    const at = (secs: number) =>
      computeSlaInfo(
        thread({
          status: 'closed',
          actualResponseSeconds: secs,
          firstResponseAt: new Date(NOW - HOUR).toISOString(),
        }),
        NOW
      );
    expect(at(60 * 60 + 59)).toMatchObject({ elapsed: 60, breached: false });
    expect(at(61 * 60)).toMatchObject({ elapsed: 61, breached: true });
  });

  it("CONTROL: without recorded seconds the record falls back to the page's own arithmetic", () => {
    const info = computeSlaInfo(
      thread({
        status: 'closed',
        slaResponseBreached: true,
        firstResponseAt: new Date(NOW - 3 * HOUR + 5 * HOUR).toISOString(),
      }),
      NOW
    );
    expect(info).toMatchObject({ record: true, elapsed: 300, breached: true });
  });

  it('spam or filtered: nothing, even when it was answered and later closed', () => {
    const answered = { firstResponseAt: new Date(NOW - 2 * HOUR).toISOString() };
    expect(computeSlaInfo(thread({ isSpam: true }), NOW)).toBeNull();
    expect(computeSlaInfo(thread({ status: 'filtered' }), NOW)).toBeNull();
    expect(computeSlaInfo(thread({ isSpam: true, status: 'closed', ...answered }), NOW)).toBeNull();
  });

  it('CONTROL: an open unanswered thread keeps its live clock, red when breached', () => {
    const info = computeSlaInfo(thread(), NOW);
    expect(info).toMatchObject({
      record: false,
      done: false,
      elapsed: 180,
      breached: true,
      barColor: 'bg-destructive',
    });
  });

  it('CONTROL: an open answered thread keeps its coloured result', () => {
    const info = computeSlaInfo(
      thread({ firstResponseAt: new Date(NOW - 2.5 * HOUR).toISOString() }),
      NOW
    );
    expect(info).toMatchObject({
      record: false,
      done: true,
      breached: false,
      barColor: 'bg-success',
    });
  });
});

describe('computeSlaInfo — a first reply dated before the clock start', () => {
  // A merge kept the NEWER thread: received 3 h ago, but our first reply (from the folded-in
  // older thread) was 11 days ago. The page drew a negative SLA from that.
  const merged = (over: Partial<Message> = {}) =>
    thread({ firstResponseAt: new Date(NOW - 11 * 24 * HOUR).toISOString(), ...over });

  it('no chip rather than a negative number — open and finished', () => {
    expect(computeSlaInfo(merged(), NOW)).toBeNull();
    expect(computeSlaInfo(merged({ status: 'closed' }), NOW)).toBeNull();
  });

  it("the backend's recorded seconds win once it has them (timed from the first message)", () => {
    const info = computeSlaInfo(
      merged({ actualResponseSeconds: 18 * 60 * 60 } as Partial<Message>),
      NOW
    );
    expect(info).toMatchObject({ elapsed: 18 * 60, breached: true, record: false, done: true });
  });

  it('an open thread keeps the stored breach flag (judged in seconds) next to the recorded minutes', () => {
    // 3601 s on a 60-minute target: the backend says breached; the chip must not say met.
    const info = computeSlaInfo(
      merged({ actualResponseSeconds: 3601, slaResponseBreached: true } as Partial<Message>),
      NOW
    );
    expect(info).toMatchObject({ elapsed: 60, breached: true });
  });

  it('the live clock never goes negative when the arrival time is ahead of now', () => {
    const ahead = new Date(NOW + 2 * HOUR).toISOString();
    const info = computeSlaInfo(
      thread({ metadata: { receivedAt: ahead } } as Partial<Message>),
      NOW
    );
    expect(info?.elapsed).toBe(0);
  });

  it('CONTROL: an ordinary answered thread still shows its number', () => {
    const info = computeSlaInfo(
      thread({ firstResponseAt: new Date(NOW - 2.5 * HOUR).toISOString() }),
      NOW
    );
    expect(info?.elapsed).toBe(30);
  });
});

describe('getSlaCardText — the card', () => {
  // These read Date.now(); the fixtures are dated against NOW.
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  it.each(['closed', 'resolved', 'filtered'] as const)('no SLA text on %s', (status) => {
    expect(getSlaCardText(thread({ status }))).toBeNull();
  });

  it('no SLA text on spam', () => {
    expect(getSlaCardText(thread({ isSpam: true }))).toBeNull();
  });

  it('CONTROL: an open breached thread still says Breached', () => {
    expect(getSlaCardText(thread())).toMatchObject({ variant: 'breach', label: 'Breached' });
  });
});

describe('MessageSignalBadges (full) — the row badge', () => {
  // These read Date.now(); the fixtures are dated against NOW.
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });

  const slaBadge = () => screen.queryByText('SLA');

  it.each(['closed', 'resolved'] as const)('no SLA badge on a %s ticket', (status) => {
    render(<MessageSignalBadges message={thread({ status })} />);
    expect(slaBadge()).toBeNull();
  });

  it('no SLA badge on spam', () => {
    render(<MessageSignalBadges message={thread({ isSpam: true })} />);
    expect(slaBadge()).toBeNull();
  });

  it('CONTROL: an open breached thread shows it', () => {
    render(<MessageSignalBadges message={thread()} />);
    expect(slaBadge()).not.toBeNull();
  });
});
