/**
 * The import progress panel says only what the backend's database counts support: a projected
 * total is marked "~", a capped listing is a floor ("N+", no percentage), and the time to finish
 * is a range, "measuring", "no progress" or "finished" — never a number the rate has not earned.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { describeEta, formatMinutes, ImportProgressPanel } from '../ImportProgressPanel';
import type { ImportProgress, StageProgress } from '@/services/importProgress.service';

afterEach(cleanup);

type Tracked = Extract<ImportProgress, { tracked: true }>;

const run: Tracked['run'] = {
  state: 'ready',
  startedAt: '2026-09-25T09:00:00.000Z',
  countedAt: '2026-09-25T09:01:00.000Z',
  total: 2255,
  capped: false,
  cappedBy: null,
  query: 'after:2026/09/18',
  error: null,
};

const stage = (over: Partial<StageProgress> & Pick<StageProgress, 'stage'>): StageProgress => ({
  done: 0,
  total: 0,
  projected: false,
  eta: { state: 'estimating' },
  ...over,
});

const tracked = (progress: Partial<NonNullable<Tracked['progress']>>): Tracked => ({
  tracked: true,
  run,
  progress: {
    total: 2255,
    capped: false,
    imported: 0,
    drained: false,
    notStored: 0,
    awaitingRouting: 0,
    unrecorded: 0,
    stages: [],
    eta: { state: 'estimating' },
    sampledAt: '2026-09-25T09:30:00.000Z',
    ...progress,
  },
});

describe('ImportProgressPanel', () => {
  it('shows each stage as done / total, marking projected totals', () => {
    render(
      <ImportProgressPanel
        data={tracked({
          imported: 900,
          stages: [
            stage({ stage: 'imported', done: 900, total: 2255 }),
            stage({ stage: 'analysis', done: 120, total: 1800, projected: true }),
          ],
          eta: { state: 'running', minMinutes: 200, maxMinutes: 320 },
        })}
      />
    );
    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText(/900 \/ 2,255/)).toBeInTheDocument();
    expect(screen.getByText(/120 \/ ~1,800/)).toBeInTheDocument();
    expect(screen.getByTestId('import-eta')).toHaveTextContent('3 h 20 min – 5 h 20 min left');
    expect(screen.getByText(/totals are estimates until/)).toBeInTheDocument();
  });

  it('a capped listing is a floor: "N+", and no percentage is claimed for it', () => {
    render(
      <ImportProgressPanel
        data={tracked({
          total: 200_000,
          capped: true,
          stages: [stage({ stage: 'imported', done: 150_000, total: 200_000 })],
        })}
      />
    );
    expect(screen.getByText(/150,000 \/ 200,000\+/)).toBeInTheDocument();
    expect(screen.queryByText('75%')).not.toBeInTheDocument();
    expect(screen.getByText(/at least that many/)).toBeInTheDocument();
  });

  it('CONTROL: an exact listing does show its percentage', () => {
    render(
      <ImportProgressPanel
        data={tracked({ stages: [stage({ stage: 'imported', done: 1500, total: 2000 })] })}
      />
    );
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('"not stored" is reported only once the mailbox has been drained', () => {
    const { rerender } = render(
      <ImportProgressPanel data={tracked({ drained: false, notStored: 0 })} />
    );
    expect(screen.queryByText(/not stored/)).not.toBeInTheDocument();
    rerender(<ImportProgressPanel data={tracked({ drained: true, notStored: 12 })} />);
    expect(screen.getByText(/12 listed messages were not stored/)).toBeInTheDocument();
  });

  it('while the mailbox is being counted, and when the count failed', () => {
    const { rerender } = render(
      <ImportProgressPanel
        data={{ tracked: true, run: { ...run, state: 'counting', total: null } }}
      />
    );
    expect(screen.getByText(/Counting the messages/)).toBeInTheDocument();
    rerender(
      <ImportProgressPanel
        data={{ tracked: true, run: { ...run, state: 'failed', error: 'Reconnect it.' } }}
      />
    );
    expect(screen.getByText(/Reconnect it\./)).toBeInTheDocument();
  });
});

describe('ImportProgressPanel — what finished and what did not', () => {
  it('an empty listing says there is nothing to import, not "Finished · 0 / 0"', () => {
    render(<ImportProgressPanel data={tracked({ total: 0, eta: { state: 'done' } })} />);
    expect(screen.getByText('Nothing to import.')).toBeInTheDocument();
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
  });

  it('a stage finished with work undone says how much, and why', () => {
    render(
      <ImportProgressPanel
        data={tracked({
          stages: [
            stage({ stage: 'decided', done: 95, total: 100, leftover: 5, eta: { state: 'done' } }),
          ],
          eta: { state: 'done' },
        })}
      />
    );
    expect(
      screen.getByText(/5 messages were not sorted: nothing is left in the queue/)
    ).toBeInTheDocument();
  });

  it('an index / knowledge-base leftover is counted in CONVERSATIONS and says so', () => {
    render(
      <ImportProgressPanel
        data={tracked({
          stages: [
            stage({ stage: 'kb', done: 40, total: 43, leftover: 3, eta: { state: 'done' } }),
          ],
          eta: { state: 'done' },
        })}
      />
    );
    expect(
      screen.getByText(/3 conversations were not mined for the knowledge base/)
    ).toBeInTheDocument();
  });

  it('work done before tracking started is said to be uncounted', () => {
    render(<ImportProgressPanel data={tracked({ unrecorded: 40 })} />);
    expect(
      screen.getByText(/40 messages were sorted before Odly recorded this work: counted as imported and checked/)
    ).toBeInTheDocument();
  });
});

describe('describeEta', () => {
  it('never quotes a number the rate has not earned', () => {
    expect(describeEta({ state: 'estimating' })).toMatch(/Measuring the rate/);
    // Both windows finished nothing: the claim is 15 minutes, and it names the stage.
    expect(describeEta({ state: 'stalled', stage: 'analysis' })).toBe(
      'No progress in AI analysis for 15 minutes, so the finish time is unknown'
    );
    expect(describeEta({ state: 'unknown' })).toMatch(/more messages than were counted/);
    expect(describeEta({ state: 'done' })).toBe('Finished');
    expect(describeEta({ state: 'running', minMinutes: 30, maxMinutes: null })).toBe(
      'At least 30 min left'
    );
    expect(describeEta({ state: 'running', minMinutes: 30, maxMinutes: 30 })).toBe(
      'About 30 min left'
    );
  });
});

describe('formatMinutes', () => {
  it('minutes, hours and days', () => {
    expect(formatMinutes(0.4)).toBe('1 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(200)).toBe('3 h 20 min');
    expect(formatMinutes(3000)).toBe('2 d 2 h');
  });
});
