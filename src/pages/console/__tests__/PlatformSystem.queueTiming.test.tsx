/**
 * Resources & queues must show each queue's typical job time, wait and "clears in", and count
 * prioritized jobs as waiting. Renders the real page, so a formatter that is never called — or a
 * cell wired to the wrong field — fails here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const timing = {
  sampled: 20,
  medianRunMs: 2_400,
  slowestRunMs: 9_000,
  medianWaitMs: 800,
  lastFinishedAt: '2026-09-23T15:00:00.000Z',
  finishesPerMinute: 4,
  rateSample: 20,
};
const queues = [
  {
    name: 'process-message',
    waiting: 0,
    prioritized: 48,
    delayed: 0,
    paused: false,
    active: 3,
    completed: 100,
    failed: 0,
    total: 51,
    timing: { ...timing, rateSpanMs: 5 * 60_000 },
    oldestWaitingMs: 11 * 60_000,
    oldestWaitingExact: true,
  },
  {
    name: 'process-kb-message',
    waiting: 10,
    prioritized: 0,
    delayed: 0,
    paused: false,
    active: 1,
    completed: 0,
    failed: 0,
    total: 11,
    timing: { ...timing, sampled: 0, medianRunMs: null, slowestRunMs: null, medianWaitMs: null, lastFinishedAt: null, finishesPerMinute: null, rateSample: 0 },
  },
  { name: 'notify', waiting: 0, active: 0, completed: 2, failed: 0, total: 0 },
];

vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformQueueStatus: () => ({
    isLoading: false,
    isError: false,
    data: { resources: undefined, queues, scaling: null, workers: null },
  }),
  usePlatformSyncCheckpoints: () => ({ isLoading: false, data: [] }),
  useClearSyncCheckpoints: () => ({ mutateAsync: vi.fn() }),
  usePlatformQueueHistory: () => ({ isLoading: false, isError: false, error: null, data: [] }),
}));
vi.mock('@/components/console/FailureAnalysisCard', () => ({ FailureAnalysisCard: () => null }));
vi.mock('@/components/console/WorkspaceHealthCard', () => ({ WorkspaceHealthCard: () => null }));
vi.mock('@/services/license.service', () => ({ licenseService: { getLicenseStatus: vi.fn(() => Promise.resolve(null)) } }));

import { PlatformSystem } from '../PlatformSystem';

afterEach(cleanup);

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PlatformSystem />
    </QueryClientProvider>
  );

const cells = (queueName: string): string[] => {
  // The queue table's row — the name also appears in the history picker.
  const row = screen.getAllByRole('row').find((tr) => tr.firstElementChild?.textContent === queueName);
  if (!row) throw new Error(`no row for ${queueName}`);
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');
};

describe('PlatformSystem — per-queue timing', () => {
  it('shows typical job, wait and clears-in, counting prioritized jobs as waiting', () => {
    renderPage();
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual([
      'Queue',
      'Waiting',
      'Active',
      'Completed',
      'Failed',
      'Typical job',
      'Waited',
      'Oldest waiting',
      'Clears in',
    ]);
    // 48 prioritized, 0 in `wait`: the row says 48, and 48 at 4/min is ~12 min.
    expect(cells('process-message')).toEqual([
      'process-message',
      '48',
      '3',
      '100',
      '0',
      '2.4 s',
      '800 ms',
      '11 min',
      '~12 min (from 5 min of history)',
    ]);
    expect(cells('process-kb-message')).toEqual([
      'process-kb-message',
      '10',
      '1',
      '0',
      '0',
      '—',
      '—',
      '—',
      'no finished jobs on record',
    ]);
    // An older backend: no timing at all, and nothing claimed.
    expect(cells('notify')).toEqual(['notify', '0', '0', '2', '0', '—', '—', '—', '—']);
    expect(screen.getByText(/Typical job and Waited are the median/)).toBeTruthy();
    // The history panel is on the page, opened on the queue with the most jobs waiting.
    expect(screen.getByLabelText<HTMLSelectElement>('Queue to show history for').value).toBe('process-message');
    // The slowest recent job is one hover away on the typical-job cell — and absent without timing.
    expect(screen.getByText('2.4 s').getAttribute('title')).toBe('Slowest of the last 20: 9.0 s');
    const notifyRow = screen.getAllByRole('row').find((tr) => tr.firstElementChild?.textContent === 'notify');
    expect(within(notifyRow as HTMLElement).getAllByRole('cell')[5].getAttribute('title')).toBeNull();
  });
});
