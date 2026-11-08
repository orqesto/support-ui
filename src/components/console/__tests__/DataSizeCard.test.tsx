/** Console → Platform → System: data size (architecture M7 Z11a). */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const gets: { url: string; params: unknown }[] = [];
let respond: () => Promise<unknown> = () => Promise.resolve({ data: { data: report } });
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (url: string, config?: { params?: unknown }) => {
      gets.push({ url, params: config?.params });
      return respond();
    },
  },
}));

const report = {
  sampledAt: '2026-11-07T20:00:00.000Z',
  platform: {
    organizationId: null,
    workspaceName: null,
    deploymentType: 'platform',
    totalBytes: 9.1 * 1024 ** 3,
    tables: [
      { table: 'message_events', totalBytes: 6 * 1024 ** 3, rowEstimate: 2_400_000 },
      { table: 'conversations', totalBytes: 900 * 1024 ** 2, rowEstimate: 410_000 },
    ],
    error: null,
  },
  threads: {
    days: 90,
    sampledPct: 4.9,
    sampledThreads: 20_100,
    estimatedThreads: 410_000,
    estimatedOldResolved: 287_000,
    oldResolvedShare: 0.7,
    workspacesWithThreads: 14,
    topWorkspaces: [
      { organizationId: 36, name: 'Taco', estimatedThreads: 300_000, oldResolvedShare: 0.8 },
      { organizationId: 9, name: null, estimatedThreads: 50_000, oldResolvedShare: 0.2 },
    ],
  },
  bodies: {
    sampledPct: 0.83,
    sampledMessages: 20_000,
    estimatedMessages: 2_400_000,
    estimatedContentBytes: 3 * 1024 ** 3,
    estimatedRawDataBytes: 1.5 * 1024 ** 3,
    estimatedHeaderBytes: 200 * 1024 ** 2,
    messageEventsTotalBytes: 6 * 1024 ** 3,
  },
  byodb: [
    {
      organizationId: 40,
      workspaceName: 'Fixture BYODB',
      deploymentType: 'external',
      totalBytes: 50 * 1024 ** 2,
      tables: [],
      error: null,
    },
    {
      organizationId: 41,
      workspaceName: null,
      deploymentType: 'external',
      totalBytes: null,
      tables: [],
      error: 'connect ECONNREFUSED',
    },
  ],
};

const { DataSizeCard, formatBytes } = await import('../DataSizeCard');

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DataSizeCard />
    </QueryClientProvider>
  );

beforeEach(() => {
  gets.length = 0;
  respond = () => Promise.resolve({ data: { data: report } });
});
afterEach(cleanup);

describe('Data size card', () => {
  it('shows the database total, the biggest tables, and the old-thread estimate labelled as one', async () => {
    wrap();
    expect(await screen.findByText('Platform database — 9.1 GB')).toBeInTheDocument();
    expect(screen.getByText('message_events')).toBeInTheDocument();
    expect(screen.getByText(/287,000 of 410,000 conversations \(70%\)/)).toBeInTheDocument();
    expect(screen.getByText('(estimate from a 5% sample)')).toBeInTheDocument();
    expect(screen.getByText('Taco')).toBeInTheDocument();
    expect(screen.getByText('Workspace 9')).toBeInTheDocument();
    expect(gets[0]).toEqual({ url: '/api/admin/platform/data-size', params: undefined });
  });

  it('lists each BYODB workspace, saying why one could not be read', async () => {
    wrap();
    expect(await screen.findByText(/Fixture BYODB — 50.0 MB/)).toBeInTheDocument();
    expect(screen.getByText('could not be read: connect ECONNREFUSED')).toBeInTheDocument();
  });

  it('"Measure again" asks the server for a fresh reading', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: 'Measure again' }));
    await waitFor(() => expect(gets).toHaveLength(2));
    expect(gets[1].params).toEqual({ fresh: '1' });
  });

  it('says how many workspaces the top list is out of', async () => {
    wrap();
    expect(
      await screen.findByText('The 2 workspaces with the most conversations, of 14.')
    ).toBeInTheDocument();
  });

  it('says WHY a part is missing, and that the BYODB list could not be read (not "none")', async () => {
    respond = () =>
      Promise.resolve({
        data: {
          data: {
            ...report,
            threads: null,
            threadsError: 'canceling statement due to statement timeout',
            bodies: null,
            bodiesError: 'not measured: the catalog could not be read',
            byodb: [],
            byodbError: 'connection refused',
          },
        },
      });
    wrap();
    expect(
      await screen.findByText(
        /Old resolved conversations could not be measured: canceling statement/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Message content could not be measured: not measured/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('Workspaces with their own database could not be listed: connection refused')
    ).toBeInTheDocument();
  });

  it('says so when the reading fails', async () => {
    respond = () => Promise.reject(new Error('500'));
    wrap();
    expect(await screen.findByText('The data size could not be read.')).toBeInTheDocument();
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(null)).toBe('—');
  });
});
