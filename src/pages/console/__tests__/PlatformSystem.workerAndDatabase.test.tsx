/**
 * Console → System shows the worker container and the database, not only the process that
 * answered. In split topology the app container's own figures say nothing about the queues, so
 * the worker's are shown beside them, and a worker that is not reporting is an error, not a gap.
 * One container (role "all") shows one summary, as before.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const resources = {
  cpu: '1.0%',
  memory: '20.0%',
  status: 'healthy',
  throttling: false,
  throttleFactor: 1,
};

const worker = {
  sampledAt: '2026-10-20T19:00:00.000Z',
  resources: {
    cpuUsage: 37.5,
    memoryUsage: 61.2,
    status: 'healthy',
    throttling: false,
    throttleFactor: 1,
  },
  workers: [
    { jobType: 'process-message', isRunning: true },
    { jobType: 'process-kb-message', isRunning: true },
  ],
};

const database = {
  sampledAt: '2026-10-20T19:00:00.000Z',
  sizeMB: 2560,
  connections: {
    total: 90,
    active: 12,
    idle: 70,
    idleInTransaction: 8,
    waitingOnLock: 3,
    max: 100,
    utilizationPct: 90,
  },
  longestActiveSeconds: 42,
  longestIdleInTransactionSeconds: 5,
  longestQueries: [
    {
      pid: 7,
      state: 'active',
      waitEvent: 'Lock:advisory',
      seconds: 42,
      query: 'SELECT pg_advisory_lock($1)',
    },
  ],
  rates: {
    windowSeconds: 30,
    commitsPerSecond: 12.5,
    rollbacksPerSecond: 0,
    cacheHitPct: 99.1,
    tempMBWritten: 0,
    deadlocks: 0,
  },
};

let payload: Record<string, unknown> = {};
vi.mock('@/hooks/usePlatformAdmin', () => ({
  usePlatformQueueStatus: () => ({ isLoading: false, isError: false, data: payload }),
  usePlatformQueueHistory: () => ({ isLoading: false, isError: false, error: null, data: [] }),
}));
vi.mock('@/components/console/FailureAnalysisCard', () => ({ FailureAnalysisCard: () => null }));
vi.mock('@/components/console/WorkspaceHealthCard', () => ({ WorkspaceHealthCard: () => null }));
vi.mock('@/services/license.service', () => ({
  licenseService: { getLicenseStatus: vi.fn(() => Promise.resolve(null)) },
}));

import { PlatformSystem } from '../PlatformSystem';

afterEach(cleanup);

const renderPage = (data: Record<string, unknown>) => {
  payload = { resources, queues: [], scaling: null, workers: null, ...data };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformSystem />
    </QueryClientProvider>
  );
};

describe('PlatformSystem — worker container', () => {
  it("shows the worker container's own CPU and memory in split topology", () => {
    renderPage({ role: 'api', worker });
    expect(screen.getByText('App container (serves the web app)')).toBeTruthy();
    expect(
      screen.getByText(/Worker container \(runs the queues\) · 2 of 2 workers running/)
    ).toBeTruthy();
    expect(screen.getByText('37.5%')).toBeTruthy();
    expect(screen.getByText('61.2%')).toBeTruthy();
  });

  it('says so when no worker is reporting in split topology', () => {
    renderPage({ role: 'api', worker: null });
    expect(screen.getByText(/No worker container is reporting/)).toBeTruthy();
  });

  it('control: one container shows one summary and no worker section', () => {
    renderPage({ role: 'all', worker: null });
    expect(screen.queryByText(/Worker container/)).toBeNull();
    expect(screen.queryByText(/No worker container is reporting/)).toBeNull();
    expect(screen.getByText('1.0%')).toBeTruthy();
  });
});

describe('PlatformSystem — database', () => {
  it('shows connections, size and what is wrong right now', () => {
    renderPage({ role: 'all', database });
    expect(screen.getByText('90 of 100')).toBeTruthy();
    expect(screen.getByText('2.5 GB')).toBeTruthy();
    expect(screen.getByText('under load')).toBeTruthy();
    expect(
      screen.getByText('Database: 90% of the connection limit in use · 3 waiting on a lock.')
    ).toBeTruthy();
    expect(screen.getByText('SELECT pg_advisory_lock($1)')).toBeTruthy();
  });

  it('control: an older backend that sends no database renders no database section', () => {
    renderPage({});
    expect(screen.queryByText(/Database connections/)).toBeNull();
  });
});
