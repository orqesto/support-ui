/**
 * Edge cases found by FE audit passes 5–8, KB mining runs and a mine's socket pause at the KB
 * limit — split from ProcessingPanels.test (max-lines). Same harness. KB records are built with
 * `makeKbRun`: the backend's KB record shape, never mail stages (FE audit pass 18, NIT).
 *
 * When the processing panel shows itself (owner decisions 2026-09-27), decided from the backend's
 * RUN RECORDS by run id — never from the socket session (FE audit passes 2–4):
 * - a small routine run (< 20 found) is a count on the header indicator — no pop-up. The old
 *   widget popped for a 1-message poll (petro screenshot, 2026-09-29 17:30);
 * - a recorded run of 20+ still running opens it; it closes itself once THAT run owes nothing;
 *   closed, that run (its KB tail, a late event) never brings it back — the next run does;
 * - a problem opens it with no live run at all and it STAYS; closing it remembers which problems
 *   it showed: only a NEW one reopens it.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import type {
  ImportProgress,
  ProcessingSummaryEntry,
  RunView,
} from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { makeKbRun, makeRun, untracked } from './fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

/** Plain functions, not module-level vi.fn (see RecentRunsAndKbFailures.test). */
const views = new Map<number, ImportProgress>();
/** An answer that has not arrived yet, per source. */
const pendingViews = new Map<number, Promise<ImportProgress>>();
const asked: [number, boolean][] = [];
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: (sourceId: number, start: boolean) => {
      asked.push([sourceId, start]);
      // A fresh object per answer, as the real API gives: identical answers must still re-render.
      const view = views.get(sourceId) ?? untracked();
      return pendingViews.get(sourceId) ?? Promise.resolve({ ...view });
    },
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('../ProcessingPanels');
const { AUTO_CLOSE_MS, HIDDEN_POLL_MS, IMPORT_IDLE_MS } = await import('../ProcessingPanel');

const session = (over: Partial<ProcessingSession> = {}): ProcessingSession =>
  ({
    sessionKey: '5',
    integrationId: 5,
    integrationName: 'Gmail-orders',
    status: 'processing',
    total: 1,
    current: 0,
    processed: 0,
    failed: 0,
    isProcessing: true,
    progress: 0,
    updatedAt: Date.now(),
    ...over,
  }) as ProcessingSession;

const sessionsOf = (...list: ProcessingSession[]) =>
  new Map(list.map((item) => [item.sessionKey, item]));

const summaryEntry = (over: Partial<ProcessingSummaryEntry> = {}): ProcessingSummaryEntry => ({
  sourceId: 5,
  name: 'Gmail-orders',
  type: 'gmail',
  unavailable: false,
  inProgress: 0,
  problems: 0,
  countCapped: false,
  ...over,
});

/** A source the summary says is working: its panel is mounted and watches at the fast pace. */
const WATCHED = [summaryEntry({ inProgress: 1 })];

const ui = (
  summary: ProcessingSummaryEntry[] = WATCHED,
  sessions: Map<string, ProcessingSession> = new Map()
) => (
  <MemoryRouter>
    <ProcessingPanels organizationId={1} sessions={sessions} summary={summary} />
  </MemoryRouter>
);

const running = (over: Partial<RunView> = {}) =>
  makeRun({ outcome: 'running', active: true, finishedAt: null, saved: 0, stages: null, ...over });

/** Lets the panel's pending fetch resolve and render. */
const settle = () => act(async () => {});

/** Moves fake time and lets what it started settle. */
const advance = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });

