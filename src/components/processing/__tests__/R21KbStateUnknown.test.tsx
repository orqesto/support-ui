/**
 * Round 21 follow-up: the backend's final "not known" contract, wired.
 * - import eta `unknown` reason `pause_unknown` (KB stage): "finish time unknown — the KB work is
 *   not moving and whether the daily KB limit holds it is not known"; never Finished / No progress
 *   / Paused until;
 * - runs view `kbStateUnknown {reason}` on a mail run: a calm "not known" line and badge, not a
 *   problem, not processing, not paused;
 * - processing summary `kbStateUnknown: number`: a calm indicator line, outside inProgress /
 *   pausedByLimit / problems; a change of it alone makes a panel off screen ask again;
 * - normalisers keep only reasons this build knows.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ImportProgress,
  ProcessingSummaryEntry,
  RunView,
  StageEta,
} from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { makeRun, untracked } from './fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

let view: ImportProgress = untracked();
let gets = 0;
vi.mock('@/services/importProgress.service', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    importProgressService: {
      get: () => {
        gets += 1;
        return Promise.resolve({ ...view });
      },
      dismissKbFailure: () => Promise.resolve(),
    },
  };
});

const { normaliseEta, normaliseImportProgress, normaliseSummary } = await import(
  '@/services/importProgress.service'
);
const { describeEta } = await import('@/components/messages/ImportProgressPanel');
const { ProcessingPanels } = await import('../ProcessingPanels');
const { ProcessingIndicator } = await import('../ProcessingIndicator');
const { RunDetails } = await import('../RunDetails');

const PAUSE_UNKNOWN: StageEta = { state: 'unknown', reason: 'pause_unknown', stage: 'kb' };

const entry = (over: Partial<ProcessingSummaryEntry> = {}): ProcessingSummaryEntry => ({
  sourceId: 5,
  name: 'Gmail-orders',
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
  kbStateUnknown: 0,
  countCapped: false,
  ...over,
});

/** A mail run ended 40 min ago owing only KB work, as the final runs view sends it. */
const kbOnlyRun = (over: Partial<RunView> = {}): RunView =>
  makeRun({
    id: 'kbonly',
    found: 300,
    saved: 300,
    startedAt: '2026-10-01T17:00:00.000Z',
    finishedAt: '2026-10-01T17:20:00.000Z',
    workRemaining: true,
    kbStateUnknown: { reason: 'pause_unknown' },
    stages: {
      decided: { queued: 300, done: 300 },
      analysis: { queued: 300, done: 300 },
      embedding: { queued: 120, done: 120 },
      kb: { queued: 120, done: 0 },
      awaitingRouting: 0,
    },
    ...over,
  });

