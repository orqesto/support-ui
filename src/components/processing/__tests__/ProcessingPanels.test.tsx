/**
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
import { makeRun, untracked } from './fixtures';

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

describe('a recorded run', () => {
  it('a 1-message run opens NO panel', async () => {
    views.set(5, untracked({ runs: [running({ found: 1 })] }));
    render(ui());
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('CONTROL: a run of 25 still running opens it, without the old tiles', async () => {
    views.set(5, untracked({ runs: [running({ id: 'r25', found: 25 })] }));
    render(ui());
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByText(/Going through 25 messages/)).toBeTruthy();
    expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
    expect(screen.queryByText('Found')).toBeNull();
    expect(screen.queryByText('Analyzed')).toBeNull();
  });

  it('a big FINISHED run does not open it (nothing to watch)', async () => {
    views.set(5, untracked({ runs: [makeRun({ found: 25, saved: 25 })] }));
    render(ui());
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('a socket session alone — KB jobs piling up, a reload mid-KB, an orphan re-queue — opens nothing', async () => {
    views.set(5, untracked({ runs: [makeRun({ found: 1 })] }));
    render(
      ui(
        [],
        sessionsOf(
          session({ total: 57, stage: 'kb-processing', kbMessagesTotal: 57, emailTotal: 300 })
        )
      )
    );
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
    expect(asked).not.toContainEqual([5, true]);
  });

  it('an import-sized run (200+) asks the backend to list the mailbox; a run of 25 does not', async () => {
    views.set(5, untracked({ runs: [running({ id: 'big', found: 2500 })] }));
    render(ui());
    await settle();
    await settle();
    expect(asked).toContainEqual([5, true]);
    cleanup();
    asked.length = 0;
    useProcessingPanelStore.getState().reset();
    views.set(5, untracked({ runs: [running({ id: 'mid', found: 25 })] }));
    render(ui());
    await settle();
    await advance(15_000);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked).not.toContainEqual([5, true]);
  });

  it('closes itself once THAT run owes nothing', async () => {
    views.set(5, untracked({ runs: [running({ id: 'r1', found: 25 })] }));
    render(ui());
    await settle();
    await nextPoll(untracked({ runs: [makeRun({ id: 'r1', found: 25, saved: 25 })] }));
    await advance(AUTO_CLOSE_MS + 100);
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('CONTROL: does NOT close while that run still owes work', async () => {
    views.set(5, untracked({ runs: [running({ id: 'r1', found: 25 })] }));
    render(ui());
    await settle();
    await nextPoll(
      untracked({ runs: [makeRun({ id: 'r1', found: 25, saved: 25, workRemaining: true })] })
    );
    await advance(AUTO_CLOSE_MS * 3);
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
  });

  it('a run that ends in a problem stays open past the auto-close', async () => {
    views.set(5, untracked({ runs: [running({ id: 'r1', found: 25 })] }));
    render(ui());
    await settle();
    await nextPoll(
      untracked({
        runs: [makeRun({ id: 'r1', failed: 1, outcome: 'failed', problems: ['failed'] })],
      })
    );
    await advance(AUTO_CLOSE_MS * 3);
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByTestId('panel-status').textContent).toBe('Needs attention');
  });

  it('closed mid-run: that run never reopens it — not its KB tail, not a late event — the NEXT run does (pass 4, H1)', async () => {
    views.set(5, untracked({ runs: [running({ id: 'r1', found: 25 })] }));
    const { rerender } = render(ui());
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
    // More polls of the same run, then its KB tail on the socket (complete, isProcessing again).
    await nextPoll(untracked({ runs: [running({ id: 'r1', found: 25 })] }));
    rerender(
      ui(
        WATCHED,
        sessionsOf(
          session({
            status: 'complete',
            isProcessing: true,
            stage: 'kb-processing',
            kbMessagesTotal: 3,
            total: 25,
          })
        )
      )
    );
    await nextPoll(untracked({ runs: [makeRun({ id: 'r1', found: 25, workRemaining: true })] }));
    expect(screen.queryByTestId('processing-panel')).toBeNull();
    // A new run.
    await nextPoll(untracked({ runs: [running({ id: 'r2', found: 30 }), makeRun({ id: 'r1' })] }));
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });
});

describe('a problem', () => {
  const failedView = () =>
    untracked({
      runs: [makeRun({ id: 'r1', failed: 2, outcome: 'failed', problems: ['failed'] })],
    });

  it('opens the panel with no live run, and says it needs attention', async () => {
    views.set(5, failedView());
    render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByTestId('panel-status').textContent).toBe('Needs attention');
    expect(screen.getByText(/2 messages could not be saved/)).toBeTruthy();
  });

  it('CONTROL: a source with no problems and no run mounts nothing and asks nothing', async () => {
    views.set(5, untracked({ runs: [makeRun()] }));
    render(ui([summaryEntry()]));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
    expect(asked).toEqual([]);
  });

  it('never closes by itself', async () => {
    views.set(5, failedView());
    render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    await advance(AUTO_CLOSE_MS * 4);
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });

  it('closed, it stays closed for the same problems — also after a reload', async () => {
    views.set(5, failedView());
    const { unmount } = render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
    unmount();
    useProcessingPanelStore.getState().reset();
    render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('a NEW problem reopens it, and older runs with problems are listed', async () => {
    views.set(5, failedView());
    const { rerender } = render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    views.set(
      5,
      untracked({
        runs: [
          makeRun({ id: 'r2', outcome: 'paused', stoppedBy: 'daily_limit', problems: ['paused'] }),
          makeRun({ id: 'r1', failed: 2, outcome: 'failed', problems: ['failed'] }),
          // Staging 2026-09-30: a failure a later clean run superseded, left with work only.
          makeRun({ id: 'r0', failed: 1, outcome: 'failed', problems: ['stalled'] }),
        ],
      })
    );
    rerender(ui([summaryEntry({ problems: 2 })]));
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByText(/Paused because Gmail's daily limit/)).toBeTruthy();
    expect(
      screen.getByText(
        /Not all saved\. 2 messages could not be saved; the next check fetches them again/
      )
    ).toBeTruthy();
    expect(screen.getByText(/Not all saved\. Work is left, and this check ended/)).toBeTruthy();
    expect(screen.queryByText(/\b1 (message )?could not be saved/)).toBeNull();
  });

  it('a failed knowledge-base thread opens it too, with a link to the conversation', async () => {
    views.set(
      5,
      untracked({
        kbMiningFailures: [
          { conversationId: 77, at: '2026-09-30T08:00:00Z', error: 'provider 400' },
        ],
      })
    );
    render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    expect(screen.getByText('#77').closest('a')?.getAttribute('href')).toBe('/messages/77');
  });
});

describe('the header word stays true', () => {
  it('while the first answer is loading it says Loading, not Done', async () => {
    let release: (value: ImportProgress) => void = () => undefined;
    pendingViews.set(5, new Promise<ImportProgress>((resolve) => (release = resolve)));
    render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    expect(screen.getByTestId('panel-status').textContent).toBe('Loading');
    await act(async () => {
      release(untracked({ runs: [makeRun()] }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('panel-status').textContent).toBe('Done');
  });

  it('runs that could not be read say Unknown, not Done', async () => {
    views.set(5, untracked({ runsUnavailable: true }));
    render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    expect(screen.getByTestId('panel-status').textContent).toBe('Unknown');
  });
});

describe('opened by the person', () => {
  it('from the indicator: a quiet source shows and does not close itself', async () => {
    views.set(5, untracked({ runs: [makeRun()] }));
    render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    await advance(AUTO_CLOSE_MS * 3);
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });

  it('for a re-mine: the socket KB counts show, worded as the mailbox’s mining', async () => {
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
    expect(
      screen.getByText(/Knowledge-base mining on this mailbox: 40 of 300 messages/)
    ).toBeTruthy();
  });

  it('a KB session silent for 20 min is not shown as mining (a missed kb:completed, pass 4 M5)', async () => {
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
            updatedAt: Date.now() - 21 * 60_000,
          })
        )
      )
    );
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    expect(screen.queryByText(/Knowledge-base mining on this mailbox/)).toBeNull();
  });
});

describe('a Gmail import', () => {
  const tracked = (eta: 'stalled' | 'unknown' | 'running', imported = 480) =>
    ({
      ...untracked({ runs: [makeRun()] }),
      tracked: true,
      run: {
        state: 'ready',
        startedAt: new Date().toISOString(),
        countedAt: new Date().toISOString(),
        total: 500,
        capped: eta === 'unknown',
        cappedBy: null,
        query: null,
        error: null,
      },
      progress: {
        total: 500,
        capped: eta === 'unknown',
        imported,
        drained: false,
        notStored: 0,
        awaitingRouting: 0,
        unrecorded: 0,
        stages: [],
        eta:
          eta === 'running' ? { state: 'running', minMinutes: 5, maxMinutes: 10 } : { state: eta },
        sampledAt: new Date().toISOString(),
      },
    }) as ImportProgress;

  it('shows the import progress while it runs', async () => {
    views.set(5, tracked('running'));
    render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    expect(screen.getByTestId('import-eta')).toBeTruthy();
    expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
  });

  for (const eta of ['stalled', 'unknown'] as const) {
    it(`a ${eta} finish holds while its numbers move, then says "No progress" — never "Done" (passes 3–4)`, async () => {
      views.set(5, tracked(eta));
      render(ui([]));
      act(() => useProcessingPanelStore.getState().open(5, 'manual'));
      await settle();
      expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
      await advance(30 * 60_000);
      // It moved at minute 30: the clock starts again.
      await nextPoll(tracked(eta, 490));
      await advance(30 * 60_000);
      expect(screen.getByTestId('panel-status').textContent).toBe('Processing');
      await advance(IMPORT_IDLE_MS);
      expect(screen.getByTestId('panel-status').textContent).toBe('No progress');
    });
  }

  it('a remount does not restart the stood-still clock (pass 4, M3)', async () => {
    views.set(5, tracked('stalled'));
    const { unmount } = render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await settle();
    await advance(IMPORT_IDLE_MS - 60_000);
    unmount();
    render(ui([]));
    await settle();
    await advance(2 * 60_000);
    expect(screen.getByTestId('panel-status').textContent).toBe('No progress');
  });
});

describe('a panel off screen asks rarely (pass 2 M1, pass 3 M-E)', () => {
  it('a closed problem panel polls every 5 min, not every 15 s, and asks when the summary moves', async () => {
    views.set(
      5,
      untracked({
        runs: [makeRun({ id: 'r1', failed: 2, outcome: 'failed', problems: ['failed'] })],
      })
    );
    const { rerender } = render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    const before = asked.length;
    await advance(15_000);
    await advance(15_000);
    expect(asked.length).toBe(before);
    rerender(ui([summaryEntry({ problems: 2 })]));
    await settle();
    expect(asked.length).toBe(before + 1);
    await advance(HIDDEN_POLL_MS);
    expect(asked.length).toBe(before + 2);
  });

  it('the same KB thread failing again (same count) reopens it on the slow poll', async () => {
    views.set(
      5,
      untracked({
        kbMiningFailures: [{ conversationId: 77, at: '2026-09-30T08:00:00Z', error: 'x' }],
      })
    );
    render(ui([summaryEntry({ problems: 1 })]));
    await settle();
    fireEvent.click(screen.getByLabelText('Close'));
    await settle();
    views.set(
      5,
      untracked({
        kbMiningFailures: [{ conversationId: 77, at: '2026-09-30T11:00:00Z', error: 'x' }],
      })
    );
    await advance(HIDDEN_POLL_MS);
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });

  it('a WATCHED source (live socket fetch) polls at the fast pace so a big run is seen within a poll', async () => {
    views.set(5, untracked({ runs: [makeRun({ found: 1 })] }));
    render(ui([], sessionsOf(session({ status: 'processing', isProcessing: true }))));
    await settle();
    await nextPoll(untracked({ runs: [running({ id: 'r9', found: 40 })] }));
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
  });
});

describe('where it sits', () => {
  it('a remembered place off this window is pulled back into view (M2)', async () => {
    localStorage.setItem('processingPanel_position_5', JSON.stringify({ xPos: 5000, yPos: 4000 }));
    views.set(5, untracked({ runs: [running({ found: 25 })] }));
    render(ui());
    await settle();
    const panel = screen.getByTestId('processing-panel');
    expect(parseInt(panel.style.left, 10)).toBeLessThanOrEqual(window.innerWidth - 320);
    expect(parseInt(panel.style.top, 10)).toBeLessThanOrEqual(window.innerHeight - 100);
  });

  it('does not write a position nobody chose; a drag is remembered', async () => {
    views.set(5, untracked({ runs: [running({ found: 25 })] }));
    render(ui());
    await settle();
    expect(localStorage.getItem('processingPanel_position_5')).toBeNull();
    const handle = screen.getByTitle('Drag to move');
    fireEvent.mouseDown(handle, { clientX: 10, clientY: 10 });
    fireEvent.mouseMove(document, { clientX: 200, clientY: 150 });
    fireEvent.mouseUp(document);
    expect(localStorage.getItem('processingPanel_position_5')).not.toBeNull();
  });
});

// petro 2026-10-05: the panel kept detailing the import it opened for and called it "Last check
// 10:55" above checks at 12:06, 12:21 and 12:26.
describe('the detailed run says whether it is the latest', () => {
  const older = () => makeRun({ id: 'older', found: 2470, startedAt: '2026-10-05T08:55:00.000Z' });
  const newer = () => makeRun({ id: 'newer', found: 2, startedAt: '2026-10-05T10:26:00.000Z' });

  it('opened for an older run with newer checks after it: "Check at", not "Last check"', async () => {
    views.set(5, untracked({ runs: [newer(), older()] }));
    render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual', 'older'));
    await settle();
    const head = screen.getByTestId('run-details').textContent ?? '';
    expect(head).toMatch(/Check at /);
    expect(head).not.toMatch(/Last check/);
  });

  it('CONTROL: the newest run is still the "Last check"', async () => {
    views.set(5, untracked({ runs: [newer(), older()] }));
    render(ui([]));
    act(() => useProcessingPanelStore.getState().open(5, 'manual', 'newer'));
    await settle();
    expect(screen.getByTestId('run-details').textContent).toMatch(/Last check /);
  });
});
