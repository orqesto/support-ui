/**
 * Expected stops (run_budget, deferred_under_load, rate_limited, transient_error) are the system
 * working as designed: the run's line reads "Continues on the next check", it is not a warning,
 * and the panel does not say "Needs attention" for it. A stop that is a real fault still does.
 * (Whether a run counts as a problem is the backend's call, `problems`; the panel follows it.)
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportProgress, ProcessingSummaryEntry } from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { makeRun, untracked } from './fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

let view: ImportProgress = untracked();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: () => Promise.resolve({ ...view }),
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('../ProcessingPanels');
const { RunDetails } = await import('../RunDetails');

const entry = (over: Partial<ProcessingSummaryEntry> = {}): ProcessingSummaryEntry => ({
  sourceId: 5,
  name: 'Gmail-orders',
  type: 'gmail',
  unavailable: false,
  inProgress: 0,
  problems: 0,
  countCapped: false,
  ...over,
});

const openPanel = async (data: ImportProgress, summary: ProcessingSummaryEntry) => {
  view = data;
  render(
    <MemoryRouter>
      <ProcessingPanels organizationId={1} sessions={new Map()} summary={[summary]} />
    </MemoryRouter>
  );
  act(() => useProcessingPanelStore.getState().open(5, 'manual'));
  await act(async () => {});
  return screen.getByTestId('panel-status').textContent;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
});
afterEach(cleanup);

describe('an expected stop in the panel', () => {
  it.each(['run_budget', 'deferred_under_load', 'rate_limited', 'transient_error', 'interrupted'])(
    '%s with no problem from the backend: "Continues on the next check", not "Needs attention"',
    async (code) => {
      const run = makeRun({ outcome: 'paused', stoppedBy: code, problems: [] });
      const word = await openPanel(untracked({ runs: [run] }), entry());
      expect(word).not.toBe('Needs attention');
      const line = screen.getByText(/^Continues on the next check: /, { selector: 'li' });
      expect(line.className).not.toMatch(/text-warning/);
      expect(screen.queryByText(/^Paused because/)).toBeNull();
    }
  );

  it('a run cut short by a restart reads the plain reason and is not a problem', async () => {
    const run = makeRun({ outcome: 'paused', stoppedBy: 'interrupted', problems: [] });
    const word = await openPanel(untracked({ runs: [run] }), entry());
    expect(word).not.toBe('Needs attention');
    expect(
      screen.getByText(/^Continues on the next check: the server restarted during the check\. /, {
        selector: 'li',
      })
    ).toBeTruthy();
  });

  it('CONTROL: a daily-limit stop the backend counts as a problem is "Needs attention"', async () => {
    const run = makeRun({ outcome: 'paused', stoppedBy: 'daily_limit', problems: ['paused'] });
    const word = await openPanel(untracked({ runs: [run] }), entry({ problems: 1 }));
    expect(word).toBe('Needs attention');
    expect(
      screen.getByText(/^Paused because Gmail's daily limit/, { selector: 'li' })
    ).toBeTruthy();
  });

  it('an expected stop the backend DOES count (nothing picked it up) keeps the warning colour', () => {
    render(
      <RunDetails
        run={makeRun({ outcome: 'paused', stoppedBy: 'run_budget', problems: ['paused'] })}
      />
    );
    expect(
      screen.getByText(/^Continues on the next check: /, { selector: 'li' }).className
    ).toMatch(/text-warning/);
  });
});
