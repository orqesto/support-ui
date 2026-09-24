/**
 * The CPU row on Console → System must show the cores behind the percentage, not only "2.0%".
 * Renders the real page with the real prod payload (app.odly.ai 2026-09-23), so a formatter that
 * works but is never called — or is called with the wrong object — fails here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const resources = {
  cpu: '2.0%',
  cpuCores: 4,
  cpuSource: 'container',
  processCpu: 2.03,
  containerCpu: 2.03,
  loadAvg: 0.75,
  effectiveCores: 4,
  rawStatus: 'healthy',
  sampledAt: '2026-09-23T14:48:41.858Z',
  ticks: 507,
  memory: '16.5%',
  memoryMB: { used: 694, total: 4202, limitSource: 'budget' },
  process: { rssMB: 694, heapUsedMB: 297, heapTotalMB: 406, externalMB: 15, arrayBuffersMB: 7 },
  status: 'healthy',
  throttling: false,
  throttleFactor: 1,
};

vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformQueueStatus: () => ({
    isLoading: false,
    isError: false,
    data: { resources, queues: [], scaling: null, workers: null },
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

describe('PlatformSystem — CPU in cores', () => {
  it('shows the cores behind the CPU percentage and every reading behind the status', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PlatformSystem />
      </QueryClientProvider>
    );
    expect(screen.getByText('2.0%')).toBeTruthy();
    expect(screen.getByText('0.08 of 4 cores (all host cores)')).toBeTruthy();
    expect(
      screen.getByText(
        'CPU in cores: whole container 0.08 cores · this process 0.08 cores · load average 0.75 (1 min, whole host) · status uses whole container.'
      )
    ).toBeTruthy();
  });
});
