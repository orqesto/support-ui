/**
 * The processing summary reports a KB mine paused by the daily KB limit as `pausedByLimit`, apart
 * from `problems`, so the indicator says "paused". The panel it opens says the same — "KB paused"
 * (FE audit pass 16).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const { IMPORT_IDLE_MS } = await import('../ProcessingPanel');

const RESUMES = '2026-10-01T00:00:00.000Z';
const pausedRecord = (over: Partial<RunView> = {}) =>
  makeKbRun({
    id: 'kbp',
    found: 900,
    kbThreads: 300,
    kbThreadsDone: 40,
    kbPairsSaved: 3,
    active: false,
    startedAt: '2026-09-30T10:00:00.000Z',
    outcome: 'paused',
    problems: ['paused'],
    stoppedBy: 'kb_token_limit',
    resumesAt: RESUMES,
    ...over,
  });

// The summary entry for this source as the final controller writes it: its mine paused until
// RESUMES, the queue not read (null — no way back known).
const r16: ProcessingSummaryEntry = {
  sourceId: 5,
  name: 'Gmail-orders',
  type: 'gmail',
  unavailable: false,
  inProgress: 0,
  problems: 0,
  pausedByLimit: 1,
  pausedUntil: RESUMES,
  resumeWindowEnd: '2026-10-01T00:30:00.000Z',
  minePausedUntil: RESUMES,
  mineResumeWindowEnd: '2026-10-01T00:30:00.000Z',
  resumeQueued: null,
  waitingForSlot: null,
  releaseQueuedAt: null,
  resumeAdmittedAt: null,
  countCapped: false,
};

const renderPanel = async (entry: ProcessingSummaryEntry) => {
  render(
    <MemoryRouter>
      <ProcessingPanels organizationId={1} sessions={new Map()} summary={[entry]} />
    </MemoryRouter>
  );
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
  vi.setSystemTime(new Date('2026-09-30T18:00:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a run record paused at the KB limit — the panel header (BE R16)', () => {
  it('summary reports pauses apart: "KB paused", no warning — as the indicator says', async () => {
    view = untracked({ runs: [pausedRecord()] });
    await renderPanel(r16);
    expect(screen.getByText(/Mining resumes by itself after 00:00 UTC on 2026-10-01/)).toBeTruthy();
    expect(status()).toBe('KB paused');
    expect(warns()).toBe(false);
    // No count by the bell in this state, and the pause is not a problem (pass 17, NIT).
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('title')).toBe(
      'Close. The paused work continues by itself after the reset; it opens again for a new problem, or if the paused mine does not resume on time.'
    );
  });

  it('its resume time already past: "Needs attention" (the indicator warns for it too)', async () => {
    vi.setSystemTime(new Date('2026-10-01T06:00:00.000Z'));
    view = untracked({ runs: [pausedRecord()] });
    await renderPanel({ ...r16, pausedUntil: RESUMES });
    expect(screen.getByText(/it was due to resume by itself/)).toBeTruthy();
    expect(status()).toBe('Needs attention');
  });

  // BE R17 (3b34ff75): the summary says the paused mine's way back; the panel agrees with the
  // indicator — a slot wait or a queued release is not late.
  const r17 = {
    ...r16,
    resumeWindowEnd: '2026-10-01T00:30:00.000Z',
    resumeQueued: true,
    waitingForSlot: false,
    releaseQueuedAt: null,
  };
  it('R17: hours past the reset but waiting for a re-mine slot: "KB paused", worded as waiting', async () => {
    vi.setSystemTime(new Date('2026-10-01T06:00:00.000Z'));
    view = untracked({ runs: [pausedRecord()] });
    await renderPanel({ ...r17, waitingForSlot: true });
    expect(screen.getByText(/due to continue and waiting for a free slot/)).toBeTruthy();
    expect(status()).toBe('KB paused');
  });

  it('R17: a limit release queued it: "queued to continue", not late', async () => {
    vi.setSystemTime(new Date('2026-10-01T06:00:00.000Z'));
    view = untracked({ runs: [pausedRecord()] });
    // The release job is enqueued with no delay: the BE pairs it with waitingForSlot: true.
    await renderPanel({
      ...r17,
      releaseQueuedAt: '2026-10-01T05:00:00.000Z',
      waitingForSlot: true,
    });
    expect(
      screen.getByText(/a limit setting changed and mining is queued to continue/)
    ).toBeTruthy();
    expect(status()).toBe('KB paused');
  });

  // FE audit pass 17, P17-F1: the resume is spread 0–30 min after the reset.
  it('ten minutes past its resume time: still "KB paused", worded as resuming', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:10:00.000Z'));
    view = untracked({ runs: [pausedRecord()] });
    await renderPanel(r16);
    expect(screen.getByText(/resuming after 00:00 UTC/)).toBeTruthy();
    expect(screen.queryByText(/was due to resume/)).toBeNull();
    expect(status()).toBe('KB paused');
    expect(warns()).toBe(false);
  });

  it('a pause that ALSO failed conversations: "Needs attention"', async () => {
    view = untracked({
      runs: [pausedRecord({ outcome: 'failed', problems: ['paused', 'failed'] })],
    });
    await renderPanel(r16);
    expect(status()).toBe('Needs attention');
  });

  // The later run leaves the pause's problem standing only when it did not finish: a mine
  // INTERRUPTED (left `running`, not active). A finished later mine supersedes the pause.
  it('a pause a later KB run overtook: "Needs attention", not "KB paused", and said in the past', async () => {
    view = untracked({
      runs: [
        pausedRecord({
          id: 'later',
          outcome: 'running',
          active: false,
          finishedAt: null,
          problems: ['interrupted'],
          stoppedBy: null,
          resumesAt: null,
          startedAt: '2026-09-30T12:00:00.000Z',
        }),
        pausedRecord(),
      ],
    });
    await renderPanel(r16);
    expect(status()).toBe('Needs attention');
    expect(screen.getByText(/a later KB run of this mailbox has been recorded since/)).toBeTruthy();
    expect(screen.queryByText(/resumes? by itself/)).toBeNull();
  });
});

describe('an import the daily limit parked (eta paused) that stopped moving', () => {
  const parked = (eta: { state: 'paused'; stage: 'kb'; until: string } | { state: 'stalled' }) =>
    ({
      tracked: true,
      runs: [],
      kbMiningFailures: [],
      kbMiningFailuresTruncated: false,
      countCapped: false,
      runsUnavailable: false,
      run: {
        state: 'ready',
        startedAt: '2026-09-30T09:00:00.000Z',
        countedAt: '2026-09-30T09:01:00.000Z',
        total: 300,
        capped: false,
        cappedBy: null,
        query: null,
        error: null,
      },
      progress: {
        total: 300,
        capped: false,
        imported: 300,
        drained: true,
        notStored: 0,
        awaitingRouting: 0,
        unrecorded: 0,
        stages: [],
        eta,
        sampledAt: '2026-09-30T18:00:00.000Z',
      },
    }) as ImportProgress;

  it('"KB paused", not "No progress"', async () => {
    view = parked({ state: 'paused', stage: 'kb', until: '2026-10-01T00:00:00.000Z' });
    await renderPanel({ ...r16, pausedByLimit: 0, pausedUntil: null, inProgress: 1 });
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IMPORT_IDLE_MS + 60_000);
    });
    expect(screen.getByTestId('import-eta').textContent).toMatch(/^Paused at today’s AI limit/);
    expect(status()).toBe('KB paused');
  });

  it('CONTROL: a stalled import still says "No progress"', async () => {
    view = parked({ state: 'stalled' });
    await renderPanel({ ...r16, pausedByLimit: 0, pausedUntil: null, inProgress: 1 });
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IMPORT_IDLE_MS + 60_000);
    });
    expect(status()).toBe('No progress');
  });
});

/**
 * FE audit pass 17, MED P17-F2 — the panel's INFERENCE of a park: an import whose KB stage the
 * limit parked (eta `paused`) beside its mail run record with no `kbLimitPause` and `stalled`
 * (`kb.done < kb.queued` ⇒ `workRemaining`, `stalled` 30 min after it ended). The final backend
 * sends `kbLimitPause` on such a run when it finds the parked jobs (round 21 follow-up), so this
 * pins only the FE's own inference from the import eta (`kbParked`), for a record without it.
 */