const tree = (summary: ProcessingSummaryEntry[]) => (
  <MemoryRouter>
    <ProcessingPanels organizationId={1} sessions={new Map()} summary={summary} />
  </MemoryRouter>
);
const status = () => screen.getByTestId('panel-status').textContent;
const openPanel = async (data: ImportProgress) => {
  view = data;
  render(tree([entry({ kbStateUnknown: 1 })]));
  act(() => useProcessingPanelStore.getState().open(5, 'manual'));
  await act(async () => {});
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
  view = untracked();
  gets = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('normalisers keep only what this build knows', () => {
  it('an unknown eta keeps reason pause_unknown; CONTROL: an unknown reason is dropped', () => {
    expect(normaliseEta(PAUSE_UNKNOWN)).toEqual(PAUSE_UNKNOWN);
    expect(
      normaliseEta({ state: 'unknown', reason: 'bogus', stage: 'kb' } as unknown as StageEta)
    ).toEqual({ state: 'unknown', stage: 'kb' });
  });

  it('a run keeps kbStateUnknown with a known reason; an unknown reason or a non-object drops it', () => {
    const runs = normaliseImportProgress({
      tracked: false,
      runs: [
        { id: 'a', kbStateUnknown: { reason: 'pause_unknown' } },
        { id: 'b', kbStateUnknown: { reason: 'limit_unreadable' } },
        { id: 'c', kbStateUnknown: { reason: 'bogus' } },
        { id: 'd', kbStateUnknown: 'yes' },
        { id: 'e' },
      ],
    }).runs;
    expect(runs[0].kbStateUnknown).toEqual({ reason: 'pause_unknown' });
    expect(runs[1].kbStateUnknown).toEqual({ reason: 'limit_unreadable' });
    expect(runs.slice(2).map((run) => 'kbStateUnknown' in run)).toEqual([false, false, false]);
  });

  it('the summary reads kbStateUnknown as a count, 0 when absent or not a number', () => {
    const [sent, absent, garbage] = normaliseSummary([
      { sourceId: 1, kbStateUnknown: 2 },
      { sourceId: 2 },
      { sourceId: 3, kbStateUnknown: 'x' },
    ]);
    expect([sent.kbStateUnknown, absent.kbStateUnknown, garbage.kbStateUnknown]).toEqual([2, 0, 0]);
  });
});

describe('import eta pause_unknown', () => {
  it('says the finish is unknown and why — never Finished, No progress or Paused', () => {
    const line = describeEta(PAUSE_UNKNOWN);
    expect(line).toBe(
      'Finish time unknown: the work for KB processing is not moving, and whether the daily KB limit is holding it is not known'
    );
    expect(line).not.toMatch(/Finished|No progress|Paused/);
  });

  const tracked = (overall: StageEta, kb: StageEta): ImportProgress =>
    ({
      ...untracked(),
      tracked: true,
      run: {
        state: 'ready',
        startedAt: '2026-10-01T08:00:00.000Z',
        countedAt: '2026-10-01T08:05:00.000Z',
        total: 500,
        capped: false,
        cappedBy: null,
        query: null,
        error: null,
      },
      progress: {
        total: 500,
        capped: false,
        imported: 500,
        drained: true,
        notStored: 0,
        awaitingRouting: 0,
        unrecorded: 0,
        stages: [
          { stage: 'imported', done: 500, total: 500, projected: false, eta: { state: 'done' } },
          { stage: 'kb', done: 100, total: 200, projected: false, eta: kb },
        ],
        eta: overall,
        sampledAt: '2026-10-01T17:59:00.000Z',
      },
    }) as ImportProgress;

  it('an import held only by it reads "Unknown" at once — not "Processing" or "No progress"', async () => {
    await openPanel(tracked(PAUSE_UNKNOWN, PAUSE_UNKNOWN));
    expect(status()).toBe('Unknown');
    expect(screen.getByTestId('import-eta').textContent).toMatch(/^Finish time unknown: the work/);
    // Said once (the overall line), not again as a stage line.
    expect(screen.queryAllByTestId('import-stage-eta')).toHaveLength(0);
  });

  it('under a capped listing’s overall line the KB stage says its own reason', async () => {
    await openPanel(tracked({ state: 'unknown', reason: 'listing_capped' }, PAUSE_UNKNOWN));
    expect(screen.getByTestId('import-stage-eta').textContent).toMatch(
      /^Finish time unknown: the work for KB processing is not moving/
    );
  });
});

describe('a mail run whose KB hold is not known (runs view kbStateUnknown)', () => {
  it('details: a calm "not known" line and badge — not "Work left", not a warning', () => {
    render(<RunDetails run={kbOnlyRun()} />);
    const line = screen.getByTestId('run-kb-unknown');
    expect(line.textContent).toBe(
      'Work is left: its knowledge-base processing is not moving, and whether the daily KB limit is holding it is not known.'
    );
    expect(line.className).not.toMatch(/text-warning/);
    expect(screen.getByText('KB not known')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.queryByText(/ended over 30 minutes ago/)).toBeNull();
  });

  it('details: limit_unreadable names the failed check', () => {
    render(<RunDetails run={kbOnlyRun({ kbStateUnknown: { reason: 'limit_unreadable' } })} />);
    expect(screen.getByTestId('run-kb-unknown').textContent).toBe(
      'Work is left: its knowledge-base processing is not moving, and the daily KB limit could not be checked, so whether it is holding that work is not known.'
    );
  });

  it('the panel reads "Unknown" — not "Processing", "Done" or "Needs attention"', async () => {
    await openPanel(untracked({ runs: [kbOnlyRun()] }));
    expect(status()).toBe('Unknown');
    // Its Close title claims no processing and no count (there is neither).
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('title')).toBe(
      'Close. The note by the bell stays while it is not known whether the daily KB limit holds this work.'
    );
  });

  // What the final backend sends without the field: a complete scan found nothing parked, so the
  // run stalls 30 min after it ended (problems ['stalled']); inside those 30 min it is still owed.
  it('CONTROL: nothing parked (the field absent, `stalled`) reads "Needs attention"', async () => {
    await openPanel(
      untracked({ runs: [kbOnlyRun({ kbStateUnknown: undefined, problems: ['stalled'] })] })
    );
    expect(status()).toBe('Needs attention');
  });

  it('CONTROL: the field absent within 30 min of its end reads "Processing"', async () => {
    await openPanel(
      untracked({
        runs: [kbOnlyRun({ kbStateUnknown: undefined, finishedAt: '2026-10-01T17:45:00.000Z' })],
      })
    );
    expect(status()).toBe('Processing');
  });

  it('an older such run under a newer check says "not known", not "still being processed"', async () => {
    const newer = makeRun({ id: 'newer', startedAt: '2026-10-01T17:50:00.000Z' });
    await openPanel(untracked({ runs: [newer, kbOnlyRun()] }));
    expect(screen.getByTestId('older-kb-unknown').textContent).toMatch(
      /^Check at .* \(300 found\): its knowledge-base processing is not moving/
    );
    expect(screen.queryByText(/is still being processed/)).toBeNull();
  });
});

describe('the indicator counts kbStateUnknown apart', () => {
  it('a calm line, no count, no warning — and it opens that mailbox', () => {
    const onOpen = vi.fn();
    render(<ProcessingIndicator entries={[entry({ kbStateUnknown: 1 })]} onOpen={onOpen} />);
    const button = screen.getByTestId('processing-indicator');
    expect(button.getAttribute('aria-label')).toBe(
      '1 mail check with knowledge-base processing not moving; whether the daily KB limit is holding it is not known'
    );
    expect(screen.getByTestId('processing-indicator-kb-unknown')).toBeTruthy();
    expect(button.querySelector('.text-warning')).toBeNull();
    expect(button.querySelector('.font-mono')).toBeNull();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith([5]);
  });

  it('CONTROL: nothing to say ⇒ hidden', () => {
    render(<ProcessingIndicator entries={[entry()]} onOpen={() => undefined} />);
    expect(screen.queryByTestId('processing-indicator')).toBeNull();
  });

  it('a panel off screen asks again when only kbStateUnknown changes; CONTROL: same entry does not', async () => {
    const { rerender } = render(tree([entry({ problems: 1 })]));
    await act(async () => {});
    const before = gets;
    rerender(tree([entry({ problems: 1 })]));
    await act(async () => {});
    expect(gets).toBe(before);
    rerender(tree([entry({ problems: 1, kbStateUnknown: 1 })]));
    await act(async () => {});
    expect(gets).toBe(before + 1);
  });
});
