/**
 * BE R18 (be-toklim-wt 2e42cf55): the processing summary sends the paused MINE's own pause
 * (`minePausedUntil` / `mineResumeWindowEnd`) beside the aggregates, which take the latest of every
 * pause; and `waitingForSlot` may be null while `resumeQueued` is true (a cut scan: not known).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { normaliseSummary } from '@/services/importProgress.service';
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
const RESET = '2026-10-02T00:00:00.000Z';
const WINDOW_END = '2026-10-02T00:30:00.000Z';
// A mail run held after today's reset: its pause is the NEXT reset — the latest of the two.
const NEXT_RESET = '2026-10-03T00:00:00.000Z';
const NEXT_WINDOW_END = '2026-10-03T00:30:00.000Z';
const at = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('2026-10-02T00:10:00.000Z');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The pause fields of a summary entry as getProcessingSummary writes them (since R18, be 2e42cf55;
// the final backend adds `resumeAdmittedAt` and `kbStateUnknown`, read here as normaliseSummary
// reads them absent): a paused mine due at today's reset and a mail run held until tomorrow's.
const r18 = (over: Record<string, unknown> = {}) =>
  normaliseSummary([
    {
      sourceId: 1,
      name: 'Orders',
      type: 'gmail',
      unavailable: false,
      inProgress: 0,
      problems: 0,
      pausedByLimit: 2,
      pausedUntil: NEXT_RESET,
      resumeWindowEnd: NEXT_WINDOW_END,
      minePausedUntil: RESET,
      mineResumeWindowEnd: WINDOW_END,
      resumeQueued: true,
      waitingForSlot: false,
      releaseQueuedAt: null,
      countCapped: false,
      ...over,
    },
  ]);
const label = () => screen.getByTestId('processing-indicator').getAttribute('aria-label');
const warns = () =>
  screen.getByTestId('processing-indicator').querySelector('.text-warning') !== null;
// The mine alone: the aggregates are its own pause.
const ONLY_MINE = { pausedByLimit: 1, pausedUntil: RESET, resumeWindowEnd: WINDOW_END };
const HELD_AHEAD =
  '1 mail check or mine paused at today’s AI limit; it resumes by itself after 00:00 UTC (09:00 your time), or sooner once the limit is raised';

describe('the mine is judged by its own pause, not the latest of all', () => {
  it('normalises the mine fields; absent (a backend from before the limits) or a non-answer is null', () => {
    expect(r18()[0]).toMatchObject({ minePausedUntil: RESET, mineResumeWindowEnd: WINDOW_END });
    const { minePausedUntil: _a, mineResumeWindowEnd: _b, ...without } = r18()[0];
    expect(normaliseSummary([without])[0]).toMatchObject({
      minePausedUntil: null,
      mineResumeWindowEnd: null,
    });
    expect(normaliseSummary([{ ...without, minePausedUntil: 7 }])[0].minePausedUntil).toBeNull();
  });

  it('a stuck mine beside a held mail run due tomorrow: said as stuck, with a warning', () => {
    render(<ProcessingIndicator entries={r18({ resumeQueued: false })} onOpen={vi.fn()} />);
    expect(label()).toBe(
      `${HELD_AHEAD}; 1 knowledge-base mine paused at the daily AI limit has no resume queued and will not continue by itself; re-mine the mailbox to continue`
    );
    expect(warns()).toBe(true);
  });

  it('a late mine beside it: the late line names the MINE’s time, not tomorrow’s', () => {
    at('2026-10-02T01:00:00.000Z');
    render(<ProcessingIndicator entries={r18()} onOpen={vi.fn()} />);
    expect(label()).toBe(
      `${HELD_AHEAD}; 1 knowledge-base mine paused at the daily AI limit; it was due to resume at 00:00 UTC on 2026-10-02 (09:00 your time) and has not resumed yet`
    );
    expect(warns()).toBe(true);
  });

  it('CONTROL: its resume queued inside its window — resuming, no warning', () => {
    render(<ProcessingIndicator entries={r18()} onOpen={vi.fn()} />);
    expect(label()).toBe(
      `${HELD_AHEAD}; 1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time)`
    );
    expect(warns()).toBe(false);
  });

  it('CONTROL: no paused mine (null) — the held runs keep their time, nothing is stuck', () => {
    render(
      <ProcessingIndicator
        entries={r18({
          pausedByLimit: 1,
          minePausedUntil: null,
          mineResumeWindowEnd: null,
          resumeQueued: null,
          waitingForSlot: null,
        })}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(HELD_AHEAD);
    expect(warns()).toBe(false);
  });
});

describe('waitingForSlot null while resumeQueued is true: not known, never "a free slot"', () => {
  it('inside the window: resuming', () => {
    render(
      <ProcessingIndicator entries={r18({ ...ONLY_MINE, waitingForSlot: null })} onOpen={vi.fn()} />
    );
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time)'
    );
  });

  it('three hours past the reset: not waiting its turn', () => {
    at('2026-10-02T03:00:00.000Z');
    render(
      <ProcessingIndicator entries={r18({ ...ONLY_MINE, waitingForSlot: null })} onOpen={vi.fn()} />
    );
    expect(label()).not.toMatch(/free slot|due to continue/);
    expect(label()).toMatch(/has not resumed yet$/);
  });

  it('CONTROL: waitingForSlot true — waiting for a free slot', () => {
    at('2026-10-02T03:00:00.000Z');
    render(
      <ProcessingIndicator entries={r18({ ...ONLY_MINE, waitingForSlot: true })} onOpen={vi.fn()} />
    );
    expect(label()).toMatch(/1 knowledge-base mine paused .* waits for a free slot$/);
  });
});

// FE audit pass 19 (F11, F12): the R18 mine branch for a release and for held runs beside the
// mine, and its own window end apart from the 45-min grace. `resumeQueued: false` reaches the
// indicator only once the summary hook has seen it persist (confirmResumeQueued) — as here.
describe('the R18 mine branch: its way back is its own, the held runs keep their time', () => {
  it('a release queued the mine (slot wait too): queued to continue', () => {
    render(
      <ProcessingIndicator
        entries={r18({
          ...ONLY_MINE,
          releaseQueuedAt: '2026-10-02T00:05:00.000Z',
          waitingForSlot: true,
        })}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit; a limit setting changed and it is queued to continue'
    );
  });

  // Both due today's reset (a held mail run's pause IS today's reset until its window ends).
  const PAIR = { pausedByLimit: 2, pausedUntil: RESET, resumeWindowEnd: WINDOW_END };
  it('no resume queued: the mine is stuck, the held run beside it is resuming', () => {
    render(
      <ProcessingIndicator entries={r18({ ...PAIR, resumeQueued: false })} onOpen={vi.fn()} />
    );
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time); 1 knowledge-base mine paused at the daily AI limit has no resume queued and will not continue by itself; re-mine the mailbox to continue'
    );
    expect(warns()).toBe(true);
  });

  it('waiting for a slot: only the mine waits; the held run wakes on the spread', () => {
    render(
      <ProcessingIndicator entries={r18({ ...PAIR, waitingForSlot: true })} onOpen={vi.fn()} />
    );
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time); 1 knowledge-base mine paused at the daily AI limit is due to continue and waits for a free slot'
    );
    expect(warns()).toBe(false);
  });

  it('00:40, resume queued: late by its own window (00:30), though the 45-min grace runs on', () => {
    at('2026-10-02T00:40:00.000Z');
    render(<ProcessingIndicator entries={r18(ONLY_MINE)} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit; it was due to resume at 00:00 UTC on 2026-10-02 (09:00 your time) and has not resumed yet'
    );
    // (No control with the mine's window null: the backend sends `minePausedUntil` and
    // `mineResumeWindowEnd` both set or both null, so the grace never stands in for a mine's.)
  });
});
