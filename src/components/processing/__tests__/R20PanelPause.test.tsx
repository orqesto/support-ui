/**
 * FE audit pass 20 — the panel over a mine paused at the KB limit:
 * - F5 (owner decision 2026-10-01: reopen on stuck): a calm pause the person closed reopens the
 *   panel ONCE when it turns stuck or late; a pause that stays calm keeps it closed.
 * - F4: the Close title over a calm "KB paused" says what the pause is doing — "continues by itself
 *   after the reset" was false for a release-queued mine and for one resuming past the reset.
 * - F3: a mine a resume ADMITTED (BE R20 `resumeAdmittedAt`) is resuming now, never late.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportProgress, ProcessingSummaryEntry } from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { makeKbRun, untracked } from './fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

let view: ImportProgress = untracked();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: () => Promise.resolve({ ...view }),
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('../ProcessingPanels');

const RESET = '2026-10-02T00:00:00.000Z';
const WINDOW_END = '2026-10-02T00:30:00.000Z';

// The mine's record as kbRunLedger writes it when the KB limit paused it.
const pausedMine = () =>
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
  });

// The summary entry as the final getProcessingSummary writes it for that one mine (resume job
// queued, not admitted yet).
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
  resumeQueued: true,
  waitingForSlot: false,
  releaseQueuedAt: null,
  minePausedUntil: RESET,
  mineResumeWindowEnd: WINDOW_END,
  resumeAdmittedAt: null,
  countCapped: false,
  ...over,
});

const tree = (summary: ProcessingSummaryEntry) => (
  <MemoryRouter>
    <ProcessingPanels organizationId={1} sessions={new Map()} summary={[summary]} />
  </MemoryRouter>
);
const status = () => screen.getByTestId('panel-status').textContent;
const panel = () => screen.queryByTestId('processing-panel');
const closeTitle = () => screen.getByRole('button', { name: 'Close' }).getAttribute('title');

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
  view = untracked({ runs: [pausedMine()] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Opened calm at 18:00, closed by the person; then at `at` the summary says `later`. */
const closeCalmThen = async (at: string, later: ProcessingSummaryEntry) => {
  const { rerender } = render(tree(entry()));
  await act(async () => {});
  expect(status()).toBe('KB paused');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await act(async () => {});
  expect(panel()).toBeNull();
  vi.setSystemTime(new Date(at));
  rerender(tree(later));
  await act(async () => {});
};

