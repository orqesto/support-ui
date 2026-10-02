/**
 * FE fix round 21 (step 1), against the final backend's shapes (getProcessingSummary sends every
 * pause field on every entry; runsView as at be-toklim-wt 611607ab):
 * - F6: an admission outranks a queued release; the indicator's pause icon for admitted mines
 *   alone; a panel off screen asks again when ONLY `resumeAdmittedAt` changes; the Close title's
 *   fallbacks when no mine record is on screen, worded "only for a new problem".
 * - F7: an import held only by a daily limit that could not be checked reads "Unknown" — neither
 *   "Processing" nor "No progress".
 * - F8: a calm KB pause sentence is not in warning colour; an overdue one is.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pausePhase } from '@/lib/utcClock';
import type {
  ImportProgress,
  ProcessingSummaryEntry,
  RunView,
  StageEta,
} from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { describePause } from '../processingWords';
import { makeKbRun, makeRun, untracked } from './fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

let view: ImportProgress = untracked();
let gets = 0;
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: () => {
      gets += 1;
      return Promise.resolve({ ...view });
    },
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('../ProcessingPanels');
const { ProcessingIndicator } = await import('../ProcessingIndicator');
const { RunDetails } = await import('../RunDetails');

const RESET = '2026-10-02T00:00:00.000Z';
const WINDOW_END = '2026-10-02T00:30:00.000Z';

const pausedMine = (over: Partial<RunView> = {}) =>
  makeKbRun({
    id: 'kbp',
    found: 900,
    kbThreads: 300,
    kbThreadsDone: 40,
    startedAt: '2026-10-01T10:00:00.000Z',
    outcome: 'paused',
    problems: ['paused'],
    stoppedBy: 'kb_token_limit',
    resumesAt: RESET,
    workRemaining: false,
    active: false,
    ...over,
  });

// The summary entry as the final getProcessingSummary writes it: the mine paused until RESET,
// its resume job queued, not admitted.
const entry = (over: Partial<ProcessingSummaryEntry> = {}): ProcessingSummaryEntry => ({
  sourceId: 5,
  name: 'Gmail-orders',
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
});

const tree = (summary: ProcessingSummaryEntry[]) => (
  <MemoryRouter>
    <ProcessingPanels organizationId={1} sessions={new Map()} summary={summary} />
  </MemoryRouter>
);
const status = () => screen.getByTestId('panel-status').textContent;
const closeTitle = () => screen.getByRole('button', { name: 'Close' }).getAttribute('title');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
  view = untracked({ runs: [pausedMine()] });
  gets = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('F6: an admission is the newest fact', () => {
  it('admitted AND release-queued: resuming now, never "queued to continue"', () => {
    const way = { resumeAdmittedAt: '2026-10-01T18:00:00.000Z', releaseQueuedAt: RESET };
    expect(pausePhase(RESET, Date.now(), way)).toBe('admitted');
    expect(describePause(pausedMine(), false, way)).toBe(
      'Paused by the daily AI limit for KB processing; mining is resuming now.'
    );
  });

  it('the indicator over admitted mines alone: the pause icon, no warning', () => {
    vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
    render(
      <ProcessingIndicator
        entries={[entry({ resumeAdmittedAt: '2026-10-02T02:59:00.000Z' })]}
        onOpen={() => undefined}
      />
    );
    expect(screen.getByTestId('processing-indicator-paused')).toBeTruthy();
    expect(screen.getByTestId('processing-indicator').querySelector('.text-warning')).toBeNull();
  });
});

describe('F6: a panel asks again when only the admission changes', () => {
  it('a new resumeAdmittedAt alone asks for the runs again; CONTROL: the same entry does not', async () => {
    const { rerender } = render(tree([entry()]));
    await act(async () => {});
    const before = gets;
    rerender(tree([entry()]));
    await act(async () => {});
    expect(gets).toBe(before);
    rerender(tree([entry({ resumeAdmittedAt: '2026-10-01T18:00:00.000Z' })]));
    await act(async () => {});
    expect(gets).toBe(before + 1);
  });
});

/**
 * No mine record on screen — only a mail run whose KB work the limit holds (`kbLimitPause`) — and
 * the summary's way back: the title is worded from the way, and the panel reopens only for a new
 * problem (no mine pause is keyed apart). With no paused mine the backend sends every mine field
 * null (no way back): the title follows the parked work's times. The admitted / release-queued
 * cases are SKEW only — the summary still has a paused mine whose record this read of the runs no
 * longer lists (two reads, a few seconds apart).
 */
