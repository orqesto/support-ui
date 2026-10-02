/**
 * FE audit pass 18 — the panel against the R17 backend (be-toklim-wt 3b34ff75): a mail run the
 * backend itself says the KB limit holds (`kbLimitPause`), the 30-min wake window applied to each
 * record's own resume time, and a run panel closing once its run owes only parked work.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import type {
  ImportProgress,
  ProcessingSummaryEntry,
  RunView,
} from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { makeKbRun, makeRun, untracked } from './fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

let view: ImportProgress = untracked();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: () => Promise.resolve({ ...view }),
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('../ProcessingPanels');
const { AUTO_CLOSE_MS } = await import('../ProcessingPanel');

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

// The R17 summary entry exactly as getProcessingSummary writes it.
const r17 = (over: Partial<ProcessingSummaryEntry> = {}): ProcessingSummaryEntry => ({
  sourceId: 5,
  name: 'Gmail-orders',
  type: 'gmail',
  unavailable: false,
  inProgress: 0,
  problems: 0,
  pausedByLimit: 1,
  pausedUntil: RESET,
  resumeWindowEnd: WINDOW_END,
  resumeQueued: null,
  waitingForSlot: null,
  releaseQueuedAt: null,
  countCapped: false,
  ...over,
});

// A mail run as runsView writes it at 3b34ff75: it owes only KB work the limit holds.
const heldRun = (over: Partial<RunView> = {}): RunView =>
  makeRun({
    id: 'run-1',
    startedAt: '2026-10-01T17:00:00.000Z',
    finishedAt: '2026-10-01T17:05:00.000Z',
    found: 300,
    saved: 300,
    stages: {
      decided: { queued: 300, done: 300 },
      analysis: { queued: 180, done: 180 },
      embedding: { queued: 180, done: 180 },
      kb: { queued: 180, done: 120 },
      awaitingRouting: 0,
    },
    workRemaining: true,
    kbLimitPause: { until: RESET, resumeWindowEnd: WINDOW_END },
    ...over,
  });
const pausedMine = (resumesAt: string) =>
  makeKbRun({
    id: 'kbp',
    found: 900,
    kbThreads: 300,
    kbThreadsDone: 40,
    startedAt: '2026-09-30T10:00:00.000Z',
    outcome: 'paused',
    problems: ['paused'],
    stoppedBy: 'kb_token_limit',
    resumesAt,
    // BE kbRunViews: a KB record's workRemaining is `active` — false for a paused mine.
    workRemaining: false,
  });

const renderPanel = async (entry: ProcessingSummaryEntry) => {
  render(
    <MemoryRouter>
      <ProcessingPanels organizationId={1} sessions={new Map()} summary={[entry]} />
    </MemoryRouter>
  );
  await act(async () => {});
};
const openManually = async () => {
  act(() => useProcessingPanelStore.getState().open(5, 'manual'));
  await act(async () => {});
};
const status = () => screen.getByTestId('panel-status').textContent;
const warns = () =>
  screen.getByTestId('processing-panel').querySelector('svg.text-warning') !== null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a mail run the R17 backend says the KB limit holds, rendered', () => {
  it('an untracked mailbox: "KB paused", its dated sentence and badge — no warning', async () => {
    view = untracked({ runs: [heldRun()] });
    await renderPanel(r17());
    await openManually();
    expect(status()).toBe('KB paused');
    expect(warns()).toBe(false);
    const details = screen.getByTestId('run-details').textContent;
    expect(details).toContain('continues by itself after 00:00 UTC (09:00 your time)');
    expect(details).toContain('KB paused');
  });

  it('CONTROL: the same run with no hold seen anywhere is not called paused', async () => {
    view = untracked({ runs: [heldRun({ kbLimitPause: undefined })] });
    await renderPanel(r17({ pausedByLimit: 0, inProgress: 1 }));
    await openManually();
    expect(status()).not.toBe('KB paused');
    expect(screen.getByTestId('run-details').textContent).not.toContain(
      'continues by itself after 00:00 UTC'
    );
  });
});

// The backend drops the hold at the reset + 30 min and marks the run stalled; the panel used the
// 45-min FE grace for the mine's own time and kept "KB paused" for 15 min over it.
describe('the wake window of a mine record is the backend’s 30 min', () => {
  const stalledRun = () => heldRun({ kbLimitPause: undefined, problems: ['stalled'] });
  const summary = r17({
    problems: 1,
    inProgress: 1,
    resumeQueued: true,
    waitingForSlot: true,
  });

  it('00:35: the stalled mail run is not "KB paused" — "Needs attention", as the indicator', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:35:00.000Z'));
    view = untracked({ runs: [stalledRun(), pausedMine(RESET)] });
    await renderPanel(summary);
    expect(status()).toBe('Needs attention');
  });

  it('CONTROL: 00:20, inside the window — "KB paused"', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:20:00.000Z'));
    view = untracked({ runs: [stalledRun(), pausedMine(RESET)] });
    await renderPanel(summary);
    expect(status()).toBe('KB paused');
  });
});

// The socket session's KB pause is judged by ITS own wake window too (reset + 30 min from an R17+
// backend), not the FE's 45-min grace — the `own()` at the session push in kbParkTimes had no test
// (FE round 18 leftover (b)).
describe('the socket session pause is judged by its own wake window', () => {
  const session = {
    sessionKey: '5',
    integrationId: 5,
    integrationName: 'Gmail-orders',
    status: 'idle',
    total: 900,
    current: 0,
    processed: 0,
    failed: 0,
    isProcessing: false,
    progress: 0,
    stage: 'kb-processing',
    kbMessagesTotal: 900,
    kbMessagesProcessed: 100,
    kbPausedUntil: RESET,
    updatedAt: Date.parse('2026-10-01T23:00:00.000Z'),
  } as ProcessingSession;
  // No mine record, no import stage: the session is the only place the hold is seen. The R17
  // summary then counts no pause (it counts records) — its window is null, not the FE grace.
  const summary = r17({
    problems: 1,
    inProgress: 1,
    pausedByLimit: 0,
    pausedUntil: null,
    resumeWindowEnd: null,
  });
  const stalledRun = () => heldRun({ kbLimitPause: undefined, problems: ['stalled'] });
  const renderWithSession = async () => {
    render(
      <MemoryRouter>
        <ProcessingPanels
          organizationId={1}
          sessions={new Map([['5', { ...session, updatedAt: Date.now() }]])}
          summary={[summary]}
        />
      </MemoryRouter>
    );
    await act(async () => {});
    await openManually();
  };

  it('00:35: past its own window — the stalled mail run is "Needs attention"', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:35:00.000Z'));
    view = untracked({ runs: [stalledRun()] });
    await renderWithSession();
    expect(status()).toBe('Needs attention');
  });

  it('CONTROL: 00:20, inside its window — "KB paused"', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:20:00.000Z'));
    view = untracked({ runs: [stalledRun()] });
    await renderWithSession();
    expect(status()).toBe('KB paused');
  });
});

// The summary's window is the LATEST over the mailbox (here the held mail run's, today 00:30); a
// mine due a day earlier is late, not "resuming" inside today's window.
describe('a stale mine record is judged by its own window', () => {
  it('00:10 today, the mine due yesterday: "Needs attention" and the dated late line', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    view = untracked({ runs: [heldRun(), pausedMine('2026-10-01T00:00:00.000Z')] });
    await renderPanel(r17({ pausedByLimit: 2, waitingForSlot: false }));
    expect(
      screen.getByText(/it was due to resume by itself at 00:00 UTC on 2026-10-01/)
    ).toBeTruthy();
    expect(status()).toBe('Needs attention');
  });

  it('CONTROL: the mine due today at 00:10 — "KB paused", resuming', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    view = untracked({ runs: [heldRun(), pausedMine(RESET)] });
    await renderPanel(r17({ pausedByLimit: 2, waitingForSlot: false }));
    expect(screen.getByText(/resuming after 00:00 UTC/)).toBeTruthy();
    expect(status()).toBe('KB paused');
  });
});

// FE audit pass 19 (F2/F3): a mine with no resume queued past its reset is stuck — the panel warns
// and says the way out, as the indicator does.
describe('a mine record with no resume queued', () => {
  it('00:10: "Needs attention" and the stuck sentence with "Re-mine the mailbox"', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    view = untracked({ runs: [pausedMine(RESET)] });
    await renderPanel(r17({ resumeQueued: false, waitingForSlot: false }));
    expect(
      screen.getByText(
        /it has no resume queued and will not continue by itself\. Re-mine the mailbox to continue\./
      )
    ).toBeTruthy();
    expect(status()).toBe('Needs attention');
  });
});

// FE audit pass 19, LOW (F4): a limit save released the pause before the reset. The backend's own
// hold ended at once (BE R18), so the KB-only mail run is `stalled` there and the indicator warns;
// the mine record and its old reset must not call it "continues by itself after the reset".
describe('a release before the reset', () => {
  const stalledRun = () => heldRun({ kbLimitPause: undefined, problems: ['stalled'] });
  const summary = (over: Partial<ProcessingSummaryEntry> = {}) =>
    r17({
      problems: 1,
      inProgress: 1,
      resumeQueued: true,
      waitingForSlot: true,
      releaseQueuedAt: '2026-10-01T17:50:00.000Z',
      ...over,
    });

  it('the stalled mail run: "Needs attention", no "continues by itself"', async () => {
    view = untracked({ runs: [stalledRun(), pausedMine(RESET)] });
    await renderPanel(summary());
    expect(status()).toBe('Needs attention');
    expect(screen.getByTestId('processing-panel').textContent).not.toMatch(/continues by itself/);
  });

  it('with the paused socket session too: still "Needs attention"', async () => {
    view = untracked({ runs: [stalledRun(), pausedMine(RESET)] });
    render(
      <MemoryRouter>
        <ProcessingPanels
          organizationId={1}
          sessions={
            new Map([
              [
                '5',
                {
                  sessionKey: '5',
                  integrationId: 5,
                  integrationName: 'Gmail-orders',
                  status: 'idle',
                  total: 900,
                  current: 0,
                  processed: 0,
                  failed: 0,
                  isProcessing: false,
                  progress: 0,
                  stage: 'kb-processing',
                  kbMessagesTotal: 900,
                  kbMessagesProcessed: 100,
                  kbPausedUntil: RESET,
                  updatedAt: Date.now(),
                } as ProcessingSession,
              ],
            ])
          }
          summary={[summary()]}
        />
      </MemoryRouter>
    );
    await act(async () => {});
    await openManually();
    expect(status()).toBe('Needs attention');
  });

  // The real R17+ shape with no release (FE audit pass 20, NIT): the backend itself says the KB
  // limit holds the mail run (`kbLimitPause`, no `stalled`) and counts it with the mine.
  it('CONTROL: no release — the backend holds the mail run, the mine record is paused: "KB paused"', async () => {
    view = untracked({ runs: [heldRun(), pausedMine(RESET)] });
    await renderPanel(
      summary({
        releaseQueuedAt: null,
        waitingForSlot: false,
        problems: 0,
        inProgress: 0,
        pausedByLimit: 2,
      })
    );
    expect(status()).toBe('KB paused');
  });
});

describe('a run panel whose run then owes only parked KB work', () => {
  it('closes itself, as one that owes nothing does', async () => {
    view = untracked({ runs: [heldRun()] });
    await renderPanel(r17());
    act(() => useProcessingPanelStore.getState().open(5, 'run', 'run-1'));
    await act(async () => {});
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_CLOSE_MS + 1_000);
    });
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('CONTROL: a run still owing unparked work keeps its panel', async () => {
    view = untracked({
      runs: [heldRun({ kbLimitPause: undefined, finishedAt: '2026-10-01T17:55:00.000Z' })],
    });
    await renderPanel(r17({ pausedByLimit: 0, inProgress: 1 }));
    act(() => useProcessingPanelStore.getState().open(5, 'run', 'run-1'));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_CLOSE_MS + 1_000);
    });
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });
});
