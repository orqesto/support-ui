/**
 * FE fix round 22 (audit pass 22), against the final backend's shapes:
 * - F2: a held mail run past its window end is resuming (it wakes by itself), never a late
 *   "knowledge-base mine" with a warning — only a mine is ever late.
 * - F3: a mail run whose outcome is not `done` still says its KB work, keyed on the backend's
 *   field (`kbStateUnknown` / `kbLimitPause`), in its details and in the older-run line.
 * - F4: a calm KB-limit "Paused" badge is not warning-coloured; an overdue one is.
 * - F5: the reopen key is per PAUSE record (not per resume time); a resumed record is calm; the
 *   panel's inferred park outranks the backend's "not known".
 * - F6: one "not known" for the import and the runs: one place in the order, one icon, a true
 *   Close title; the kb_unknown badge, the indicator icon beside an unreadable mailbox, the floor.
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
import { hasUnseenProblem, problemKeys } from '../panelRules';
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
const { ProcessingIndicator } = await import('../ProcessingIndicator');
const { RunDetails } = await import('../RunDetails');
const { RecentRuns } = await import('../RecentRuns');

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

// The summary entry as the final getProcessingSummary writes it (no paused mine by default).
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
// …with the mine paused until RESET, its resume queued.
const mineEntry = (over: Partial<ProcessingSummaryEntry> = {}) =>
  entry({
    pausedByLimit: 1,
    pausedUntil: RESET,
    resumeWindowEnd: WINDOW_END,
    minePausedUntil: RESET,
    mineResumeWindowEnd: WINDOW_END,
    resumeQueued: true,
    waitingForSlot: false,
    ...over,
  });

/** A mail run ended 40 min ago (at 18:00) whose only work left is KB work. */
const kbOnlyMailRun = (over: Partial<RunView> = {}) =>
  makeRun({
    id: 'mail',
    found: 300,
    saved: 300,
    startedAt: '2026-10-01T17:00:00.000Z',
    finishedAt: '2026-10-01T17:20:00.000Z',
    workRemaining: true,
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
const label = () => screen.getByTestId('processing-indicator').getAttribute('aria-label');
const openPanel = async (data: ImportProgress, summary: ProcessingSummaryEntry = entry()) => {
  view = data;
  render(tree([summary]));
  act(() => useProcessingPanelStore.getState().open(5, 'manual'));
  await act(async () => {});
};
const badge = (text: string) => screen.getByText(text).className;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
  view = untracked();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('F2: a held mail run past its window end is resuming, never a late mine', () => {
  it('held run only, its window end passed: resuming, no warning, no "mine" late line', () => {
    vi.setSystemTime(new Date('2026-10-02T00:40:00.000Z'));
    render(
      <ProcessingIndicator
        entries={[entry({ pausedByLimit: 1, pausedUntil: RESET, resumeWindowEnd: WINDOW_END })]}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '1 mail check or mine paused at the daily AI limit; resuming after 00:00 UTC (' +
        new Date(RESET).toTimeString().slice(0, 5) +
        ' your time)'
    );
    expect(label()).not.toContain('knowledge-base mine');
    expect(screen.getByTestId('processing-indicator').querySelector('.text-warning')).toBeNull();
  });

  it('beside a late mine: the mine alone is late, the held run is resuming', () => {
    vi.setSystemTime(new Date('2026-10-02T00:40:00.000Z'));
    render(<ProcessingIndicator entries={[mineEntry({ pausedByLimit: 2 })]} onOpen={vi.fn()} />);
    expect(label()).toMatch(/^1 mail check or mine paused at the daily AI limit; resuming after/);
    expect(label()).toMatch(
      /; 1 knowledge-base mine paused at the daily AI limit; it was due to resume at .* and has not resumed yet$/
    );
    // CONTROL: the late mine still warns.
    expect(
      screen.getByTestId('processing-indicator').querySelector('.text-warning')
    ).not.toBeNull();
  });
});

describe('F3: a mail run that did not end `done` still says its KB work', () => {
  const failedUnknown = () =>
    kbOnlyMailRun({
      outcome: 'failed',
      failed: 2,
      saved: 298,
      problems: ['failed'],
      kbStateUnknown: { reason: 'pause_unknown' },
    });
  const UNKNOWN_LINE =
    'Work is left: its knowledge-base processing is not moving, and whether the daily KB limit is holding it is not known.';

  it('failed + kbStateUnknown: the details say the KB work is not known', () => {
    render(<RunDetails run={failedUnknown()} />);
    expect(screen.getByTestId('run-kb-work').textContent).toBe(UNKNOWN_LINE);
    expect(screen.getByText(/2 messages could not be saved/)).toBeTruthy();
  });

  it('paused by the provider + kbLimitPause: the details say the KB work is paused until the reset', () => {
    render(
      <RunDetails
        run={kbOnlyMailRun({
          outcome: 'paused',
          stoppedBy: 'rate_limited',
          problems: ['paused'],
          kbLimitPause: { until: RESET, resumeWindowEnd: WINDOW_END },
        })}
      />
    );
    expect(screen.getByTestId('run-kb-work').textContent).toMatch(
      /^Work is left: its knowledge-base processing is paused at the daily AI limit and continues by itself after 00:00 UTC/
    );
  });

  it('CONTROL: the same failed run without either field says no KB line', () => {
    render(<RunDetails run={failedUnknown()} />);
    cleanup();
    render(<RunDetails run={{ ...failedUnknown(), kbStateUnknown: undefined }} />);
    expect(screen.queryByTestId('run-kb-work')).toBeNull();
  });

  it('as an older run with a problem: the line under the newer check says it too', async () => {
    const newer = makeRun({ id: 'newer', startedAt: '2026-10-01T17:50:00.000Z' });
    await openPanel(untracked({ runs: [newer, failedUnknown()] }), entry({ kbStateUnknown: 1 }));
    expect(
      screen.getByText((_content, node) =>
        Boolean(
          node?.tagName === 'LI' &&
            node.textContent?.startsWith('Check at') &&
            node.textContent.includes('2 messages could not be saved') &&
            node.textContent.includes(UNKNOWN_LINE)
        )
      )
    ).toBeTruthy();
  });
});

describe('F4: a calm KB-limit "Paused" badge is not a warning', () => {
  it('the run details: ahead of the reset, secondary; CONTROL stuck at 00:10, warning', () => {
    render(<RunDetails run={pausedMine()} resumeWay={mineEntry()} />);
    expect(badge('Paused')).toMatch(/bg-secondary/);
    expect(badge('Paused')).not.toMatch(/text-warning/);
    cleanup();
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    render(<RunDetails run={pausedMine()} resumeWay={mineEntry({ resumeQueued: false })} />);
    expect(badge('Paused')).toMatch(/text-warning/);
  });

  it('the recent runs list: the same both ways', () => {
    render(<RecentRuns runs={[pausedMine()]} resumeWay={mineEntry()} />);
    fireEvent.click(screen.getByRole('button', { name: /Recent checks and mining/ }));
    expect(badge('Paused')).toMatch(/bg-secondary/);
    cleanup();
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    render(<RecentRuns runs={[pausedMine()]} resumeWay={mineEntry({ resumeQueued: false })} />);
    fireEvent.click(screen.getByRole('button', { name: /Recent checks and mining/ }));
    expect(badge('Paused')).toMatch(/text-warning/);
  });

  it('CONTROL: a mail run paused by the provider keeps the warning badge', () => {
    render(
      <RunDetails
        run={makeRun({ outcome: 'paused', stoppedBy: 'rate_limited', problems: ['paused'] })}
      />
    );
    expect(badge('Paused')).toMatch(/text-warning/);
  });
});

describe('F5: per-pause keys, a resumed record, and which KB word wins', () => {
  it('two pause records sharing a resume time: the second turning overdue is a new problem', () => {
    const first = pausedMine({ id: 'p1' });
    const second = pausedMine({ id: 'p2', startedAt: '2026-10-01T14:00:00.000Z' });
    const overdue = () => true;
    // Closed while the first was overdue.
    const closed = problemKeys({ runs: [first], kbMiningFailures: [] }, overdue);
    // The second pause (same reset), the first's problem superseded.
    const now = problemKeys(
      { runs: [second, { ...first, problems: [] }], kbMiningFailures: [] },
      overdue
    );
    expect(hasUnseenProblem(now, closed)).toBe(true);
    // CONTROL: that same second pause still overdue later — nothing new.
    expect(hasUnseenProblem(now, [...closed, ...now])).toBe(false);
  });

  it('a resumed record at 03:00 with no resume queued: its pause line is calm', () => {
    vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
    render(
      <RunDetails
        run={pausedMine({ resumed: true, problems: [] })}
        resumeWay={mineEntry({ resumeQueued: false })}
      />
    );
    const line = screen.getByText(/mining has resumed and is running now/);
    expect(line.className).not.toMatch(/text-warning/);
  });

  it('a park the panel infers (a mine resuming at 00:10) outranks the backend’s "not known"', async () => {
    vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z'));
    const mail = kbOnlyMailRun({
      startedAt: '2026-10-01T23:00:00.000Z',
      finishedAt: '2026-10-01T23:20:00.000Z',
      kbStateUnknown: { reason: 'pause_unknown' },
    });
    await openPanel(untracked({ runs: [mail, pausedMine()] }), mineEntry({ kbStateUnknown: 1 }));
    expect(status()).toBe('KB paused');
    // The header word and the run's own badge.
    expect(screen.getAllByText('KB paused')).toHaveLength(2);
    expect(
      screen.getByText(
        'Work is left: its knowledge-base processing is paused at the daily AI limit and continues by itself after the reset.'
      )
    ).toBeTruthy();
    expect(screen.queryByTestId('run-kb-unknown')).toBeNull();
  });
});

describe('F6: one "not known"', () => {
  const tracked = (overall: StageEta, kb: StageEta, runs: RunView[] = []): ImportProgress =>
    ({
      ...untracked({ runs }),
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
  const PAUSE_UNKNOWN: StageEta = { state: 'unknown', reason: 'pause_unknown', stage: 'kb' };
  const header = () => screen.getByTestId('panel-status').parentElement as HTMLElement;
  const closeTitle = () => screen.getByRole('button', { name: 'Close' }).getAttribute('title');

  it('an import whose KB hold is not known: "Unknown", the help icon, and a title that promises no bell note', async () => {
    await openPanel(tracked(PAUSE_UNKNOWN, PAUSE_UNKNOWN));
    expect(status()).toBe('Unknown');
    expect(header().querySelector('svg.text-success')).toBeNull();
    expect(header().querySelector('svg.lucide-circle-help, svg.lucide-help-circle')).not.toBeNull();
    expect(closeTitle()).toBe(
      'Close. It is not known whether the daily KB limit holds this work; nothing is counted by the bell for it.'
    );
  });

  it('a run whose KB hold is not known: the same icon, and the bell note', async () => {
    await openPanel(
      untracked({ runs: [kbOnlyMailRun({ kbStateUnknown: { reason: 'pause_unknown' } })] }),
      entry({ kbStateUnknown: 1 })
    );
    expect(status()).toBe('Unknown');
    expect(header().querySelector('svg.lucide-circle-help, svg.lucide-help-circle')).not.toBeNull();
    expect(closeTitle()).toBe(
      'Close. The note by the bell stays while it is not known whether the daily KB limit holds this work.'
    );
  });

  it('one place in the order: a known pause beside the import’s "not known" reads "KB paused"', async () => {
    const held = kbOnlyMailRun({ kbLimitPause: { until: RESET, resumeWindowEnd: WINDOW_END } });
    await openPanel(tracked(PAUSE_UNKNOWN, PAUSE_UNKNOWN, [held]), entry({ pausedByLimit: 1 }));
    expect(status()).toBe('KB paused');
  });

  it('the kb_unknown badge is calm (secondary)', () => {
    render(<RunDetails run={kbOnlyMailRun({ kbStateUnknown: { reason: 'pause_unknown' } })} />);
    expect(badge('KB not known')).toMatch(/bg-secondary/);
  });

  it('the indicator: the help icon for kbStateUnknown alone; beside an unreadable mailbox, the plain warning icon', () => {
    render(<ProcessingIndicator entries={[entry({ kbStateUnknown: 1 })]} onOpen={vi.fn()} />);
    expect(screen.getByTestId('processing-indicator-kb-unknown')).toBeTruthy();
    cleanup();
    render(
      <ProcessingIndicator
        entries={[entry({ kbStateUnknown: 1 }), entry({ sourceId: 6, unavailable: true })]}
        onOpen={vi.fn()}
      />
    );
    expect(screen.queryByTestId('processing-indicator-kb-unknown')).toBeNull();
    expect(label()).toContain("1 mailbox's recent checks could not be read");
  });

  it('the kbUnknown line carries the floor when older runs were left uncounted', () => {
    render(
      <ProcessingIndicator
        entries={[entry({ kbStateUnknown: 2, countCapped: true })]}
        onOpen={vi.fn()}
      />
    );
    expect(label()).toBe(
      '2+ mail checks with knowledge-base processing not moving; whether the daily KB limit is holding it is not known'
    );
  });
});