describe('F6: the Close title with no mine record on screen', () => {
  const heldRun = () =>
    makeRun({
      id: 'held',
      found: 300,
      saved: 300,
      startedAt: '2026-10-01T17:00:00.000Z',
      workRemaining: true,
      kbLimitPause: { until: RESET, resumeWindowEnd: WINDOW_END },
      stages: {
        decided: { queued: 300, done: 300 },
        analysis: { queued: 300, done: 300 },
        embedding: { queued: 120, done: 120 },
        kb: { queued: 120, done: 0 },
        awaitingRouting: 0,
      },
    });
  const titleAt = async (at: string, summary: ProcessingSummaryEntry) => {
    vi.setSystemTime(new Date(at));
    view = untracked({ runs: [heldRun()] });
    render(tree([summary]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await act(async () => {});
    expect(status()).toBe('KB paused');
    return closeTitle();
  };
  const AGAIN = 'it opens again only for a new problem.';
  // No paused mine: the final summary's mine fields are all null.
  const noMine = (over: Partial<ProcessingSummaryEntry> = {}) =>
    entry({
      minePausedUntil: null,
      mineResumeWindowEnd: null,
      resumeQueued: null,
      waitingForSlot: null,
      ...over,
    });

  it('skew — admitted: resuming now', async () => {
    expect(await titleAt('2026-10-02T00:10:00.000Z', entry({ resumeAdmittedAt: RESET }))).toBe(
      `Close. The paused knowledge-base mining is resuming now; ${AGAIN}`
    );
  });

  it('skew — a release queued it: queued to continue', async () => {
    expect(
      await titleAt('2026-10-01T18:00:00.000Z', entry({ releaseQueuedAt: '2026-10-01T17:50:00Z' }))
    ).toBe(`Close. A limit setting changed and the paused work is queued to continue; ${AGAIN}`);
  });

  it('skew — admitted AND release-queued: the admission is the newer fact', async () => {
    expect(
      await titleAt(
        '2026-10-02T00:10:00.000Z',
        entry({ resumeAdmittedAt: RESET, releaseQueuedAt: '2026-10-01T17:50:00Z' })
      )
    ).toBe(`Close. The paused knowledge-base mining is resuming now; ${AGAIN}`);
  });

  it('past the reset, inside the window: resuming after the reset', async () => {
    expect(await titleAt('2026-10-02T00:10:00.000Z', noMine())).toBe(
      `Close. The paused work is resuming after the reset; ${AGAIN}`
    );
  });

  it('CONTROL: before the reset: continues by itself after it', async () => {
    expect(await titleAt('2026-10-01T18:00:00.000Z', noMine())).toBe(
      `Close. The paused work continues by itself after the reset; ${AGAIN}`
    );
  });
});

describe('F7: an import held only by an unreadable daily limit', () => {
  const UNREADABLE: StageEta = { state: 'unknown', reason: 'limit_unreadable', stage: 'kb' };
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
          { stage: 'decided', done: 500, total: 500, projected: false, eta: { state: 'done' } },
          { stage: 'kb', done: 100, total: 200, projected: false, eta: kb },
        ],
        eta: overall,
        sampledAt: '2026-10-01T17:59:00.000Z',
      },
    }) as ImportProgress;
  const statusOf = async (data: ImportProgress) => {
    view = data;
    render(tree([entry({ pausedByLimit: 0, minePausedUntil: null, pausedUntil: null })]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await act(async () => {});
    return status();
  };

  it('reads "Unknown" at once — not "Processing"', async () => {
    expect(await statusOf(tracked(UNREADABLE, UNREADABLE))).toBe('Unknown');
    expect(screen.getByTestId('import-eta').textContent).toBe(
      'Finish time unknown: the daily KB limit could not be checked, so whether it holds the work for KB processing is not known'
    );
  });

  it('CONTROL: a capped listing’s unknown is an import still importing — "Processing"', async () => {
    expect(
      await statusOf(tracked({ state: 'unknown', reason: 'listing_capped' }, UNREADABLE))
    ).toBe('Processing');
  });

  it('CONTROL: another stage still running beside it — "Processing"', async () => {
    const data = tracked(UNREADABLE, UNREADABLE);
    if (data.tracked && data.progress) {
      data.progress.stages[1] = {
        ...data.progress.stages[1],
        done: 400,
        eta: { state: 'running', minMinutes: 5, maxMinutes: 10 },
      };
    }
    expect(await statusOf(data)).toBe('Processing');
  });
});

describe('F8: a calm KB pause sentence is not a warning', () => {
  const pauseLine = () => screen.getByText(/^Paus(ed|e)/, { selector: 'li' });

  it('in the run details: ahead of the reset, muted; CONTROL stuck at 00:10, warning', () => {
    const { unmount } = render(<RunDetails run={pausedMine()} resumeWay={entry()} />);
    expect(pauseLine().className).not.toMatch(/text-warning/);
    unmount();
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    render(<RunDetails run={pausedMine()} resumeWay={entry({ resumeQueued: false })} />);
    expect(pauseLine().className).toMatch(/text-warning/);
  });

  it('CONTROL: a mail run paused by the provider keeps the warning', () => {
    render(
      <RunDetails run={makeRun({ outcome: 'paused', stoppedBy: 'rate_limited', problems: [] })} />
    );
    expect(pauseLine().className).toMatch(/text-warning/);
  });

  // The pause record listed under a newer mail check (the details show the newest run).
  it('as an older problem: calm is muted inside the warning list; CONTROL overdue is not', async () => {
    const newerCheck = makeRun({ id: 'newer', startedAt: '2026-10-01T17:30:00.000Z' });
    const olderLine = () => screen.getByText(/^Knowledge-base mining at/, { selector: 'li' });
    view = untracked({ runs: [newerCheck, pausedMine()] });
    render(tree([entry()]));
    await act(async () => {});
    expect(status()).toBe('KB paused');
    expect(olderLine().className).toMatch(/text-muted-foreground/);
    cleanup();
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    render(tree([entry({ resumeQueued: false })]));
    await act(async () => {});
    expect(status()).toBe('Needs attention');
    expect(olderLine().className).not.toMatch(/text-muted-foreground/);
  });
});
