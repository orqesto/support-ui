/**
 * BE round 20 (be-toklim-wt, importProgressEta `StageEta`): an `unknown` finish carries a reason —
 * `listing_capped` (a capped listing counted past its floor, stage `imported`) or `limit_unreadable`
 * (the KB stage's daily limit could not be read, stage `kb`). Overall, `listing_capped` wins when
 * both hold. An older backend sends no reason; its only unknown was the capped listing.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StageEta, StageProgress, TrackedImport } from '@/services/importProgress.service';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: () => Promise.resolve({ data: {} }) } }));

const { describeEta, ImportProgressPanel } = await import('../ImportProgressPanel');
const { normaliseImportProgress } = await import('@/services/importProgress.service');

afterEach(cleanup);

const CAPPED_WORDS = 'Finish time unknown: the mailbox holds more messages than were counted';
const UNREADABLE: StageEta = { state: 'unknown', reason: 'limit_unreadable', stage: 'kb' };
const CAPPED: StageEta = { state: 'unknown', reason: 'listing_capped', stage: 'imported' };

const tracked = (stages: StageProgress[], eta: StageEta, capped = false): TrackedImport => ({
  tracked: true,
  run: {
    state: 'ready',
    startedAt: '2026-10-01T09:00:00.000Z',
    countedAt: '2026-10-01T09:01:00.000Z',
    total: 300,
    capped,
    cappedBy: capped ? 'size' : null,
    query: 'after:2026/09/24',
    error: null,
  },
  progress: {
    total: 300,
    capped,
    imported: 300,
    drained: !capped,
    notStored: 0,
    awaitingRouting: 0,
    unrecorded: 0,
    stages,
    eta,
    sampledAt: '2026-10-01T10:00:00.000Z',
  },
});

const kbStage = (eta: StageEta): StageProgress => ({
  stage: 'kb',
  done: 120,
  total: 180,
  projected: false,
  leftover: 0,
  eta,
});

describe('describeEta — unknown has two causes', () => {
  it('limit_unreadable says the limit could not be read, naming KB — never the capped listing', () => {
    const text = describeEta(UNREADABLE);
    expect(text).toBe(
      'Finish time unknown: the daily KB limit could not be checked, so whether it holds the work for KB processing is not known'
    );
    expect(text).not.toMatch(/more messages than were counted/);
  });

  it('listing_capped AND no reason (an older backend) keep the capped words', () => {
    expect(describeEta(CAPPED)).toBe(CAPPED_WORDS);
    expect(describeEta({ state: 'unknown' })).toBe(CAPPED_WORDS);
  });
});

describe('ImportProgressPanel — the unreadable KB limit is said where it applies', () => {
  it('overall unknown for the unreadable limit: the main line says so', () => {
    render(<ImportProgressPanel data={tracked([kbStage(UNREADABLE)], UNREADABLE)} />);
    expect(screen.getByTestId('import-eta')).toHaveTextContent(
      /daily KB limit could not be checked/
    );
    expect(screen.queryByText(/more messages than were counted/)).toBeNull();
    // Said once, not repeated as a stage line.
    expect(screen.queryAllByTestId('import-stage-eta')).toHaveLength(0);
  });

  it('a capped listing outranks it overall: the KB stage still says its own reason on its own line', () => {
    render(
      <ImportProgressPanel
        data={tracked(
          [
            { stage: 'imported', done: 300, total: 300, projected: false, eta: CAPPED },
            kbStage(UNREADABLE),
          ],
          CAPPED,
          true
        )}
      />
    );
    expect(screen.getByTestId('import-eta')).toHaveTextContent(CAPPED_WORDS);
    const lines = screen.getAllByTestId('import-stage-eta').map((line) => line.textContent);
    expect(lines).toEqual([
      'Finish time unknown: the daily KB limit could not be checked, so whether it holds the work for KB processing is not known.',
    ]);
  });
  // Pass 21, NIT: a stalled overall line names another stage; the KB stage's unreadable limit is
  // still said on its own line.
  it('a stalled overall line: the KB stage still says its unreadable limit on its own line', () => {
    render(
      <ImportProgressPanel
        data={tracked(
          [
            {
              stage: 'decided',
              done: 200,
              total: 300,
              projected: false,
              eta: { state: 'stalled' },
            },
            kbStage(UNREADABLE),
          ],
          { state: 'stalled', stage: 'decided' }
        )}
      />
    );
    expect(screen.getByTestId('import-eta')).toHaveTextContent(/No progress in Checked/);
    const lines = screen.getAllByTestId('import-stage-eta').map((line) => line.textContent);
    expect(lines).toEqual([
      'Finish time unknown: the daily KB limit could not be checked, so whether it holds the work for KB processing is not known.',
    ]);
  });
});

describe('normaliseImportProgress — the unknown reason', () => {
  const raw = (eta: Record<string, unknown>) => ({
    ...tracked([kbStage({ state: 'estimating' })], { state: 'estimating' }),
    progress: {
      ...tracked([], { state: 'estimating' }).progress,
      eta,
      stages: [{ ...kbStage({ state: 'estimating' }), eta }],
    },
  });
  const etas = (data: ReturnType<typeof normaliseImportProgress>) =>
    data.tracked && data.progress ? [data.progress.eta, data.progress.stages[0].eta] : [];

  it('a known reason and stage are kept', () => {
    expect(etas(normaliseImportProgress(raw({ ...UNREADABLE })))).toEqual([UNREADABLE, UNREADABLE]);
  });

  it('absent stays absent (an older backend)', () => {
    const [overall, kb] = etas(normaliseImportProgress(raw({ state: 'unknown' })));
    expect(overall).toEqual({ state: 'unknown' });
    expect('reason' in overall).toBe(false);
    expect(kb).toEqual({ state: 'unknown' });
  });

  it('a reason this build does not know is dropped — read as the capped listing, never guessed', () => {
    const data = normaliseImportProgress(
      raw({ state: 'unknown', reason: 'sunspots', stage: 'moon' })
    );
    const [overall] = etas(data);
    expect(overall).toEqual({ state: 'unknown' });
    expect(describeEta(overall)).toBe(CAPPED_WORDS);
  });

  // Pass 21, NIT: each STAGE's eta is normalised too, not only the overall one.
  it('a stage’s unknown reason is normalised on its own', () => {
    const data = normaliseImportProgress({
      ...raw({ state: 'estimating' }),
      progress: {
        ...raw({ state: 'estimating' }).progress,
        stages: [{ ...kbStage({ state: 'estimating' }), eta: { state: 'unknown', reason: 'x' } }],
      },
    });
    const [overall, kb] = etas(data);
    expect(overall).toEqual({ state: 'estimating' });
    expect(kb).toEqual({ state: 'unknown' });
  });

  it('every other eta passes through unchanged', () => {
    const paused = { state: 'paused', stage: 'kb', until: '2026-10-02T00:00:00.000Z' };
    expect(etas(normaliseImportProgress(raw(paused)))).toEqual([paused, paused]);
  });
});
