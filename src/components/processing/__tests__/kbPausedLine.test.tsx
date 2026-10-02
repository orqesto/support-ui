/**
 * FE audit pass 7 (MED): the socket's "Paused — resumes from …" line is left to a run record only
 * when a line ON SCREEN says the pause. A KB-limit record whose pause was since closed
 * (`problems: []`, not the detailed run) says nothing — it must not silence the socket line.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
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

let view: ImportProgress = untracked();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: () => Promise.resolve({ ...view }),
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('../ProcessingPanels');

const kbRun = (over: Partial<RunView>) =>
  makeKbRun({
    found: 900,
    kbThreads: 300,
    kbThreadsDone: 40,
    kbPairsSaved: 3,
    active: false,
    // Pinned: an older record, before any later mine below (hasLaterKbRun compares startedAt).
    startedAt: '2026-09-30T10:00:00.000Z',
    ...over,
  });

const pausedSession = {
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
  kbPausedUntil: '2026-10-01T00:00:00.000Z',
  updatedAt: Date.now(),
} as ProcessingSession;

const renderPanel = async (
  session: ProcessingSession = pausedSession,
  runId?: string,
  summaryOver: Partial<ProcessingSummaryEntry> = {}
) => {
  render(
    <MemoryRouter>
      <ProcessingPanels
        organizationId={1}
        sessions={new Map([['5', session]])}
        summary={[
          {
            sourceId: 5,
            name: 'Gmail-orders',
            type: 'gmail',
            unavailable: false,
            inProgress: 1,
            problems: 0,
            countCapped: false,
            ...summaryOver,
          },
        ]}
      />
    </MemoryRouter>
  );
  act(() => useProcessingPanelStore.getState().open(5, 'manual', runId));
  await act(async () => {});
};

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

describe('the socket KB paused line beside run records', () => {
  it('a KB-limit record no longer on screen does not silence it', async () => {
    view = untracked({
      runs: [
        kbRun({
          id: 'kb2',
          outcome: 'done',
          workRemaining: false,
          startedAt: '2026-09-30T17:00:00.000Z',
        }),
        // An earlier pause, since closed: no problems left, so no line says it.
        kbRun({
          id: 'kb0',
          outcome: 'paused',
          problems: [],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-09-29T00:00:00.000Z',
        }),
      ],
    });
    await renderPanel();
    expect(screen.getByText(/Paused — resumes from/)).toBeTruthy();
    expect(screen.queryByText(/AI limit for KB processing/)).toBeNull();
  });

  it('CONTROL: the DETAILED run paused by the limit says it once — the socket line is not repeated', async () => {
    view = untracked({
      runs: [
        kbRun({
          id: 'kb1',
          outcome: 'paused',
          problems: ['paused'],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
        }),
      ],
    });
    await renderPanel();
    expect(screen.queryByText(/Paused — resumes from/)).toBeNull();
    expect(screen.getAllByText(/today’s AI limit for KB processing was reached/)).toHaveLength(1);
  });

  // States the backend produces (FE audit pass 9): a later FINISHED KB record supersedes 'paused'
  // (be-toklim-wt 2b678d40 runsView kbRunViews), so an older paused record still listed sits under
  // a newer MAIL run — never under a newer done KB mine.
  it('CONTROL: an OLDER record whose paused problem is listed says it — the line is not repeated', async () => {
    view = untracked({
      runs: [
        makeRun({ id: 'mail2' }),
        kbRun({
          id: 'kb0',
          outcome: 'paused',
          problems: ['paused'],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
        }),
      ],
    });
    await renderPanel();
    expect(screen.queryByText(/Paused — resumes from/)).toBeNull();
    expect(screen.getAllByText(/AI limit for KB processing/)).toHaveLength(1);
  });

  // FE audit pass 8 (F8-1): a mine that also failed conversations is recorded `failed` with the
  // same stoppedBy/resumesAt (BE kbRunLedger outcomeOf) — it is paused all the same.
  const failedPause = (id: string) =>
    kbRun({
      id,
      outcome: 'failed',
      failed: 2,
      problems: ['failed'],
      stoppedBy: 'kb_token_limit',
      resumesAt: '2026-10-01T00:00:00.000Z',
    });

  it('the DETAILED run that failed AND hit the limit says the pause once, beside the failed line', async () => {
    view = untracked({ runs: [failedPause('kb1')] });
    await renderPanel();
    expect(screen.getAllByText(/AI limit for KB processing/)).toHaveLength(1);
    expect(screen.getByText(/Mining resumes by itself after 00:00 UTC on 2026-10-01/)).toBeTruthy();
    expect(screen.getByText(/2 conversations could not be mined/)).toBeTruthy();
    expect(screen.queryByText(/Paused — resumes from/)).toBeNull();
  });

  it('an OLDER listed run that failed AND hit the limit says the pause once', async () => {
    view = untracked({
      runs: [makeRun({ id: 'mail2' }), failedPause('kb0')],
    });
    await renderPanel();
    expect(screen.getAllByText(/AI limit for KB processing/)).toHaveLength(1);
    // Only a later MAIL run: no later mine, so the resume still to come is said.
    expect(screen.getByText(/Mining resumes by itself after 00:00 UTC on 2026-10-01/)).toBeTruthy();
    expect(screen.queryByText(/Paused — resumes from/)).toBeNull();
  });

  // A release queued the paused mine and it RUNS. The backend at 3d0b965e (round 9, runsView
  // kbRunViews; kb-run-ledger.test "a KB-limit record under a LIVE later KB run") marks the older
  // record `resumed: true` and drops its `paused` problem (outcome stays 'paused'); a `failed` one
  // keeps `failed`. Neither may say the mine "resumes by itself" — it already has.
  const running = () =>
    kbRun({
      id: 'kb3',
      outcome: 'running',
      active: true,
      finishedAt: null,
      processMs: null,
      startedAt: '2026-09-30T17:00:00.000Z',
    });
  const runningSession = {
    ...pausedSession,
    kbPausedUntil: undefined,
    status: 'processing',
    isProcessing: true,
  } as ProcessingSession;

  it('a running resumed mine over an older paused record (resumed, problems []): no pause line', async () => {
    view = untracked({
      runs: [
        running(),
        kbRun({
          id: 'kb0',
          outcome: 'paused',
          problems: [],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
          resumed: true,
        }),
      ],
    });
    // The socket still carries the earlier pause (kbPausedUntil kept): the record's `resumed` says
    // a mine runs now, so "Paused — resumes from" must not be said beside it.
    await renderPanel({ ...runningSession, kbPausedUntil: '2026-10-01T00:00:00.000Z' });
    expect(screen.getByText('Running')).toBeTruthy();
    expect(screen.getByText(/Reading 300 conversations/)).toBeTruthy();
    expect(screen.queryByText(/resumes? by itself/)).toBeNull();
    expect(screen.queryByText(/due to resume/)).toBeNull();
    expect(screen.queryByText('Needs attention')).toBeNull();
    expect(screen.queryByText(/Paused — resumes from/)).toBeNull();
  });

  it('a running resumed mine over an older FAILED + limit record: failed said, pause said as resumed', async () => {
    view = untracked({ runs: [running(), { ...failedPause('kb0'), resumed: true }] });
    await renderPanel(runningSession);
    expect(screen.getByText(/2 conversations could not be mined/)).toBeTruthy();
    expect(screen.getByText(/mining has resumed and is running now/)).toBeTruthy();
    expect(screen.queryByText(/resumes? by itself/)).toBeNull();
    expect(screen.queryByText(/due to resume/)).toBeNull();
    expect(screen.getAllByText(/AI limit for KB processing/)).toHaveLength(1);
  });

  it('a paused record opened in detail after a later mine FINISHED: past tense, never "resumes by itself" (pass 10)', async () => {
    view = untracked({
      runs: [
        kbRun({
          id: 'kb2',
          outcome: 'done',
          workRemaining: false,
          kbThreadsDone: 300,
          startedAt: '2026-09-30T17:00:00.000Z',
        }),
        // Its `paused` problem superseded by the later done mine (BE runsView kbRunViews).
        kbRun({
          id: 'kb0',
          outcome: 'paused',
          problems: [],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
        }),
      ],
    });
    await renderPanel({ ...runningSession, isProcessing: false, status: 'idle' }, 'kb0');
    expect(
      screen.getByText(
        'Paused by the daily AI limit for KB processing; a later KB run of this mailbox has been recorded since.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/resumes? by itself/)).toBeNull();
  });

  it('a paused record under the record that CLOSED it (not continued): past tense too (pass 10)', async () => {
    view = untracked({
      runs: [
        // be-toklim-wt 3d0b965e kbRunLedger closeKbRunPause: done, nothing read, why.
        kbRun({
          id: 'close',
          outcome: 'done',
          kbThreads: 0,
          kbThreadsDone: 0,
          kbPairsSaved: 0,
          found: 0,
          stoppedBy: 'kb_off',
          startedAt: '2026-09-30T17:00:00.000Z',
        }),
        kbRun({
          id: 'kb0',
          outcome: 'paused',
          problems: [],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
        }),
      ],
    });
    await renderPanel({ ...runningSession, isProcessing: false, status: 'idle' }, 'kb0');
    expect(screen.getByText(/a later KB run of this mailbox has been recorded since/)).toBeTruthy();
    expect(screen.queryByText(/resumes? by itself/)).toBeNull();
  });

  it('CONTROL: the same record opened with NO later mine still says when it resumes', async () => {
    view = untracked({
      runs: [
        // be-toklim-wt 415635b0 runsView: nothing later supersedes it, so it carries `paused`.
        kbRun({
          id: 'kb0',
          outcome: 'paused',
          problems: ['paused'],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
        }),
      ],
    });
    await renderPanel({ ...runningSession, isProcessing: false, status: 'idle' }, 'kb0');
    expect(screen.getByText(/Mining resumes by itself after 00:00 UTC on 2026-10-01/)).toBeTruthy();
    expect(screen.queryByText(/a later KB run/)).toBeNull();
  });

  // The pair above differs in TWO things (the later record and `problems`), so it does not pin
  // which one decides (pass 12 NIT). Here only the later record differs from the CONTROL: a rule
  // keyed on `problems` instead of a later KB run would keep the present tense and fail.
  // The later record is an INTERRUPTED mine (outcome 'running', not live): be-toklim-wt b046e2f9
  // kbRunViews sets `laterDone` only for a later FINISHED KB record, so under this one the older
  // record really keeps `['paused']` — a reachable screen (FE audit pass 13, NIT; a later `done`
  // record would have closed it to `problems: []`).
  it('a later KB record decides, not `problems`: a record still listing paused reads past tense under it', async () => {
    view = untracked({
      runs: [
        // The backend's shape (runsView problemsOf(..., interrupted=true)): an interrupted
        // record lists 'interrupted' and has no finish time (fe:tests pass 14, NIT).
        kbRun({
          id: 'interrupted',
          outcome: 'running',
          active: false,
          problems: ['interrupted'],
          finishedAt: null,
          kbThreadsDone: 10,
          startedAt: '2026-09-30T17:00:00.000Z',
        }),
        kbRun({
          id: 'kb0',
          outcome: 'paused',
          problems: ['paused'],
          stoppedBy: 'kb_token_limit',
          resumesAt: '2026-10-01T00:00:00.000Z',
        }),
      ],
    });
    await renderPanel({ ...runningSession, isProcessing: false, status: 'idle' }, 'kb0');
    expect(screen.getByText(/a later KB run of this mailbox has been recorded since/)).toBeTruthy();
    expect(screen.queryByText(/resumes? by itself/)).toBeNull();
  });

  // be-toklim-wt 3d0b965e kbProgressParkedJobs.test: a session ending with parked jobs leaves them
  // out of `messages.total` — the paused kb:completed carries processed === total.
  it('a paused session whose total left out the parked jobs never reads "N of N"', async () => {
    view = untracked();
    await renderPanel({ ...pausedSession, kbMessagesTotal: 40, kbMessagesProcessed: 40 });
    expect(screen.queryByText(/40 of 40/)).toBeNull();
    expect(
      screen.getByText(/40 messages processed\. Paused at today’s AI limit — the rest resume from/)
    ).toBeTruthy();
  });

  it('one message processed is singular (pass 10 NIT)', async () => {
    view = untracked();
    await renderPanel({ ...pausedSession, kbMessagesTotal: 1, kbMessagesProcessed: 1 });
    expect(screen.getByText(/: 1 message processed\. Paused at today’s AI limit/)).toBeTruthy();
  });

  // FE audit pass 13, LOW: be-toklim-wt b046e2f9 forceCompleteKBProcessing (the stale cleanup /
  // safety timeout) sends `{status:'failed', forced:true, reason:'timeout', paused, resumesAt}`.
  // Parked jobs already left `messages.total`, so 40 − 30 = jobs that NEVER reported — not work
  // that resumes. The line says the force-end and promises only the paused work.
  // 'manual' has no backend caller today (both forceCompleteKBProcessing calls in d2d5d252 pass
  // 'timeout'): its words are a defensive fallback for any other reason (pass 14, NIT).
  it.each([
    ['timeout', 'timed out'],
    ['manual', 'was stopped'],
  ])(
    'a %s force-end with parked jobs: no "N of M … resumes" over unreported jobs',
    async (reason, said) => {
      view = untracked();
      await renderPanel({
        ...pausedSession,
        kbMessagesTotal: 40,
        kbMessagesProcessed: 30,
        kbPauseStoppedEarly: reason,
      });
      expect(
        screen.getByText(
          new RegExp(
            `: 30 messages processed; this run ${said} before every message reported\\. Work paused at today’s AI limit resumes from `
          )
        )
      ).toBeTruthy();
      expect(screen.queryByText(/30 of 40/)).toBeNull();
      expect(screen.queryByText(/the rest resume/)).toBeNull();
    }
  );

  // FE audit pass 14, LOW: be-toklim-wt d2d5d252 — a poll's session that takes the day's carried
  // pause and finds no KB work (settleKBRunTotal 0 ⇒ cancelIdleKBProcessing) ends paused 0 of 0.
  it('a carried pause ending at 0 of 0: no count, never "0 messages processed … the rest"', async () => {
    view = untracked();
    await renderPanel({ ...pausedSession, kbMessagesTotal: 0, kbMessagesProcessed: 0 });
    expect(
      screen.getByText(
        /^Knowledge-base mining on this mailbox: paused at today’s AI limit\. Parked work resumes from 00:00 UTC on 2026-10-01 /
      )
    ).toBeTruthy();
    expect(screen.queryByText(/0 messages processed|the rest resume/)).toBeNull();
  });

  it("CONTROL: the limit's own pause (no force-end) keeps its words", async () => {
    view = untracked();
    await renderPanel({ ...pausedSession, kbMessagesTotal: 40, kbMessagesProcessed: 30 });
    expect(screen.getByText(/: 30 of 40 messages\. Paused — resumes from /)).toBeTruthy();
    expect(screen.queryByText(/before every message reported/)).toBeNull();
  });
});

// FE audit pass 14, LOW: the header said "Done" with a green check above the "Paused" line.
// Pass 16, NIT: "KB paused", not a bare "Paused" — mail checks of the mailbox keep running.
describe('the panel header beside the socket KB paused line', () => {
  it('a paused session with no run record: "KB paused", not "Done"', async () => {
    view = untracked({ runs: [] });
    await renderPanel();
    expect(screen.getByText(/Paused — resumes from/)).toBeTruthy();
    expect(screen.getByTestId('panel-status').textContent).toBe('KB paused');
    // No success check beside it.
    expect(screen.getByTestId('processing-panel').querySelector('svg.text-success')).toBeNull();
  });

  it('CONTROL: the same session with no pause reads "Done"', async () => {
    view = untracked({ runs: [] });
    await renderPanel({ ...pausedSession, kbPausedUntil: undefined });
    expect(screen.queryByText(/Paused/)).toBeNull();
    expect(screen.getByTestId('panel-status').textContent).toBe('Done');
    expect(screen.getByTestId('processing-panel').querySelector('svg.text-success')).not.toBeNull();
  });
});
