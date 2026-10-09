/**
 * FE-3a (G10n): an `ai_unavailable` KB run is a failure that needs a person's look, NOT a daily-limit
 * pause — the header reads "Needs attention", never "KB paused"; and a `kb_full` stop (the person
 * must make room) reads the same. The run's own sentence is on screen.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportProgress, ProcessingSummaryEntry } from '@/services/importProgress.service';
import { useProcessingPanelStore } from '@/stores/processingPanelStore';
import { makeKbRun, untracked } from './fixtures';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

let view: ImportProgress = untracked();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: () => Promise.resolve({ ...view }),
    dismissKbFailure: () => Promise.resolve(),
  },
}));

const { ProcessingPanels } = await import('../ProcessingPanels');

const entry: ProcessingSummaryEntry = {
  sourceId: 5,
  name: 'Gmail-orders',
  type: 'gmail',
  unavailable: false,
  inProgress: 0,
  problems: 1,
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
};

const open = async (data: ImportProgress) => {
  view = data;
  render(
    <MemoryRouter>
      <ProcessingPanels organizationId={1} sessions={new Map()} summary={[entry]} />
    </MemoryRouter>
  );
  act(() => useProcessingPanelStore.getState().open(5, 'manual'));
  await act(async () => {});
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  useProcessingPanelStore.getState().reset();
});
afterEach(cleanup);

describe('KB stops in the panel', () => {
  it('G10n: an ai_unavailable run is NOT a limit pause; header reads "Needs attention"', async () => {
    await open(
      untracked({
        runs: [
          makeKbRun({
            outcome: 'failed',
            problems: ['failed'],
            stoppedBy: 'ai_unavailable',
            aiSkipped: 4,
            aiReason: 'provider_quota',
            retry: 're_mine',
          }),
        ],
      })
    );
    expect(screen.getByTestId('panel-status').textContent).toBe('Needs attention');
    expect(screen.queryByText('KB paused')).toBeNull();
    expect(screen.getAllByText(/AI was unavailable/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('provider_quota');
  });

  it('a kb_full stop reads "Needs attention" with the way out, not "resumes by itself"', async () => {
    await open(
      untracked({
        runs: [
          makeKbRun({
            outcome: 'paused',
            problems: ['paused'],
            stoppedBy: 'kb_full',
            resumesAt: null,
          }),
        ],
      })
    );
    expect(screen.getByTestId('panel-status').textContent).toBe('Needs attention');
    expect(document.body.textContent).toContain('the knowledge base is full (plan limit)');
    expect(document.body.textContent).not.toMatch(/resumes by itself/i);
  });
});