/** The next poll brings `view`. */
const nextPoll = async (view: ImportProgress) => {
  views.set(5, view);
  await advance(15_000);
  await settle();
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  views.clear();
  pendingViews.clear();
  asked.length = 0;
  useProcessingPanelStore.getState().reset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('pass 5', () => {
  const importRun = (over: Partial<RunView> = {}) =>
    makeRun({
      id: 'imp',
      channel: 'imap',
      found: 500,
      saved: 500,
      duplicates: null,
      workRemaining: true,
      stages: {
        decided: { queued: 500, done: 500 },
        analysis: { queued: 500, done: 120 },
        embedding: { queued: 100, done: 20 },
        kb: { queued: 0, done: 0 },
        awaitingRouting: 0,
      },
      ...over,
    });

  it('H2: an older import still owing work keeps the header on Processing and stays on screen', async () => {
    views.set(5, untracked({ runs: [running({ id: 'imp', found: 500 })] }));
    render(ui());
    await settle();
    await nextPoll(
      untracked({ runs: [makeRun({ id: 'small', found: 2, saved: 2 }), importRun()] })
    );
    expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
    // The run the panel opened for is what it details (120 of 500 analysed), not the 2-message one.
    expect(screen.getByText(/500 new messages found/)).toBeTruthy();
    expect(
      screen.getAllByTestId('run-stage').some((row) => /120 \/ 500/.test(row.textContent ?? ''))
    ).toBe(true);
  });

  it('H2: opened from the indicator, a newer small run on top does not hide the import owing work', async () => {
    views.set(5, untracked({ runs: [makeRun({ id: 'small', found: 2, saved: 2 }), importRun()] }));
    render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
    expect(screen.getByText(/still being processed/)).toBeTruthy();
  });

  it('M3: arriving during an import’s long tail (200+, finished saving, work left) opens it once', async () => {
    views.set(5, untracked({ runs: [makeRun({ id: 'small', found: 2, saved: 2 }), importRun()] }));
    render(ui([summaryEntry({ inProgress: 1 })]));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    await advance(HIDDEN_POLL_MS);
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('M3 CONTROL: a finished 25-message run owing work does not open it (only imports do)', async () => {
    views.set(5, untracked({ runs: [makeRun({ id: 'r25', found: 25, workRemaining: true })] }));
    render(ui([summaryEntry({ inProgress: 1 })]));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('M1: one unreadable answer does not close a live run’s panel', async () => {
    views.set(5, untracked({ runs: [running({ id: 'big', found: 25 })] }));
    render(ui());
    await settle();
    await nextPoll(untracked({ runsUnavailable: true }));
    await advance(AUTO_CLOSE_MS + 100);
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(useProcessingPanelStore.getState().closedRuns[5] ?? []).not.toContain('big');
  });

  it('H3: a re-mine in progress says Processing, not Done', async () => {
    views.set(5, untracked({ runs: [makeRun()] }));
    render(
      ui(
        [],
        sessionsOf(
          session({
            total: 300,
            stage: 'kb-processing',
            kbMessagesTotal: 300,
            kbMessagesProcessed: 40,
          })
        )
      )
    );
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
  });

  it('M5: a source that only owes work (summary) is polled at the slow pace, not every 15 s', async () => {
    views.set(5, untracked({ runs: [makeRun({ id: 'r3', found: 3, workRemaining: true })] }));
    render(ui([summaryEntry({ inProgress: 1 })]));
    await settle();
    const before = asked.length;
    await advance(15_000);
    await advance(15_000);
    expect(asked.length).toBe(before);
    await advance(HIDDEN_POLL_MS);
    expect(asked.length).toBe(before + 1);
  });

  it('M5 CONTROL: a live socket fetch is watched at 15 s', async () => {
    views.set(5, untracked({ runs: [makeRun({ found: 1 })] }));
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    const before = asked.length;
    await advance(15_000);
    expect(asked.length).toBe(before + 1);
  });

  it('L1: a socket session silent for 20 min is not watched', async () => {
    views.set(5, untracked({ runs: [makeRun({ found: 1 })] }));
    render(
      ui(
        [],
        sessionsOf(
          session({ status: 'complete', isProcessing: true, updatedAt: Date.now() - 21 * 60_000 })
        )
      )
    );
    await settle();
    expect(asked).toEqual([]);
  });

  it('L4: the listing is asked only while the import-sized run is active', async () => {
    views.set(5, untracked({ runs: [running({ id: 'big', found: 2500 })] }));
    render(ui());
    await settle();
    await settle();
    expect(asked).toContainEqual([5, true]);
    await nextPoll(untracked({ runs: [makeRun({ id: 'big', found: 2500 })] }));
    asked.length = 0;
    await advance(15_000);
    await settle();
    expect(asked.length).toBeGreaterThan(0);
    expect(asked).not.toContainEqual([5, true]);
  });

  it('M2: the stood-still clock survives a new tab (kept per browser, per import)', async () => {
    const stalled = {
      ...untracked({ runs: [makeRun()] }),
      tracked: true,
      run: {
        state: 'ready',
        startedAt: '2026-09-20T00:00:00Z',
        countedAt: null,
        total: 500,
        capped: false,
        cappedBy: null,
        query: null,
        error: null,
      },
      progress: {
        total: 500,
        capped: false,
        imported: 480,
        drained: false,
        notStored: 0,
        awaitingRouting: 0,
        unrecorded: 0,
        stages: [],
        eta: { state: 'stalled' },
        sampledAt: '2026-09-20T00:00:00Z',
      },
    } as ImportProgress;
    views.set(5, stalled);
    const { unmount } = render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    await advance(IMPORT_IDLE_MS - 60_000);
    unmount();
    sessionStorage.clear(); // a new tab
    render(ui([]));
    await settle();
    await advance(2 * 60_000);
    expect(screen.getByTestId('panel-status').textContent).toBe('No progress');
  });
});

describe('pass 6', () => {
  const stalledImport = () =>
    makeRun({
      id: 'old',
      found: 900,
      saved: 900,
      workRemaining: true,
      problems: ['stalled'],
    });

  it('H1: a stalled 200+ run the person closed does not reopen after a reload', async () => {
    views.set(5, untracked({ runs: [stalledImport()] }));
    const { unmount } = render(ui([summaryEntry({ problems: 1, inProgress: 1 })]));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    unmount();
    useProcessingPanelStore.getState().reset(); // a reload
    render(ui([summaryEntry({ problems: 1, inProgress: 1 })]));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('H1: a run the person closed stays closed after a reload while it still runs', async () => {
    views.set(5, untracked({ runs: [running({ id: 'r1', found: 25 })] }));
    const { unmount } = render(ui());
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    unmount();
    useProcessingPanelStore.getState().reset();
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  const kbRun = (id: string, over: Partial<RunView> = {}) =>
    makeKbRun({
      id,
      found: 900,
      kbThreads: 300,
      kbThreadsDone: 300,
      kbPairsSaved: 0,
      ...over,
    });

  it('H2: a repeat KB mine (the sweep retrying) does not pop the panel; the first one does', async () => {
    views.set(
      5,
      untracked({
        runs: [
          kbRun('k2', { outcome: 'running', active: true, finishedAt: null, workRemaining: true }),
          // The sweep retries only after a mine that did not finish clean. A failed record
          // under a LIVE later mine keeps its problem (BE kbRunViews: only a later FINISHED
          // record clears it) — closed already, so only the opener rule is tested (pass 18).
          kbRun('k1', { outcome: 'failed', failed: 1, problems: ['failed'] }),
        ],
      })
    );
    localStorage.setItem(
      'processingPanel_closedProblems_1_5',
      JSON.stringify(['kb-run:failed:none'])
    );
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
    cleanup();
    useProcessingPanelStore.getState().reset();
    views.set(
      5,
      untracked({
        runs: [
          kbRun('k1', { outcome: 'running', active: true, finishedAt: null, workRemaining: true }),
        ],
      })
    );
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });

  it('H2: repeated KB failures are ONE problem — closed once, not reopened by the next failed mine', async () => {
    views.set(
      5,
      untracked({ runs: [kbRun('k1', { outcome: 'failed', failed: 1, problems: ['failed'] })] })
    );
    const { rerender } = render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    views.set(
      5,
      untracked({
        runs: [
          kbRun('k2', { outcome: 'failed', failed: 1, problems: ['failed'] }),
          kbRun('k1', { outcome: 'failed', failed: 1, problems: [] }),
        ],
      })
    );
    rerender(ui([summaryEntry({ problems: 1, inProgress: 0, countCapped: true })]));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('M1: closing an import panel holds across the import’s next chunks', async () => {
    const importing = (chunk: RunView) =>
      ({
        ...untracked({ runs: [chunk] }),
        tracked: true,
        run: {
          state: 'ready',
          startedAt: '2026-09-30T08:00:00Z',
          countedAt: null,
          total: 5000,
          capped: false,
          cappedBy: null,
          query: null,
          error: null,
        },
        progress: {
          total: 5000,
          capped: false,
          imported: 1000,
          drained: false,
          notStored: 0,
          awaitingRouting: 0,
          unrecorded: 0,
          stages: [],
          eta: { state: 'running', minMinutes: 30, maxMinutes: 60 },
          sampledAt: '2026-09-30T08:00:00Z',
        },
      }) as ImportProgress;
    views.set(5, importing(running({ id: 'c1', found: 500 })));
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    await nextPoll(importing(running({ id: 'c2', found: 500 })));
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('L1: another KB mine still going is named as mining, not as a check', async () => {
    views.set(
      5,
      untracked({
        runs: [
          running({ id: 'mail', found: 25 }),
          kbRun('k1', { outcome: 'running', active: true, finishedAt: null, workRemaining: true }),
        ],
      })
    );
    render(ui());
    await settle();
    expect(screen.getByText(/Knowledge-base mining at .* is still going/)).toBeTruthy();
    expect(screen.queryByText(/Check at .*900 found/)).toBeNull();
  });
});

describe('a knowledge-base mine run', () => {
  const kbMining = (over: Partial<RunView> = {}) =>
    makeKbRun({
      id: 'kb1',
      outcome: 'running',
      active: true,
      finishedAt: null,
      found: 900,
      kbThreads: 300,
      kbThreadsDone: 40,
      kbPairsSaved: 3,
      workRemaining: true,
      ...over,
    });

  it('opens the panel (KB switched on / history sweep), and never asks for a mailbox listing', async () => {
    views.set(5, untracked({ runs: [kbMining()] }));
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    await advance(15_000);
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByText(/Reading 300 conversations/)).toBeTruthy();
    expect(asked).not.toContainEqual([5, true]);
  });

  it('the socket KB line is not shown twice beside a KB run', async () => {
    views.set(5, untracked({ runs: [kbMining()] }));
    render(
      ui(
        [],
        sessionsOf(
          session({
            total: 900,
            stage: 'kb-processing',
            kbMessagesTotal: 900,
            kbMessagesProcessed: 100,
          })
        )
      )
    );
    await settle();
    // The KB run's own line is there (an empty render passed this too — pass 18).
    expect(screen.getByText(/Reading 300 conversations/)).toBeTruthy();
    expect(screen.queryByText(/Knowledge-base mining on this mailbox/)).toBeNull();
  });

  const pausedSession = () =>
    sessionsOf(
      session({
        status: 'idle',
        isProcessing: false,
        stage: 'kb-processing',
        kbMessagesTotal: 900,
        kbMessagesProcessed: 100,
        kbPausedUntil: '2026-10-01T00:00:00.000Z',
      })
    );

  it('a socket session paused at the KB limit keeps its progress and says when it resumes', async () => {
    vi.setSystemTime(new Date('2026-09-30T18:00:00.000Z'));
    views.set(5, untracked({ runs: [] }));
    render(ui(WATCHED, pausedSession()));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    expect(
      screen.getByText(
        /100 of 900 messages\. Paused — resumes from 00:00 UTC on 2026-10-01 \(\d\d:\d\d your time\)\./
      )
    ).toBeTruthy();
  });

  // Past the instant it is RESUMING (the header no longer fell to "Done" until the first
  // `kb:progress` — FE audit pass 18, NIT); it goes once the wake window is over: the reset + the
  // backend's 30-min spread with a summary entry for the mailbox, else (a panel opened by hand) the
  // FE grace of 45 min (pass 19, NIT: the grace itself was untested).
  it.each([
    ['with a summary entry: the 30-min window', WATCHED, 29],
    ['with none: the 45-min grace', [], 44],
  ])(
    'the paused line says "resuming now" past its instant and goes after the wake window, %s',
    async (_name, summary, lastMinute) => {
      vi.setSystemTime(new Date('2026-09-30T23:59:00.000Z'));
      views.set(5, untracked({ runs: [] }));
      render(ui(summary, pausedSession()));
      act(() => useProcessingPanelStore.getState().open(5, 'manual'));
      await settle();
      const resuming = /Paused — resumes from .*; resuming now\.$/;
      expect(
        screen.getByText(/Paused — resumes from 00:00 UTC on 2026-10-01 \(\d\d:\d\d your time\)\.$/)
      ).toBeTruthy();
      await act(async () => vi.advanceTimersByTimeAsync(2 * 60 * 1000));
      expect(screen.getByText(resuming)).toBeTruthy();
      expect(screen.getByTestId('panel-status').textContent).toBe('KB paused');
      await act(async () => vi.advanceTimersByTimeAsync((lastMinute - 1) * 60 * 1000));
      expect(screen.getByText(resuming)).toBeTruthy();
      await act(async () => vi.advanceTimersByTimeAsync(2 * 60 * 1000));
      expect(screen.getByTestId('processing-panel')).toBeTruthy();
      expect(screen.queryByText(/Paused — resumes from/)).toBeNull();
    }
  );

  it('a pause whose wake window is already over is not shown at all', async () => {
    vi.setSystemTime(new Date('2026-10-01T00:50:00.000Z'));
    views.set(5, untracked({ runs: [] }));
    render(ui(WATCHED, pausedSession()));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.queryByText(/Paused — resumes from/)).toBeNull();
  });
  // Its CONTROL (the run record already says the pause) lives in kbPausedLine.test.tsx, pinned
  // before the resume instant (audit pass 8, F8-4: here it passed on any later date).
});

describe('pass 7', () => {
  const kb = (id: string, over: Partial<RunView> = {}) =>
    makeKbRun({
      id,
      found: 900,
      kbThreads: 300,
      kbThreadsDone: 300,
      kbPairsSaved: 0,
      startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      ...over,
    });
  const activeKb = (id: string) =>
    kb(id, {
      outcome: 'running',
      active: true,
      finishedAt: null,
      workRemaining: true,
      kbThreadsDone: 40,
      startedAt: new Date().toISOString(),
    });
  const live = () => sessionsOf(session({ status: 'processing', isProcessing: true }));

  it('H1: KB switched off and on again — the new mine opens though an older clean mine is in view', async () => {
    views.set(5, untracked({ runs: [activeKb('new'), kb('old')] }));
    render(ui([], live()));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });

  it('H1 CONTROL: a retry right after a FAILED mine stays quiet', async () => {
    views.set(
      5,
      untracked({
        runs: [
          activeKb('retry'),
          kb('failed', { outcome: 'failed', failed: 1, problems: ['failed'] }),
        ],
      })
    );
    // Its problem closed already (BE shape: it keeps `failed` under a live mine): the opener only.
    localStorage.setItem(
      'processingPanel_closedProblems_1_5',
      JSON.stringify(['kb-run:failed:none'])
    );
    render(ui([], live()));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('H2: a KB failure after a clean mine reopens a panel closed on an earlier KB failure', async () => {
    views.set(
      5,
      untracked({ runs: [kb('f1', { outcome: 'failed', failed: 1, problems: ['failed'] })] })
    );
    const { unmount } = render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    unmount();
    views.set(
      5,
      untracked({
        runs: [
          kb('f2', { outcome: 'failed', failed: 1, problems: ['failed'] }),
          kb('clean'),
          kb('f1', { outcome: 'failed', failed: 1, problems: [] }),
        ],
      })
    );
    render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });

  it('MED: a closed moving import holds back mail chunks only — a first KB mine still opens', async () => {
    const importing = (runs: RunView[]) =>
      ({
        ...untracked({ runs }),
        tracked: true,
        run: {
          state: 'ready',
          startedAt: '2026-09-30T08:00:00Z',
          countedAt: null,
          total: 5000,
          capped: false,
          cappedBy: null,
          query: null,
          error: null,
        },
        progress: {
          total: 5000,
          capped: false,
          imported: 1000,
          drained: false,
          notStored: 0,
          awaitingRouting: 0,
          unrecorded: 0,
          stages: [],
          eta: { state: 'running', minMinutes: 30, maxMinutes: 60 },
          sampledAt: '2026-09-30T08:00:00Z',
        },
      }) as ImportProgress;
    views.set(5, importing([running({ id: 'c1', found: 500 })]));
    render(ui([], live()));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    await nextPoll(importing([activeKb('k1'), running({ id: 'c2', found: 500 })]));
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByText(/Reading 300 conversations/)).toBeTruthy();
  });
});

describe('pass 8', () => {
  it('a mine right after a DEAD (interrupted) record is not a retry — it opens', async () => {
    const kbRec = (id: string, over: Partial<RunView>) =>
      makeKbRun({
        id,
        found: 900,
        kbThreads: 300,
        kbThreadsDone: 10,
        ...over,
      });
    views.set(
      5,
      untracked({
        runs: [
          kbRec('new', { outcome: 'running', active: true, finishedAt: null, workRemaining: true }),
          kbRec('dead', {
            outcome: 'running',
            active: false,
            finishedAt: null,
            problems: ['interrupted'],
          }),
        ],
      })
    );
    // The dead record's own problem was already closed: only the opener can show the panel.
    localStorage.setItem(
      'processingPanel_closedProblems_1_5',
      JSON.stringify(['kb-run:interrupted:none'])
    );
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });
});
