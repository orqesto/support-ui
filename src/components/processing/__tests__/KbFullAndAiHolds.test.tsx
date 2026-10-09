/**
 * FE-3a fix round 1: a full knowledge base and an AI outage are said in their own words wherever the
 * sibling holds are said — the run's details and badge, the panel header, the bell, and the
 * retry plan — never as a generic "stalled" / "Work left".
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ServiceModule from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { describePause, runStatusLabel } from '../processingWords';
import { makeKbRun, makeRun, untracked } from './fixtures';
import { owedOf, retryOf, stageRetry, stalled } from './owedFixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

let view: ServiceModule.ImportProgress = untracked();
let retryAnswer: (dryRun: boolean) => Promise<unknown> = (dryRun) =>
  Promise.resolve(retryOf(dryRun));
vi.mock('@/services/importProgress.service', async (importOriginal) => {
  const actual = await importOriginal<typeof ServiceModule>();
  return {
    ...actual,
    importProgressService: {
      ...actual.importProgressService,
      get: () => Promise.resolve({ ...view }),
      dismissKbFailure: () => Promise.resolve(),
      owed: () => Promise.resolve(actual.normaliseRunOwed(owedOf())),
      retryOwed: async (_s: number, _r: string, dryRun: boolean) =>
        actual.normaliseRetryOwed(await retryAnswer(dryRun)),
    },
  };
});

const { ProcessingPanels } = await import('../ProcessingPanels');
const { ProcessingIndicator } = await import('../ProcessingIndicator');
const { RunDetails } = await import('../RunDetails');
const { normaliseSummary, normaliseRetryOwed } = await import('@/services/importProgress.service');

const FULL_HOLD =
  'Waiting for room: the knowledge base is full — 12 conversations wait to be mined.';

/** A mail run whose only owed work is KB work a full KB holds (no `stalled` problem). */
const heldRun = (over: Partial<ServiceModule.RunView> = {}) =>
  makeRun({
    workRemaining: true,
    problems: [],
    kbFullHold: { kind: 'kb_full', owedThreads: 12 },
    stages: {
      decided: { queued: 3, done: 3 },
      analysis: { queued: 3, done: 3 },
      embedding: { queued: 3, done: 3 },
      kb: { queued: 12, done: 0 },
      awaitingRouting: 0,
    },
    ...over,
  });

const entry = (over: Partial<ServiceModule.ProcessingSummaryEntry> = {}) => ({
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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
  view = untracked();
  retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun));
});
afterEach(cleanup);

