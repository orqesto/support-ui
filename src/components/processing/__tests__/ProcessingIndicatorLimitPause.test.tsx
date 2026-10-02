/**
 * importProgressController `getProcessingSummary`: a KB mine paused by the daily KB token limit is
 * `pausedByLimit` with the latest `pausedUntil` (may be PAST for a stale record) and its own
 * `minePausedUntil`, and `problems` does not count it. The indicator says "paused", not "problem".
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normaliseSummary, type ProcessingSummaryEntry } from '@/services/importProgress.service';
import { ProcessingIndicator } from '../ProcessingIndicator';

let tzBefore: string | undefined;
beforeAll(() => {
  tzBefore = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
});
afterAll(() => {
  if (tzBefore === undefined) delete process.env.TZ;
  else process.env.TZ = tzBefore;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const UNTIL = '2026-10-02T00:00:00.000Z';
const windowEnd = (until: string) => new Date(Date.parse(until) + 30 * 60_000).toISOString();
// The BE entry exactly as the final controller writes it: nothing paused.
const r16 = (over: Record<string, unknown>) =>
  normaliseSummary([
    {
      sourceId: 1,
      name: 'Orders',
      type: 'gmail',
      unavailable: false,
      inProgress: 0,
      problems: 0,
      pausedByLimit: 0,
      pausedUntil: null,
      resumeWindowEnd: null,
      minePausedUntil: null,
      mineResumeWindowEnd: null,
      resumeQueued: null,
      waitingForSlot: null,
      releaseQueuedAt: null,
      resumeAdmittedAt: null,
      countCapped: false,
      ...over,
    },
  ]);
// …its KB mine paused until `until`, its resume job queued.
const mine = (until: string | null, over: Record<string, unknown> = {}) =>
  r16({
    pausedByLimit: 1,
    pausedUntil: until,
    resumeWindowEnd: until && windowEnd(until),
    minePausedUntil: until,
    mineResumeWindowEnd: until && windowEnd(until),
    resumeQueued: true,
    waitingForSlot: false,
    ...over,
  });
const label = () => screen.getByTestId('processing-indicator').getAttribute('aria-label');

describe('ProcessingIndicator — KB mines paused at the daily limit', () => {
  it('a pause alone is shown, called paused with its resume time — not a problem', () => {
    const onOpen = vi.fn();
    render(<ProcessingIndicator entries={mine(UNTIL)} onOpen={onOpen} />);
    expect(label()).toBe(
      '1 mail check or mine paused at today’s AI limit; it resumes by itself after 00:00 UTC (09:00 your time), or sooner once the limit is raised'
    );
    expect(label()).not.toMatch(/problem/);
    expect(screen.getByTestId('processing-indicator-paused')).toBeTruthy();
    fireEvent.click(screen.getByTestId('processing-indicator'));
    expect(onOpen).toHaveBeenCalledWith([1]);
  });

  // One mine per mailbox: two late mines are two mailboxes.
  it('a resume time already past is not said as still to come, and warns', () => {
    render(
      <ProcessingIndicator
        entries={[
          ...mine('2026-10-01T00:00:00.000Z'),
          ...mine('2026-10-01T00:00:00.000Z', { sourceId: 2 }),
        ]}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '2 knowledge-base mines paused at the daily AI limit; they were due to resume at 00:00 UTC on 2026-10-01 (09:00 your time) and have not resumed yet'
    );
    expect(label()).not.toMatch(/resumes? by/);
    expect(screen.queryByTestId('processing-indicator-paused')).toBeNull();
    const button = screen.getByTestId('processing-indicator');
    expect(button.querySelector('svg.text-warning')).not.toBeNull();
  });

  // FE audit pass 17, MED P17-F1: `pausedUntil` is the reset instant, but the backend spreads the
  // resume 0–30 min after it (KB_RESUME_SPREAD_MS) and may wait for a re-mine slot.
  it('ten minutes past the reset: resuming, calm — no warning, never "was due"', () => {
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    render(<ProcessingIndicator entries={mine(UNTIL)} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time)'
    );
    expect(screen.getByTestId('processing-indicator-paused')).toBeTruthy();
    expect(screen.getByTestId('processing-indicator').querySelector('svg.text-warning')).toBeNull();
  });

  it('CONTROL: an hour past the reset (beyond the wake window) it is late and warns', () => {
    vi.setSystemTime(new Date('2026-10-02T01:00:00.000Z'));
    render(<ProcessingIndicator entries={mine(UNTIL)} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit; it was due to resume at 00:00 UTC on 2026-10-02 (09:00 your time) and has not resumed yet'
    );
    expect(screen.queryByTestId('processing-indicator-paused')).toBeNull();
    expect(
      screen.getByTestId('processing-indicator').querySelector('svg.text-warning')
    ).not.toBeNull();
  });

  it('a stale record days old: the late line carries the date', () => {
    render(<ProcessingIndicator entries={mine('2026-09-27T00:00:00.000Z')} onOpen={vi.fn()} />);
    expect(label()).toMatch(/due to resume at 00:00 UTC on 2026-09-27 \(09:00 your time\)/);
  });

  it('two mailboxes paused: the LATEST resume time is the one said', () => {
    const entries = [
      ...mine('2026-10-02T00:00:00.000Z'),
      ...mine('2026-10-02T00:12:00.000Z', { sourceId: 2 }),
    ];
    render(<ProcessingIndicator entries={entries} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '2 mail checks or mines paused at today’s AI limit; they resume by themselves after 00:12 UTC (09:12 your time), or sooner once the limit is raised'
    );
  });

  it('no readable resume time: says the daily reset, invents no time', () => {
    // A held mail run, no paused mine. The final backend sends a time with every count; a time the
    // FE cannot read (normaliseSummary keeps strings only) leaves none — the fallback is for that.
    render(
      <ProcessingIndicator entries={r16({ pausedByLimit: 1, pausedUntil: 7 })} onOpen={vi.fn()} />
    );
    expect(label()).toBe(
      '1 mail check or mine paused at today’s AI limit; it resumes by itself after the daily reset, or sooner once the limit is raised'
    );
  });

  it('beside a problem, the problem keeps the count and the pause is said apart', () => {
    render(<ProcessingIndicator entries={mine(UNTIL, { problems: 1 })} onOpen={vi.fn()} />);
    expect(screen.getByTestId('processing-indicator').textContent).toBe('1');
    expect(label()).toBe(
      '1 problem to look at; 1 mail check or mine paused at today’s AI limit; it resumes by itself after 00:00 UTC (09:00 your time), or sooner once the limit is raised'
    );
  });

  // The backend from before the token limits (2d8552fb) sends no pause field at all: nothing is
  // paused there, and a problem is said as before.
  it('CONTROL: a backend from before the limits (no pause fields) — problems only', () => {
    const older = normaliseSummary([
      {
        sourceId: 1,
        name: 'Orders',
        type: 'gmail',
        unavailable: false,
        inProgress: 0,
        problems: 1,
        countCapped: false,
      },
    ]);
    expect(older[0].pausedByLimit).toBe(0);
    render(<ProcessingIndicator entries={older} onOpen={vi.fn()} />);
    expect(label()).toBe('1 problem to look at');
  });

  it('CONTROL: nothing paused, nothing else — still hidden', () => {
    const entries: ProcessingSummaryEntry[] = r16({});
    const { container } = render(<ProcessingIndicator entries={entries} onOpen={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
