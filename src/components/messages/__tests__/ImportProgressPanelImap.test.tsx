/**
 * FE-3b (D15): an IMAP source's tracked import run (BE-12). The backend now answers
 * `tracked: true` for a mailbox source with `run.channel: 'email'`; the panel draws it like a
 * Gmail run, with the IMAP-specific words: a capped listing is a floor that is never continued
 * (offer Recount), messages without a Message-ID are not in the total, a failed listing says why,
 * and a knowledge-base IMAP run is not "done" until the history sweep has ended.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingSession } from '@/hooks/useEmailProcessingSessions';
import type {
  ImportProgress,
  ProcessingSummaryEntry,
  RunView,
  StageProgress,
  TrackedImport,
} from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { ImportProgressPanel } from '../ImportProgressPanel';
import { makeRun } from '@/components/processing/__tests__/fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

/** Plain functions, not module-level vi.fn (vitest 4 trap). */
const views = new Map<number, ImportProgress>();
const recounted: number[] = [];
vi.mock('@/services/importProgress.service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  importProgressService: {
    get: (sourceId: number) => Promise.resolve({ ...views.get(sourceId)! }),
    recount: (sourceId: number) => {
      recounted.push(sourceId);
      return Promise.resolve();
    },
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('@/components/processing/ProcessingPanels');

const stage = (over: Partial<StageProgress> & Pick<StageProgress, 'stage'>): StageProgress => ({
  done: 0,
  total: 0,
  projected: false,
  eta: { state: 'estimating' },
  ...over,
});

const imap = (
  over: {
    run?: Partial<TrackedImport['run']>;
    progress?: Partial<NonNullable<TrackedImport['progress']>>;
  } = {}
): TrackedImport => ({
  tracked: true,
  run: {
    state: 'ready',
    channel: 'email',
    startedAt: '2026-10-09T09:00:00.000Z',
    countedAt: '2026-10-09T09:00:30.000Z',
    total: 1200,
    capped: false,
    cappedBy: null,
    countingOn: false,
    query: null,
    error: null,
    ...over.run,
  },
  progress: {
    total: 1200,
    capped: false,
    imported: 400,
    drained: false,
    notStored: 0,
    awaitingRouting: 0,
    unrecorded: 0,
    stages: [
      stage({ stage: 'imported', done: 400, total: 1200, eta: { state: 'estimating' } }),
      stage({ stage: 'decided', done: 300, total: 400 }),
    ],
    eta: { state: 'estimating' },
    sampledAt: '2026-10-09T09:05:00.000Z',
    ...over.progress,
  },
});

afterEach(() => cleanup());

const rejectLater = (): Promise<void> => Promise.reject(new Error('nope'));

describe('an IMAP tracked run in the panel', () => {
  it('renders the listed total and the stages', () => {
    render(<ImportProgressPanel data={imap()} />);
    expect(screen.getByText('Imported')).toBeTruthy();
    expect(screen.getByText(/400 \/ 1,200/)).toBeTruthy();
    expect(screen.getByText('Checked')).toBeTruthy();
    expect(screen.getByText(/300 \/ 400/)).toBeTruthy();
  });

  it('a counting IMAP run says it is counting', () => {
    const data = imap({ run: { state: 'counting', total: null } });
    delete data.progress;
    render(<ImportProgressPanel data={data} />);
    expect(screen.getByText(/Counting the messages in the mailbox/)).toBeTruthy();
  });

  it('capped: the total is a floor, said as "at least", with no "carries on" and no bar against it', () => {
    const data = imap({
      run: { capped: true, cappedBy: 'size', total: 20000 },
      progress: {
        total: 20000,
        capped: true,
        stages: [
          stage({
            stage: 'imported',
            done: 400,
            total: 20000,
            eta: { state: 'unknown', reason: 'listing_capped', stage: 'imported' },
          }),
        ],
        eta: { state: 'unknown', reason: 'listing_capped', stage: 'imported' },
      },
    });
    render(<ImportProgressPanel data={data} />);
    expect(
      screen.getByText('The mailbox listing stopped at the limit, so the total is at least 20,000.')
    ).toBeTruthy();
    expect(screen.getByText(/400 \/ 20,000\+/)).toBeTruthy();
    expect(screen.queryByText(/carries on/)).toBeNull();
    expect(screen.queryByText(/Counting stopped at/)).toBeNull();
  });

  it('a listing that could not read a folder does not claim a limit was reached', () => {
    const data = imap({
      run: { capped: true, cappedBy: 'error', total: 900 },
      progress: { total: 900, capped: true },
    });
    render(<ImportProgressPanel data={data} />);
    expect(screen.queryByText(/stopped at the limit/)).toBeNull();
    expect(screen.getByText(/at least 900/)).toBeTruthy();
  });

  it('unverifiable: says how many have no Message-ID and are not counted; singular reads right', () => {
    const { rerender } = render(<ImportProgressPanel data={imap({ run: { unverifiable: 7 } })} />);
    expect(screen.getByText('7 messages have no Message-ID and are not counted.')).toBeTruthy();
    rerender(<ImportProgressPanel data={imap({ run: { unverifiable: 1 } })} />);
    expect(screen.getByText('1 message has no Message-ID and is not counted.')).toBeTruthy();
    rerender(<ImportProgressPanel data={imap({ run: { unverifiable: 0 } })} />);
    expect(screen.queryByText(/Message-ID/)).toBeNull();
    rerender(<ImportProgressPanel data={imap()} />);
    expect(screen.queryByText(/Message-ID/)).toBeNull();
  });

  it('a KB IMAP run whose every listed message is stored is NOT "Finished" until the sweep has ended', () => {
    const done = { state: 'done' } as const;
    const data = imap({
      progress: {
        imported: 1200,
        drained: false,
        stages: [stage({ stage: 'imported', done: 1200, total: 1200, eta: done })],
        eta: done,
      },
    });
    const { rerender } = render(<ImportProgressPanel data={data} />);
    expect(screen.getByTestId('import-eta').textContent).not.toMatch(/Finished/);
    expect(screen.getByTestId('import-eta').textContent).toMatch(/has not finished/);
    rerender(
      <ImportProgressPanel data={imap({ progress: { ...data.progress!, drained: true } })} />
    );
    expect(screen.getByTestId('import-eta').textContent).toBe('Finished');
  });

  it('a Gmail run (no channel) with eta done is still "Finished"', () => {
    const done = { state: 'done' } as const;
    const data = imap({
      progress: { drained: false, stages: [], eta: done },
    });
    delete (data.run as { channel?: string }).channel;
    render(<ImportProgressPanel data={data} />);
    expect(screen.getByTestId('import-eta').textContent).toBe('Finished');
  });

  it('a failed IMAP listing says why (the backend sentence) and offers Recount', () => {
    const onRecount = vi.fn();
    const data = imap({
      run: {
        state: 'failed',
        error: 'The mailbox server did not answer in time. Try recounting in a few minutes.',
        total: null,
      },
    });
    delete data.progress;
    render(<ImportProgressPanel data={data} onRecount={onRecount} />);
    expect(screen.getByText(/The mailbox server did not answer in time/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recount' }));
    expect(onRecount).toHaveBeenCalledTimes(1);
  });

  it('Recount is offered on a capped IMAP run, and not on a healthy or Gmail one', () => {
    const capped = imap({ run: { capped: true, cappedBy: 'time' }, progress: { capped: true } });
    const { rerender } = render(<ImportProgressPanel data={capped} onRecount={() => {}} />);
    expect(screen.getByRole('button', { name: 'Recount' })).toBeTruthy();
    rerender(<ImportProgressPanel data={imap()} onRecount={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Recount' })).toBeNull();
    const gmail = imap({ run: { capped: true, cappedBy: 'size' }, progress: { capped: true } });
    delete (gmail.run as { channel?: string }).channel;
    rerender(<ImportProgressPanel data={gmail} onRecount={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Recount' })).toBeNull();
  });

  it('a recount that fails says so, never silently', async () => {
    const data = imap({ run: { capped: true, cappedBy: 'time' }, progress: { capped: true } });
    render(<ImportProgressPanel data={data} onRecount={() => rejectLater()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recount' }));
    await settle();
    expect(screen.getByText(/Could not start the recount/)).toBeTruthy();
  });
});

describe('FE-X: truthful IMAP panel labels', () => {
  const done = { state: 'done' } as const;

  it('"Every listed message is in" is said only when imported >= total; otherwise the softer line', () => {
    const stages = [stage({ stage: 'imported', done: 400, total: 1200, eta: done })];
    render(
      <ImportProgressPanel
        data={imap({ progress: { imported: 400, drained: false, stages, eta: done } })}
      />
    );
    const text = screen.getByTestId('import-eta').textContent ?? '';
    expect(text).not.toMatch(/Every listed message is in/);
    expect(text).toMatch(/has not finished/);
  });

  it('the sweep_owed reason is worded, never the raw value', () => {
    const owed = { state: 'unknown', reason: 'sweep_owed', stage: 'imported' } as const;
    render(
      <ImportProgressPanel
        data={imap({
          progress: {
            imported: 1200,
            drained: false,
            stages: [stage({ stage: 'imported', done: 1200, total: 1200, eta: owed })],
            eta: owed,
          },
        })}
      />
    );
    const text = screen.getByTestId('import-eta').textContent ?? '';
    expect(text).toBe(
      'Every listed message is in; the knowledge-base history read has not finished yet.'
    );
    expect(document.body.textContent).not.toMatch(/sweep_owed/);
    expect(text).not.toMatch(/more messages than were counted/);
  });

  it('sweep_owed survives the response normaliser', async () => {
    const { normaliseEta } = await import('@/services/importProgress.service');
    expect(normaliseEta({ state: 'unknown', reason: 'sweep_owed', stage: 'imported' })).toEqual({
      state: 'unknown',
      reason: 'sweep_owed',
      stage: 'imported',
    });
  });

  it('total 0 and not capped still says how many messages have no Message-ID', () => {
    render(
      <ImportProgressPanel
        data={imap({ run: { total: 0, unverifiable: 5 }, progress: { total: 0, imported: 0 } })}
      />
    );
    expect(screen.getByText('Nothing to import.')).toBeTruthy();
    expect(screen.getByText('5 messages have no Message-ID and are not counted.')).toBeTruthy();
  });

  it('any failed IMAP listing offers Recount and does not say progress will show', () => {
    const data = imap({
      run: {
        state: 'failed',
        error:
          'This IMAP source has no stored connection details. Edit it and save, then try again.',
        total: null,
      },
    });
    delete data.progress;
    render(<ImportProgressPanel data={data} onRecount={() => {}} />);
    expect(screen.getByText(/no stored connection details/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recount' })).toBeTruthy();
    expect(screen.queryByText(/Progress will show once/)).toBeNull();
  });

  it('a refresh that fails after a recount that started is not "Could not start the recount"', async () => {
    const data = imap({ run: { capped: true, cappedBy: 'time' }, progress: { capped: true } });
    render(
      <ImportProgressPanel data={data} onRecount={() => {}} onRecounted={() => rejectLater()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recount' }));
    await settle();
    expect(screen.queryByText(/Could not start the recount/)).toBeNull();
  });

  it('capped and not drained: still the floor words, the hold line, and Recount', () => {
    const stages = [
      stage({
        stage: 'imported',
        done: 20000,
        total: 20000,
        eta: { state: 'unknown', reason: 'listing_capped', stage: 'imported' },
      }),
    ];
    render(
      <ImportProgressPanel
        data={imap({
          run: { capped: true, cappedBy: 'size', total: 20000 },
          progress: {
            total: 20000,
            capped: true,
            imported: 20000,
            drained: false,
            stages,
            eta: { state: 'unknown', reason: 'listing_capped', stage: 'imported' },
          },
        })}
        onRecount={() => {}}
      />
    );
    expect(screen.getByText(/at least 20,000/)).toBeTruthy();
    expect(screen.getByTestId('import-eta').textContent).not.toMatch(/Finished|Every listed/);
    expect(screen.getByRole('button', { name: 'Recount' })).toBeTruthy();
  });
});

// ---- Wired into the processing panel --------------------------------------------------------

const summaryEntry = (): ProcessingSummaryEntry => ({
  sourceId: 5,
  name: 'Support IMAP',
  type: 'email',
  unavailable: false,
  inProgress: 1,
  problems: 0,
  countCapped: false,
});
const settle = () => act(async () => {});
const running = (over: Partial<RunView> = {}) =>
  makeRun({
    channel: 'imap',
    outcome: 'running',
    active: true,
    finishedAt: null,
    saved: 0,
    stages: null,
    ...over,
  });
const withRuns = (tracked: TrackedImport, runs: RunView[]): ImportProgress => ({
  ...tracked,
  runs,
  kbMiningFailures: [],
  kbMiningFailuresTruncated: false,
  countCapped: false,
  runsUnavailable: false,
});
const mount = () =>
  render(
    <MemoryRouter>
      <ProcessingPanels
        organizationId={1}
        sessions={new Map<string, ProcessingSession>()}
        summary={[summaryEntry()]}
      />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  views.clear();
  recounted.length = 0;
  useProcessingPanelStore.getState().reset();
});

describe('the processing panel with an IMAP tracked run', () => {
  it('shows the tracked run for an email source (no Gmail-only gate)', async () => {
    views.set(5, withRuns(imap({ run: { unverifiable: 3 } }), [running({ found: 25 })]));
    mount();
    await settle();
    expect(screen.getByText(/400 \/ 1,200/)).toBeTruthy();
    // IMAP-only words: they appear only if the wired panel treats the run as IMAP.
    expect(screen.getByText('3 messages have no Message-ID and are not counted.')).toBeTruthy();
  });

  it('keeps showing a KB IMAP run that is all stored but not drained: not closed, not "Finished"', async () => {
    const done = { state: 'done' } as const;
    views.set(
      5,
      withRuns(
        imap({
          progress: {
            imported: 1200,
            drained: false,
            stages: [stage({ stage: 'imported', done: 1200, total: 1200, eta: done })],
            eta: done,
          },
        }),
        []
      )
    );
    mount();
    await settle();
    expect(screen.getByTestId('processing-panel')).toBeTruthy();
    expect(screen.getByTestId('import-eta').textContent).not.toMatch(/Finished/);
  });

  it('a failed IMAP listing waits for a Recount: it does not open the panel by itself or read as processing', async () => {
    const failed = imap({
      run: {
        state: 'failed',
        error: 'Could not list the mailbox. Try recounting in a few minutes.',
        total: null,
      },
    });
    delete failed.progress;
    views.set(5, withRuns(failed, []));
    mount();
    await settle();
    expect(screen.queryByTestId('processing-panel')).toBeNull();
  });

  it('a failed IMAP listing is shown with Recount, and Recount asks the backend once', async () => {
    views.set(
      5,
      withRuns(
        imap({
          run: {
            state: 'failed',
            error: 'Could not list the mailbox. Try recounting in a few minutes.',
            total: null,
          },
        }),
        [running({ found: 25 })]
      )
    );
    mount();
    await settle();
    expect(screen.getByText(/Could not list the mailbox/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Recount' }));
    await settle();
    expect(recounted).toEqual([5]);
  });
});