describe('a calm KB pause the person closed (owner: reopen on stuck)', () => {
  it('turns stuck at 00:10 (no resume queued, confirmed): the panel reopens, warning', async () => {
    await closeCalmThen('2026-10-02T00:10:00.000Z', entry({ resumeQueued: false }));
    expect(panel()).not.toBeNull();
    expect(status()).toBe('Needs attention');
    expect(screen.getByText(/Re-mine the mailbox to continue/)).toBeTruthy();
  });

  it('turns late (past its window, resume still queued): the panel reopens', async () => {
    await closeCalmThen('2026-10-02T03:00:00.000Z', entry());
    expect(panel()).not.toBeNull();
    expect(status()).toBe('Needs attention');
  });

  it('CONTROL: still calm at 00:10 (resuming, its resume queued): stays closed', async () => {
    await closeCalmThen('2026-10-02T00:10:00.000Z', entry());
    expect(panel()).toBeNull();
  });

  // A pause a later KB run overtook is history ("a later KB run … recorded since"): its time
  // passing is no new problem. The later run is one that leaves the pause's problem standing — a
  // mine INTERRUPTED (left `running`, not active; runsView keeps the earlier `paused`), never a
  // finished one, which supersedes it.
  it('CONTROL: a pause a later KB run overtook, closed, then past its window: stays closed', async () => {
    view = untracked({
      runs: [
        makeKbRun({
          id: 'later',
          startedAt: '2026-10-01T12:00:00.000Z',
          finishedAt: null,
          outcome: 'running',
          problems: ['interrupted'],
          active: false,
        }),
        pausedMine(),
      ],
    });
    const { rerender } = render(tree(entry({ problems: 1 })));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {});
    vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
    rerender(tree(entry({ problems: 1, resumeQueued: false })));
    await act(async () => {});
    expect(panel()).toBeNull();
  });

  it('reopens ONCE: closed again while stuck, it stays closed — and when it turns calm again', async () => {
    await closeCalmThen('2026-10-02T00:10:00.000Z', entry({ resumeQueued: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {});
    expect(panel()).toBeNull();
    vi.setSystemTime(new Date('2026-10-02T00:20:00.000Z'));
    cleanup();
    render(tree(entry({ resumeAdmittedAt: '2026-10-02T00:19:00.000Z' })));
    await act(async () => {});
    expect(panel()).toBeNull();
    vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
    cleanup();
    render(tree(entry({ resumeQueued: false })));
    await act(async () => {});
    expect(panel()).toBeNull();
  });
});

/**
 * Owner decision D-R21-4: the overdue reopen is once per PAUSE, not per episode. A mine that resumes
 * and pauses again the next day writes a new pause record (kbRunLedger: a new id); a pause closed
 * while overdue on day 1 kept the day-2 pause that turned stuck closed (pass 21).
 */
describe('reopen once per pause (D-R21-4)', () => {
  const DAY3 = '2026-10-03T00:00:00.000Z';
  const DAY3_WINDOW_END = '2026-10-03T00:30:00.000Z';
  // Day 2: the mine resumed at 00:20, read on, and the KB limit paused it again until day 3.
  const dayTwoRuns = () =>
    untracked({
      runs: [
        makeKbRun({
          id: 'kbp2',
          found: 900,
          kbThreads: 260,
          kbThreadsDone: 30,
          startedAt: '2026-10-02T00:20:00.000Z',
          outcome: 'paused',
          problems: ['paused'],
          stoppedBy: 'kb_token_limit',
          resumesAt: DAY3,
          workRemaining: false,
          active: false,
        }),
        // The day-1 record: a later KB run supersedes its problem.
        { ...pausedMine(), problems: [] },
      ],
    });
  const dayTwo = (over: Partial<ProcessingSummaryEntry> = {}) =>
    entry({
      pausedUntil: DAY3,
      resumeWindowEnd: DAY3_WINDOW_END,
      minePausedUntil: DAY3,
      mineResumeWindowEnd: DAY3_WINDOW_END,
      ...over,
    });
  const showAt = async (at: string, summary: ProcessingSummaryEntry) => {
    vi.setSystemTime(new Date(at));
    cleanup();
    render(tree(summary));
    await act(async () => {});
  };

  it('closed while overdue on day 1: the day-2 pause that turns stuck reopens it; that same pause stuck again does not', async () => {
    await closeCalmThen('2026-10-02T00:10:00.000Z', entry({ resumeQueued: false }));
    expect(panel()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {});
    expect(panel()).toBeNull();

    view = dayTwoRuns();
    // Calm on day 2: the same `paused` problem of the episode, already closed.
    await showAt('2026-10-02T18:00:00.000Z', dayTwo());
    expect(panel()).toBeNull();
    // The new pause turns stuck: a new problem.
    await showAt('2026-10-03T00:10:00.000Z', dayTwo({ resumeQueued: false }));
    expect(panel()).not.toBeNull();
    expect(status()).toBe('Needs attention');

    // CONTROL: closed, the SAME pause still stuck later — stays closed.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => {});
    await showAt('2026-10-03T03:00:00.000Z', dayTwo({ resumeQueued: false }));
    expect(panel()).toBeNull();
  });
});

describe('the Close title over a calm "KB paused" says what the pause is doing', () => {
  const titleAt = async (at: string, summary: ProcessingSummaryEntry) => {
    vi.setSystemTime(new Date(at));
    render(tree(summary));
    await act(async () => {});
    expect(status()).toBe('KB paused');
    return closeTitle();
  };

  it('a release queued it before the reset: queued, never "after the reset"', async () => {
    expect(
      await titleAt(
        '2026-10-01T18:00:00.000Z',
        entry({ releaseQueuedAt: '2026-10-01T17:50:00.000Z', waitingForSlot: true })
      )
    ).toBe(
      'Close. A limit setting changed and the paused work is queued to continue; it opens again for a new problem, or if the paused mine does not resume on time.'
    );
  });

  it('past the reset, inside its window: resuming, not "continues … after the reset"', async () => {
    expect(await titleAt('2026-10-02T00:10:00.000Z', entry())).toBe(
      'Close. The paused work is resuming after the reset; it opens again for a new problem, or if the paused mine does not resume on time.'
    );
  });

  it('waiting for a free slot past its window', async () => {
    expect(await titleAt('2026-10-02T03:00:00.000Z', entry({ waitingForSlot: true }))).toMatch(
      /^Close\. The paused work is due to continue and waits for a free slot;/
    );
  });

  it('a resume admitted it (BE R20): resuming now', async () => {
    expect(
      await titleAt(
        '2026-10-02T03:00:00.000Z',
        entry({ resumeQueued: true, resumeAdmittedAt: '2026-10-02T02:59:00.000Z' })
      )
    ).toMatch(/^Close\. The paused knowledge-base mining is resuming now;/);
  });

  it('CONTROL: before the reset, nothing released: continues by itself after the reset', async () => {
    expect(await titleAt('2026-10-01T18:00:00.000Z', entry())).toMatch(
      /^Close\. The paused work continues by itself after the reset;/
    );
  });
});

describe('a mine a resume admitted past its window (BE R20 resumeAdmittedAt)', () => {
  it('03:00, admitted after a slot wait: "resuming now", calm — never "was due to resume"', async () => {
    vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
    render(
      tree(
        // As the controller answers an admission: resumeQueued true, the job gone (no slot wait).
        entry({
          resumeQueued: true,
          waitingForSlot: false,
          resumeAdmittedAt: '2026-10-02T02:59:30.000Z',
        })
      )
    );
    await act(async () => {});
    expect(status()).toBe('KB paused');
    expect(screen.getByText(/mining is resuming now/)).toBeTruthy();
    expect(screen.queryByText(/was due to resume/)).toBeNull();
    expect(screen.queryByText(/no resume queued/)).toBeNull();
  });

  // Without the admission the job's absence reads as the scan says it: no resume queued.
  it('CONTROL: the same mine with no admission and no job is stuck', async () => {
    vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
    render(tree(entry({ resumeQueued: false, waitingForSlot: false, resumeAdmittedAt: null })));
    await act(async () => {});
    expect(status()).toBe('Needs attention');
    expect(screen.getByText(/no resume queued/)).toBeTruthy();
  });
});