describe('runs[].kbFullHold', () => {
  it('the run details say the KB is full with the owed count, badge "KB full", never "Work left"', () => {
    render(
      <MemoryRouter>
        <RunDetails run={heldRun()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId('run-kb-full')).toHaveTextContent(FULL_HOLD);
    expect(screen.getByText('KB full')).toBeInTheDocument();
    expect(screen.queryByText('Work left')).toBeNull();
    expect(runStatusLabel(heldRun())).toBe('KB full');
  });

  it('CONTROL: a run without the hold keeps its own words', () => {
    expect(runStatusLabel(heldRun({ kbFullHold: undefined }))).toBe('Done');
  });

  it('the panel header reads "KB full", not "Done"', async () => {
    view = untracked({ runs: [heldRun()] });
    render(
      <MemoryRouter>
        <ProcessingPanels organizationId={1} sessions={new Map()} summary={[entry()]} />
      </MemoryRouter>
    );
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await act(async () => {});
    expect(screen.getByTestId('panel-status').textContent).toBe('KB full');
  });

  it('an older run held by a full KB is named, not "still being processed"', async () => {
    view = untracked({
      runs: [
        makeRun({ id: 'new', startedAt: new Date().toISOString() }),
        heldRun({ id: 'old', startedAt: '2026-10-01T10:00:00.000Z' }),
      ],
    });
    render(
      <MemoryRouter>
        <ProcessingPanels organizationId={1} sessions={new Map()} summary={[entry()]} />
      </MemoryRouter>
    );
    act(() => useProcessingPanelStore.getState().open(5, 'manual'));
    await act(async () => {});
    expect(screen.getByTestId('older-kb-full')).toHaveTextContent(FULL_HOLD);
    expect(screen.queryByText(/is still being processed/)).toBeNull();
  });
});

describe('summary kbFullHeld (the bell)', () => {
  it('is read from the summary and said, with a count', () => {
    expect(normaliseSummary([{ sourceId: 1, kbFullHeld: 2 }])[0].kbFullHeld).toBe(2);
    expect(normaliseSummary([{ sourceId: 1 }])[0].kbFullHeld).toBe(0);
    render(<ProcessingIndicator entries={[entry({ kbFullHeld: 2 })]} onOpen={vi.fn()} />);
    expect(screen.getByTestId('processing-indicator').getAttribute('aria-label')).toBe(
      '2 runs are waiting for room in the knowledge base.'
    );
  });
  it('CONTROL: 0 and the bell stays hidden', () => {
    const { container } = render(
      <ProcessingIndicator entries={[entry({ kbFullHeld: 0 })]} onOpen={vi.fn()} />
    );
    expect(container.textContent).toBe('');
  });
  it('clicking opens the held mailbox', () => {
    const onOpen = vi.fn();
    render(<ProcessingIndicator entries={[entry({ kbFullHeld: 1 })]} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('processing-indicator'));
    expect(onOpen).toHaveBeenCalledWith([5]);
  });
});

describe('retry-owed kbFull / aiUnavailable', () => {
  it('normalises the counts and the reason', () => {
    const result = normaliseRetryOwed(
      retryOf(true, {
        aiUnavailable: 'rate_limited',
        kb: stageRetry({ owed: 2, aiUnavailable: 2 }),
      })
    );
    expect(result.kb.aiUnavailable).toBe(2);
    expect(result.aiUnavailableReason).toBe('rate_limited');
    expect(normaliseRetryOwed(retryOf(true, { kb: stageRetry({ kbFull: 3 }) })).kb.kbFull).toBe(3);
  });

  const plan = async () => {
    render(
      <MemoryRouter>
        <RunDetails run={stalled()} sourceId={7} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /What's holding this check/ }));
    await waitFor(() => expect(screen.queryByTestId('owed-loading')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /^Retry$/ }));
    return screen.findByTestId('retry-plan');
  };

  it('a full KB: the plan says nothing was queued because it is full', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(retryOf(dryRun, { kbFull: true, kb: stageRetry({ owed: 2, kbFull: 2 }) }));
    const view_ = within(await plan());
    expect(view_.getByTestId('retry-kb-withheld')).toHaveTextContent(
      'No knowledge-base work will be queued: the knowledge base is full. Make room, then retry.'
    );
  });

  it('an AI outage: the plan names it in words, never the raw reason', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, {
          aiUnavailable: 'rate_limited',
          kb: stageRetry({ owed: 2, aiUnavailable: 2 }),
        })
      );
    const view_ = within(await plan());
    const line = view_.getByTestId('retry-kb-withheld');
    expect(line).toHaveTextContent('No knowledge-base work will be queued: AI is unavailable');
    expect(line.textContent).not.toContain('rate_limited');
  });

  it('the plan says "will be queued"; the applied result says "was queued"', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(retryOf(dryRun, { kbFull: true, kb: stageRetry({ owed: 2, kbFull: 2 }) }));
    const dryPlan = within(await plan());
    expect(dryPlan.getByTestId('retry-kb-withheld')).toHaveTextContent(
      'No knowledge-base work will be queued: the knowledge base is full. Make room, then retry.'
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm retry/ }));
    const done = within(await screen.findByTestId('retry-done'));
    expect(done.getByTestId('retry-kb-withheld')).toHaveTextContent(
      'No knowledge-base work was queued: the knowledge base is full. Make room, then retry.'
    );
  });

  it('search-index retries ran while the KB part is withheld: both lines are true together', async () => {
    retryAnswer = (dryRun) =>
      Promise.resolve(
        retryOf(dryRun, {
          kbFull: true,
          embedding: stageRetry({ owed: 5, queued: 5 }),
          kb: stageRetry({ owed: 2, kbFull: 2 }),
        })
      );
    const dryPlan = within(await plan());
    expect(dryPlan.getByTestId('retry-embedding')).toHaveTextContent(
      '5 conversations will be retried'
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm retry/ }));
    const done = within(await screen.findByTestId('retry-done'));
    expect(done.getByTestId('retry-embedding')).toHaveTextContent('5 conversations retried');
    const line = done.getByTestId('retry-kb-withheld');
    expect(line.textContent).toContain('No knowledge-base work was queued');
    expect(line.textContent).not.toMatch(/^Nothing/);
  });

  it('CONTROL: AI available (top-level null, no KB ticket refused) says nothing of it', async () => {
    retryAnswer = (dryRun) => Promise.resolve(retryOf(dryRun, { aiUnavailable: null }));
    expect(within(await plan()).queryByTestId('retry-kb-withheld')).toBeNull();
  });
});

describe('Stopped lines after a later KB run', () => {
  it('kb_full: past tense, no "mined when there is room" promise', () => {
    const run = makeKbRun({
      outcome: 'paused',
      problems: ['paused'],
      stoppedBy: 'kb_full',
    });
    const later = describePause(run, true);
    expect(later).toContain('a later KB run of this mailbox has been recorded since');
    expect(later).not.toMatch(/mined when there is room|press Re-mine/);
    expect(describePause(run, false)).toMatch(/mined when there is room/);
  });
  it('ai_unavailable: no "will be mined by the next Re-mine" / "retried automatically"', () => {
    const run = makeKbRun({
      outcome: 'failed',
      problems: ['failed'],
      stoppedBy: 'ai_unavailable',
      aiReason: 'rate_limited',
      retry: 'automatic',
    });
    const later = describePause(run, true) ?? '';
    expect(later).toContain('a later KB run of this mailbox has been recorded since');
    expect(later).toContain('AI was unavailable');
    expect(later).not.toMatch(/will be|retried automatically/);
    expect(later).not.toContain('rate_limited');
  });
});

describe('badges', () => {
  it('kb_full shows "Paused"; ai_unavailable shows "Not all mined"', () => {
    expect(
      runStatusLabel(makeKbRun({ outcome: 'paused', problems: ['paused'], stoppedBy: 'kb_full' }))
    ).toBe('Paused');
    expect(
      runStatusLabel(
        makeKbRun({ outcome: 'failed', problems: ['failed'], stoppedBy: 'ai_unavailable' })
      )
    ).toBe('Not all mined');
  });
});
