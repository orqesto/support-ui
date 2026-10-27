/**
 * Console → Maintenance → "Mark automatic replies": a repair that runs in the background, so its
 * Check only queues a dry run and a second, read-only row reads the run's progress and result.
 * Same mocked transport as PlatformMaintenance.test.tsx (copied setup).
 *
 * Original notes of that file: Console → Maintenance (owner decisions 2026-10-20). Renders the real page and service over a
 * mocked transport, so the request each control sends is what is asserted:
 * - a job's switch PATCHes that job;
 * - a repair's Check sends NO apply and names the picked workspace on the request itself (the
 *   platform console sends no workspace by default);
 * - Apply needs a Check first and a confirm, and only then sends `apply: true`;
 * - an all-workspaces repair applies to exactly the workspaces its check found;
 * - "Repairs allowed" off disables every Check and Apply.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chooseOption } from '@/test/chooseOption';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformSyncCheckpoints: () => ({ isLoading: false, data: [{ id: 1 }, { id: 2 }] }),
  useClearSyncCheckpoints: () => ({ mutateAsync: vi.fn() }),
  usePlatformWorkspaces: () => ({
    isLoading: false,
    data: {
      data: [
        { id: 12, name: 'Example Workspace' },
        { id: 13, name: 'Second Workspace' },
      ],
    },
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PlatformMaintenance } from '../PlatformMaintenance';

const state = (allowed = true) => ({
  data: {
    data: {
      jobs: [
        {
          id: 'lostJobSweep',
          label: 'Lost-job sweep',
          does: 'Re-queues inbound mail saved without its job.',
          whenOff: 'Mail that lost its job is not picked up again.',
          schedule: { kind: 'interval', minutes: 15 },
          enabled: true,
          lastRun: { at: '2026-10-20T10:00:00.000Z', outcome: 'ok', durationMs: 40 },
          nextRunAt: '2026-10-20T10:15:00.000Z',
        },
        {
          id: 'cleanupSchedule',
          label: 'Nightly cleanup',
          does: 'Removes old files.',
          whenOff: 'Old files are kept.',
          schedule: { kind: 'daily', hour: 2 },
          enabled: false,
          lastRun: { at: '2026-10-20T02:00:00.000Z', outcome: 'skipped' },
          nextRunAt: null,
        },
      ],
      repairs: { allowed, source: 'console' },
    },
  },
});

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformMaintenance />
    </QueryClientProvider>
  );

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  api.get.mockImplementation((url: string) =>
    url === '/api/system/maintenance'
      ? Promise.resolve(state())
      : Promise.resolve({ data: { data: {} } })
  );
  api.patch.mockResolvedValue({ data: { success: true } });
});
afterEach(cleanup);

describe('PlatformMaintenance — mark automatic replies (background repair)', () => {
  it('Check queues a dry run in the chosen workspace; the progress row reads its result', async () => {
    api.post.mockResolvedValue({
      data: { data: { queued: true, mode: 'dry run', jobId: 'mark-automatic-replies-12-1' } },
    });
    api.get.mockImplementation((url: string) =>
      url === '/api/system/maintenance'
        ? Promise.resolve(state(true))
        : Promise.resolve({
            data: {
              data: {
                mode: 'dry run',
                state: 'completed',
                matched: 3,
                pendingToOpen: 2,
                samplePublicIds: 'EX-SUP-1, EX-SUP-2',
              },
            },
          })
    );
    renderPage();
    await screen.findByTestId('repair-mark-automatic-replies');
    await chooseOption(
      document.getElementById('maintenance-workspace') as HTMLElement,
      'Example Workspace'
    );
    const row = screen.getByTestId('repair-mark-automatic-replies');
    fireEvent.click(within(row).getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/system/mark-automatic-replies',
        {},
        { organizationContext: 12 }
      )
    );

    const progress = screen.getByTestId('repair-mark-automatic-replies-status');
    // A read-only report: no Apply on the progress row.
    expect(within(progress).queryByRole('button', { name: 'Apply' })).toBeNull();
    fireEvent.click(within(progress).getByRole('button', { name: 'Check' }));
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/api/system/mark-automatic-replies', {
        organizationContext: 12,
      })
    );
    expect(await within(progress).findByText('EX-SUP-1, EX-SUP-2')).toBeTruthy();
    expect(within(progress).getByText('pendingToOpen')).toBeTruthy();
  });
});
