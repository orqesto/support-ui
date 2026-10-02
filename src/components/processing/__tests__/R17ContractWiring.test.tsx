/**
 * BE R17 (be-toklim-wt 3b34ff75): the processing summary sends `resumeWindowEnd` (the reset + the
 * 30-min wake spread), `resumeQueued` / `waitingForSlot` / `releaseQueuedAt` for the paused mine;
 * a mail run whose only owed work the KB limit holds carries `kbLimitPause` and no `stalled`.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pausePhase, resumePhase } from '@/lib/utcClock';
import { normaliseSummary, type RunView } from '@/services/importProgress.service';
import { ProcessingIndicator } from '../ProcessingIndicator';
import { describePause, isParkedByKbLimit, parkedWorkSentence } from '../processingWords';
import { makeKbRun } from './fixtures';

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
const at = (iso: string) => vi.setSystemTime(new Date(iso));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('2026-10-01T18:00:00.000Z');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The summary entry exactly as the final controller (getProcessingSummary) writes it for a source
// whose mine is paused until RESET (with `pausedByLimit: 2`, a held mail run of the same reset too).
const r17 = (over: Record<string, unknown>) =>
  normaliseSummary([
    {
      sourceId: 1,
      name: 'Orders',
      type: 'gmail',
      unavailable: false,
      inProgress: 0,
      problems: 0,
      pausedByLimit: 1,
      pausedUntil: RESET,
      resumeWindowEnd: WINDOW_END,
      minePausedUntil: RESET,
      mineResumeWindowEnd: WINDOW_END,
      resumeQueued: true,
      waitingForSlot: false,
      releaseQueuedAt: null,
      resumeAdmittedAt: null,
      countCapped: false,
      ...over,
    },
  ]);
const label = () => screen.getByTestId('processing-indicator').getAttribute('aria-label');
const warns = () =>
  screen.getByTestId('processing-indicator').querySelector('.text-warning') !== null;

describe('resumeWindowEnd replaces the FE grace when sent', () => {
  it('35 min after the reset: late against a 30-min window, still resuming on the 45-min grace', () => {
    const now = Date.parse('2026-10-02T00:35:00.000Z');
    expect(resumePhase(RESET, now, WINDOW_END)).toBe('late');
    expect(resumePhase(RESET, now)).toBe('resuming');
    expect(resumePhase(RESET, now, null)).toBe('resuming');
  });

  it('inside the window: resuming', () => {
    expect(resumePhase(RESET, Date.parse('2026-10-02T00:20:00.000Z'), WINDOW_END)).toBe('resuming');
  });

  it('a release outranks every phase; a slot wait is not late; neither when unknown (null)', () => {
    const late = Date.parse('2026-10-02T03:00:00.000Z');
    expect(pausePhase(RESET, late, { releaseQueuedAt: '2026-10-01T19:00:00.000Z' })).toBe('queued');
    expect(pausePhase(RESET, late, { resumeWindowEnd: WINDOW_END, waitingForSlot: true })).toBe(
      'waiting'
    );
    expect(pausePhase(RESET, late, { resumeWindowEnd: WINDOW_END, waitingForSlot: null })).toBe(
      'late'
    );
    // Before the reset a slot wait does not apply: ahead.
    expect(
      pausePhase(RESET, Date.parse('2026-10-01T18:00:00.000Z'), { waitingForSlot: true })
    ).toBe('ahead');
  });
});

describe('ProcessingIndicator — R17 summary', () => {
  it('names mail checks too (pausedByLimit counts held mail runs) and says the reset', () => {
    render(<ProcessingIndicator entries={r17({})} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 mail check or mine paused at today’s AI limit; it resumes by itself after 00:00 UTC (09:00 your time), or sooner once the limit is raised'
    );
  });

  it('three hours past the reset, waiting for a re-mine slot: waiting its turn, no warning', () => {
    at('2026-10-02T03:00:00.000Z');
    render(<ProcessingIndicator entries={r17({ waitingForSlot: true })} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit is due to continue and waits for a free slot'
    );
    expect(warns()).toBe(false);
  });

  // FE audit pass 18: the slot wait is the MINE's (kbResumeJobs) — said of the mine, never of the
  // held mail runs counted beside it. Inside the wake window: past it the backend no longer counts
  // the held mail run at all.
  it('a slot wait beside a held mail run: the wait is said of the one mine only', () => {
    at('2026-10-02T00:20:00.000Z');
    render(
      <ProcessingIndicator
        entries={r17({ waitingForSlot: true, pausedByLimit: 2 })}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time); 1 knowledge-base mine paused at the daily AI limit is due to continue and waits for a free slot'
    );
  });

  // The BE pair past the due time: no slot wait means the resume job is gone (resumeQueued false).
  // Past the window end it is still stuck, never the softer "has not resumed yet" (pass 19, LOW).
  it('CONTROL: the same time with no slot wait and no resume queued reads stuck, with a warning', () => {
    at('2026-10-02T03:00:00.000Z');
    render(<ProcessingIndicator entries={r17({ resumeQueued: false })} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit has no resume queued and will not continue by itself; re-mine the mailbox to continue'
    );
    expect(warns()).toBe(true);
  });

  it('CONTROL: past the window with the queue not known (null) — late, not stuck', () => {
    at('2026-10-02T03:00:00.000Z');
    render(<ProcessingIndicator entries={r17({ resumeQueued: null })} onOpen={vi.fn()} />);
    expect(label()).toMatch(/was due to resume at .* and has not resumed yet$/);
    expect(warns()).toBe(true);
  });

  it('35 min after the reset with the window ended at 30: late (the backend’s window, not the grace)', () => {
    at('2026-10-02T00:35:00.000Z');
    render(<ProcessingIndicator entries={r17({ resumeQueued: null })} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit; it was due to resume at 00:00 UTC on 2026-10-02 (09:00 your time) and has not resumed yet'
    );
  });

  it('inside the backend’s window: resuming, no warning', () => {
    at('2026-10-02T00:20:00.000Z');
    render(<ProcessingIndicator entries={r17({})} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time)'
    );
    expect(warns()).toBe(false);
  });

  // A release follows any limit save that leaves nothing pausing: no cause claimed (pass 18). The
  // release job is enqueued with no delay, so the BE pairs it with waitingForSlot: true.
  it('a limit release queued it: "queued to continue", not a resume at the reset', () => {
    render(
      <ProcessingIndicator
        entries={r17({ releaseQueuedAt: '2026-10-01T17:50:00.000Z', waitingForSlot: true })}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit; a limit setting changed and it is queued to continue'
    );
  });

  // The queued bucket holds only the mine (one per mailbox): older runs left uncounted add no
  // mine, so the line carries no floor (pass 22, NIT).
  it('a capped count: the queued line names the one mine, with no floor', () => {
    render(
      <ProcessingIndicator
        entries={r17({
          releaseQueuedAt: '2026-10-01T17:50:00.000Z',
          waitingForSlot: true,
          countCapped: true,
        })}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit; a limit setting changed and it is queued to continue'
    );
  });

  it('an unreadable entry beside a paused one: the muted icon, not the pause icon', () => {
    const entries = normaliseSummary([
      ...r17({}),
      {
        sourceId: 2,
        name: 'Billing',
        type: 'imap',
        unavailable: true,
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
      },
    ]);
    render(<ProcessingIndicator entries={entries} onOpen={vi.fn()} />);
    expect(label()).toMatch(/; 1 mailbox's recent checks could not be read$/);
    expect(screen.queryByTestId('processing-indicator-paused')).toBeNull();
    expect(warns()).toBe(false);
  });
});

// FE audit pass 18, LOW: past the reset with no resume of the mine queued, nothing brings it back.
describe('a counted mine with no resume queued (resumeQueued: false)', () => {
  it('inside the window: said as stuck, with a warning — not "resuming"', () => {
    at('2026-10-02T00:10:00.000Z');
    render(<ProcessingIndicator entries={r17({ resumeQueued: false })} onOpen={vi.fn()} />);
    expect(label()).toBe(
      '1 knowledge-base mine paused at the daily AI limit has no resume queued and will not continue by itself; re-mine the mailbox to continue'
    );
    expect(warns()).toBe(true);
  });

  it('only the mine is stuck: a held mail run beside it keeps its own phase', () => {
    at('2026-10-02T00:10:00.000Z');
    render(
      <ProcessingIndicator
        entries={r17({ resumeQueued: false, pausedByLimit: 2 })}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (09:00 your time); 1 knowledge-base mine paused at the daily AI limit has no resume queued and will not continue by itself; re-mine the mailbox to continue'
    );
  });

  it('CONTROL: its resume queued — resuming, no warning', () => {
    at('2026-10-02T00:10:00.000Z');
    render(<ProcessingIndicator entries={r17({ resumeQueued: true })} onOpen={vi.fn()} />);
    expect(label()).toMatch(/; resuming after 00:00 UTC/);
    expect(warns()).toBe(false);
  });

  it('CONTROL: before the reset (the job may not be written yet) — not stuck', () => {
    render(<ProcessingIndicator entries={r17({ resumeQueued: false })} onOpen={vi.fn()} />);
    expect(label()).toMatch(/resumes by itself after 00:00 UTC/);
    expect(warns()).toBe(false);
  });
});

// A mail run as runsView writes it at 3b34ff75: owes only KB work the limit holds.
const heldRun = (over: Partial<RunView> = {}): RunView => ({
  id: 'run-1',
  channel: 'gmail',
  startedAt: '2026-10-01T17:00:00.000Z',
  finishedAt: '2026-10-01T17:05:00.000Z',
  found: 300,
  saved: 300,
  duplicates: 0,
  failed: 0,
  deferred: false,
  stoppedBy: null,
  linked: 0,
  fetchMs: 1000,
  processMs: 2000,
  outcome: 'done',
  stages: {
    decided: { queued: 300, done: 300 },
    analysis: { queued: 180, done: 180 },
    embedding: { queued: 180, done: 180 },
    kb: { queued: 180, done: 120 },
    awaitingRouting: 0,
  },
  workRemaining: true,
  active: false,
  problems: [],
  kbEntries: { qaPairs: 0, documents: 0 },
  kbLimitPause: { until: RESET, resumeWindowEnd: WINDOW_END },
  ...over,
});

describe('a mail run the backend says the KB limit holds (kbLimitPause)', () => {
  it('is parked by the backend’s own word, with no park seen elsewhere', () => {
    expect(isParkedByKbLimit(heldRun(), false)).toBe(true);
    // CONTROL: without it (and no park seen) it is not.
    expect(isParkedByKbLimit(heldRun({ kbLimitPause: undefined }), false)).toBe(false);
  });

  it('its sentence names the reset; inside the wake window it is resuming', () => {
    expect(parkedWorkSentence(heldRun())).toBe(
      'Work is left: its knowledge-base processing is paused at the daily AI limit and continues by itself after 00:00 UTC (09:00 your time), or sooner once the limit is raised.'
    );
    expect(parkedWorkSentence(heldRun(), Date.parse('2026-10-02T00:10:00.000Z'))).toBe(
      'Work is left: its knowledge-base processing was paused at the daily AI limit and is resuming, due by 00:30 UTC (09:30 your time).'
    );
  });
});

describe('describePause with the summary’s way back', () => {
  const pausedMine = makeKbRun({
    id: 'kbp',
    found: 900,
    kbThreads: 300,
    kbThreadsDone: 40,
    outcome: 'paused',
    stoppedBy: 'kb_token_limit',
    resumesAt: RESET,
    problems: ['paused'],
    // BE kbRunViews: a KB record's workRemaining is `active` — false for a paused mine.
    workRemaining: false,
  });
  it('released: queued to continue; waiting for a slot: not late', () => {
    at('2026-10-02T03:00:00.000Z');
    expect(
      describePause(pausedMine, false, {
        releaseQueuedAt: '2026-10-02T02:00:00.000Z',
        waitingForSlot: true,
      })
    ).toBe(
      'Paused by the daily AI limit for KB processing; a limit setting changed and mining is queued to continue.'
    );
    expect(describePause(pausedMine, false, { waitingForSlot: true })).toBe(
      'Paused by the daily AI limit for KB processing; it is due to continue and waiting for a free slot.'
    );
    // CONTROL: nothing known — late, as before.
    expect(describePause(pausedMine, false)).toMatch(/it was due to resume by itself at/);
  });
});

// FE audit pass 18, LOW: the summary's `resumeWindowEnd` is the LATEST over the mailbox; a record
// is judged by its own window (its resumesAt + 30 min), never by a held mail run's.
describe('describePause judges a record by its own wake window', () => {
  const way = {
    resumeWindowEnd: WINDOW_END,
    resumeQueued: null,
    waitingForSlot: false,
    releaseQueuedAt: null,
  };
  const stale = makeKbRun({
    id: 'kbp',
    outcome: 'paused',
    stoppedBy: 'kb_token_limit',
    resumesAt: '2026-10-01T00:00:00.000Z',
    problems: ['paused'],
    // BE kbRunViews: a KB record's workRemaining is `active` — false for a paused mine.
    workRemaining: false,
  });
  it('a mine due a day earlier is late at 00:10, not resuming in today’s window', () => {
    at('2026-10-02T00:10:00.000Z');
    expect(describePause(stale, false, way)).toBe(
      'Paused by the daily AI limit for KB processing; it was due to resume by itself at 00:00 UTC on 2026-10-01 (09:00 your time).'
    );
  });
  it('CONTROL: today’s own record at 00:10 is resuming', () => {
    at('2026-10-02T00:10:00.000Z');
    expect(describePause({ ...stale, resumesAt: RESET }, false, way)).toBe(
      'Paused by the daily AI limit for KB processing; resuming after 00:00 UTC (09:00 your time).'
    );
  });
  // Said as the indicator says it, with the way out (pass 19, NIT).
  const STUCK =
    'Paused by the daily AI limit for KB processing; it has no resume queued and will not continue by itself. Re-mine the mailbox to continue.';
  it('no resume queued inside its window: stuck; CONTROL queued: resuming', () => {
    at('2026-10-02T00:10:00.000Z');
    const today = { ...stale, resumesAt: RESET };
    expect(describePause(today, false, { ...way, resumeQueued: false })).toBe(STUCK);
    expect(describePause(today, false, { ...way, resumeQueued: true })).toMatch(/resuming after/);
  });
  it('no resume queued past its window: still stuck, not "was due" (pass 19, LOW)', () => {
    at('2026-10-02T03:00:00.000Z');
    const today = { ...stale, resumesAt: RESET };
    expect(describePause(today, false, { ...way, resumeQueued: false })).toBe(STUCK);
    // CONTROL: not known — late, with its date.
    expect(describePause(today, false, way)).toMatch(/it was due to resume by itself at 00:00 UTC/);
  });
});
