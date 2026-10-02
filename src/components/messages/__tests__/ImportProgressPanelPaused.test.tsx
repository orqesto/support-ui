/**
 * BE R16 (be-toklim-wt 44f0f921, importProgressEta `StageEta`): work a daily AI token limit PARKED
 * is `{ state: 'paused', stage?, until }` — per stage (`kb`) and overall. R16 ranked the overall
 * eta stalled > paused > unknown > estimating > running; R17 (3b34ff75 `overallEta`) ranks paused
 * LAST — overall paused only when every open stage is paused (see the R17 block below). Before
 * this FE knew the state the line rendered blank.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { describeEta, ImportProgressPanel } from '../ImportProgressPanel';
import type { StageEta, TrackedImport } from '@/services/importProgress.service';

const UNTIL = '2026-10-02T00:00:00.000Z';
let tzBefore: string | undefined;
beforeAll(() => {
  // Tokyo is UTC+9: the local clock differs from the UTC one, so both must be said.
  tzBefore = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
});
afterAll(() => {
  if (tzBefore === undefined) delete process.env.TZ;
  else process.env.TZ = tzBefore;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The real BE shape: a paused KB stage has `leftover: 0` and the overall eta names the stage.
const paused = (until: string): TrackedImport => ({
  tracked: true,
  run: {
    state: 'ready',
    startedAt: '2026-10-01T09:00:00.000Z',
    countedAt: '2026-10-01T09:01:00.000Z',
    total: 300,
    capped: false,
    cappedBy: null,
    query: 'after:2026/09/24',
    error: null,
  },
  progress: {
    total: 300,
    capped: false,
    imported: 300,
    drained: true,
    notStored: 0,
    awaitingRouting: 0,
    unrecorded: 0,
    stages: [
      { stage: 'imported', done: 300, total: 300, projected: false, eta: { state: 'done' } },
      {
        stage: 'kb',
        done: 120,
        total: 180,
        projected: false,
        leftover: 0,
        eta: { state: 'paused', stage: 'kb', until },
      },
    ],
    eta: { state: 'paused', stage: 'kb', until },
    sampledAt: '2026-10-01T18:00:00.000Z',
  },
});

describe('import progress paused by a daily AI limit (BE R16)', () => {
  it('says it is paused and when it continues, in UTC and the reader’s time — never a blank line', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
    render(<ImportProgressPanel data={paused(UNTIL)} />);
    expect(screen.getByTestId('import-eta').textContent).toBe(
      'Paused at today’s AI limit for KB processing — continues from 00:00 UTC (09:00 your time)'
    );
  });

  // FE audit pass 17, P17-F1: parked jobs wake over a 30-min spread after the reset.
  it('just past the reset (within the grace): continuing — not late, not still to come', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T00:05:00.000Z'));
    const line = describeEta({ state: 'paused', stage: 'kb', until: UNTIL });
    expect(line).toBe(
      'Paused at the daily AI limit for KB processing; continuing after 00:00 UTC (09:00 your time)'
    );
    expect(line).not.toMatch(/continues from|was due/);
  });

  it('past the grace: it WAS due, with the date', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T01:00:00.000Z'));
    expect(describeEta({ state: 'paused', stage: 'kb', until: UNTIL })).toBe(
      'Paused at the daily AI limit for KB processing; it was due to continue at 00:00 UTC on 2026-10-02 (09:00 your time)'
    );
  });

  // FE audit pass 17 (queued): the one eta line names one stage — the backend ranks stalled over
  // paused, and paused over a stage still running.
  const withStages = (eta: StageEta, analysis: StageEta): TrackedImport => {
    const base = paused(UNTIL);
    if (!base.progress) throw new Error('fixture');
    return {
      ...base,
      progress: {
        ...base.progress,
        stages: [
          ...base.progress.stages,
          { stage: 'analysis', done: 40, total: 100, projected: false, leftover: 0, eta: analysis },
        ],
        eta,
      },
    };
  };
  const stageLines = () => screen.queryAllByTestId('import-stage-eta').map((li) => li.textContent);

  it('overall stalled on another stage: the KB stage paused at the limit is still said', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
    render(
      <ImportProgressPanel
        data={withStages({ state: 'stalled', stage: 'analysis' }, { state: 'stalled' })}
      />
    );
    expect(screen.getByTestId('import-eta').textContent).toMatch(/^No progress in AI analysis/);
    expect(stageLines()).toEqual([
      'Paused at today’s AI limit for KB processing — continues from 00:00 UTC (09:00 your time).',
    ]);
  });

  // Only an R16 backend sends this pair: R17 says `running` overall while a stage still runs.
  it('an older BE (R16): overall paused while another stage still runs — that stage’s finish is said too', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
    render(
      <ImportProgressPanel
        data={withStages(
          { state: 'paused', stage: 'kb', until: UNTIL },
          { state: 'running', minMinutes: 3, maxMinutes: 3 }
        )}
      />
    );
    expect(stageLines()).toEqual(['AI analysis: About 3 min left.']);
  });

  it('CONTROL: overall paused on the only open stage — no extra line', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
    render(<ImportProgressPanel data={paused(UNTIL)} />);
    expect(stageLines()).toEqual([]);
  });

  it('no stage named, or an unreadable time: still says paused, with no invented time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
    expect(describeEta({ state: 'paused', until: UNTIL })).toBe(
      'Paused at today’s AI limit — continues from 00:00 UTC (09:00 your time)'
    );
    expect(describeEta({ state: 'paused', stage: 'kb', until: 'garbage' })).toBe(
      'Paused at today’s AI limit for KB processing — continues after the daily reset'
    );
  });

  it('CONTROL: an older BE never sends `paused` — the other states read as before', () => {
    const older: StageEta[] = [{ state: 'estimating' }, { state: 'stalled', stage: 'kb' }];
    expect(older.map((eta) => describeEta(eta))).toEqual([
      'Measuring the rate. An estimate needs 5 minutes of progress.',
      'No progress in Knowledge base for 15 minutes, so the finish time is unknown',
    ]);
  });

  // BE R17: overall precedence stalled > unknown > estimating > running > paused — an import still
  // moving beside a KB pause reads `running` (min ≥ minutes to the reset, max null), and the pause
  // is only on stages[].eta: it must still be said.
  it('overall running beside a KB stage paused at the limit: the pause is still said', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T18:00:00.000Z'));
    const base = withStages(
      { state: 'running', minMinutes: 360, maxMinutes: null },
      { state: 'running', minMinutes: 20, maxMinutes: 30 }
    );
    render(<ImportProgressPanel data={base} />);
    expect(screen.getByTestId('import-eta').textContent).toBe('At least 6 h left');
    expect(stageLines()).toEqual([
      'Paused at today’s AI limit for KB processing — continues from 00:00 UTC (09:00 your time).',
    ]);
    vi.useRealTimers();
  });

  it('between the reset and resumeWindowEnd a paused eta with `until` in the past is not late', () => {
    const eta: StageEta = {
      state: 'paused',
      stage: 'kb',
      until: UNTIL,
      resumeWindowEnd: '2026-10-02T00:30:00.000Z',
    };
    expect(describeEta(eta, Date.parse('2026-10-02T00:20:00.000Z'))).toBe(
      'Paused at the daily AI limit for KB processing; continuing after 00:00 UTC (09:00 your time)'
    );
    // Past the backend's window (35 min — inside the older FE grace): late.
    expect(describeEta(eta, Date.parse('2026-10-02T00:35:00.000Z'))).toMatch(
      /it was due to continue at/
    );
  });
});