describe('a parked import beside a mail run record without kbLimitPause (inference only)', () => {
  const NOW = '2026-09-30T18:00:00.000Z';
  const mailRun = (over: Partial<RunView> = {}) =>
    makeRun({
      id: 'mail-1',
      channel: 'gmail',
      startedAt: '2026-09-30T09:02:00.000Z',
      finishedAt: '2026-09-30T09:30:00.000Z',
      found: 300,
      saved: 300,
      stages: {
        decided: { queued: 300, done: 300 },
        analysis: { queued: 120, done: 120 },
        embedding: { queued: 120, done: 120 },
        kb: { queued: 180, done: 120 },
        awaitingRouting: 0,
      },
      workRemaining: true,
      problems: ['stalled'],
      ...over,
    });
  const kbEta = (until: string) => ({ state: 'paused' as const, stage: 'kb' as const, until });
  const tracked = (runs: RunView[], eta: unknown) =>
    ({
      tracked: true,
      runs,
      kbMiningFailures: [],
      kbMiningFailuresTruncated: false,
      countCapped: false,
      runsUnavailable: false,
      run: {
        state: 'ready',
        startedAt: '2026-09-30T09:00:00.000Z',
        countedAt: '2026-09-30T09:01:00.000Z',
        total: 300,
        capped: false,
        cappedBy: null,
        query: null,
        error: null,
      },
      progress: {
        total: 300,
        capped: false,
        imported: 300,
        drained: true,
        notStored: 0,
        awaitingRouting: 0,
        unrecorded: 0,
        stages: [
          {
            stage: 'imported',
            done: 300,
            total: 300,
            projected: false,
            leftover: 0,
            eta: { state: 'done' },
          },
          { stage: 'kb', done: 120, total: 180, projected: false, leftover: 0, eta },
        ],
        eta,
        sampledAt: NOW,
      },
    }) as ImportProgress;
  // The 44f0f921 summary for it: the stalled run is a problem AND in progress; no pause counted.
  const summary: ProcessingSummaryEntry = {
    ...r16,
    pausedByLimit: 0,
    pausedUntil: null,
    problems: 1,
    inProgress: 1,
  };
  const UNTIL = '2026-10-01T00:00:00.000Z';

  it('stalled on parked KB work: "KB paused" at once, the work left said truly — never "ended over 30 minutes ago"', async () => {
    vi.setSystemTime(new Date(NOW));
    view = tracked([mailRun()], kbEta(UNTIL));
    await renderPanel(summary);
    expect(screen.getByTestId('import-eta').textContent).toMatch(
      /^Paused at today’s AI limit for KB processing/
    );
    expect(status()).toBe('KB paused');
    expect(warns()).toBe(false);
    expect(screen.queryByText(/ended over 30 minutes ago/)).toBeNull();
    expect(
      screen.getByText(/its knowledge-base processing is paused at the daily AI limit/)
    ).toBeTruthy();
    expect(screen.getByTestId('run-details').textContent).toContain('KB paused');
    expect(screen.getByTestId('run-details').textContent).not.toContain('Work left');
  });

  it('before the 30 minutes (no stalled yet): "KB paused", not "Processing", and it does not open itself', async () => {
    vi.setSystemTime(new Date('2026-09-30T09:40:00.000Z'));
    view = tracked([mailRun({ problems: [] })], kbEta(UNTIL));
    await renderPanel({ ...summary, problems: 0 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.queryByTestId('processing-panel')).toBeNull();
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await act(async () => {});
    expect(status()).toBe('KB paused');
  });

  it('CONTROL: the run also owes AI analysis — that is not the pause: "Needs attention", the stalled sentence', async () => {
    vi.setSystemTime(new Date(NOW));
    view = tracked(
      [
        mailRun({
          stages: {
            decided: { queued: 300, done: 300 },
            analysis: { queued: 120, done: 80 },
            embedding: { queued: 120, done: 120 },
            kb: { queued: 180, done: 120 },
            awaitingRouting: 0,
          },
        }),
      ],
      kbEta(UNTIL)
    );
    await renderPanel(summary);
    expect(status()).toBe('Needs attention');
    expect(screen.getAllByText(/ended over 30 minutes ago/).length).toBeGreaterThan(0);
  });

  it('CONTROL: nothing parks the KB work (the import eta stalled) — "Needs attention"', async () => {
    vi.setSystemTime(new Date(NOW));
    view = tracked([mailRun()], { state: 'stalled', stage: 'kb' });
    await renderPanel(summary);
    expect(status()).toBe('Needs attention');
  });

  it('CONTROL: the park is past its grace — no longer explains the work left', async () => {
    vi.setSystemTime(new Date('2026-10-01T01:00:00.000Z'));
    view = tracked([mailRun()], kbEta(UNTIL));
    await renderPanel(summary);
    expect(status()).toBe('Needs attention');
  });
});
