/**
 * Platform Defaults → Embedding threads (2026-10-28): load the saved per-role values and the live
 * status from queue-status, save only what changed through PUT /settings/ingestion, refuse a value
 * outside the bounds, and tolerate an older backend that sends neither block.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const puts: { url: string; body: unknown }[] = [];
let queueStatus: unknown = new Promise(() => undefined);
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    put: (url: string, body: unknown) => {
      puts.push({ url, body });
      return Promise.resolve({ data: { success: true } });
    },
    get: () =>
      queueStatus instanceof Promise
        ? queueStatus
        : Promise.resolve({ data: { data: queueStatus } }),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { failure: () => undefined, success: () => undefined } }));

const { EmbeddingThreadsCard, EMBEDDING_THREADS_NOT_DEPLOYED } = await import(
  '../EmbeddingThreadsCard'
);
const { normalizeEmbeddingThreads } = await import('@/services/embeddingThreads');
const { readEmbeddingStatus } = await import('@/services/embeddingThreads');

const wrap = (node: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );

const saved = { threadsApi: null, threadsWorker: 2, threadsAll: null, min: 1, max: 64 };
const liveStatus = {
  resources: {
    processes: {
      available: true,
      intervalMs: 15000,
      processes: [
        { pid: 4321, name: 'node', role: 'embedding', cores: 0.98, percent: 24.5, rssMB: 410 },
      ],
    },
  },
  embeddingQueue: {
    model: { threads: { effective: 2, source: 'console', max: 3, role: 'all', childPid: 4321 } },
  },
};

beforeEach(() => {
  puts.length = 0;
  queueStatus = new Promise(() => undefined);
});
afterEach(cleanup);

describe('EmbeddingThreadsCard', () => {
  it('loads the saved values and shows the live threads, source and embedding CPU', async () => {
    queueStatus = liveStatus;
    wrap(<EmbeddingThreadsCard embeddingThreads={saved} />);
    expect(screen.getByLabelText('Background worker (split setup)')).toHaveValue(2);
    expect(screen.getByLabelText('Single server (API and background work together)')).toHaveValue(
      null
    );
    const live = await screen.findByTestId('embedding-live');
    expect(live).toHaveTextContent('uses 2 threads (at most 3 here)');
    expect(live).toHaveTextContent('Console');
    expect(live).toHaveTextContent('Embedding CPU: 0.98 cores.');
  });

  it('saves only the role that changed', async () => {
    wrap(<EmbeddingThreadsCard embeddingThreads={saved} />);
    fireEvent.change(screen.getByLabelText('Single server (API and background work together)'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      url: '/api/admin/platform/settings/ingestion',
      body: { embeddingThreadsAll: 3 },
    });
  });

  it.each(['0', '65', '1.5'])('refuses %p: error shown, Save disabled', (bad) => {
    wrap(<EmbeddingThreadsCard embeddingThreads={saved} />);
    fireEvent.change(screen.getByLabelText('API server (split setup)'), { target: { value: bad } });
    expect(screen.getByText('Enter a whole number from 1 to 64.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('an older backend: no inputs, only why', () => {
    wrap(<EmbeddingThreadsCard embeddingThreads={undefined} />);
    expect(screen.getByText(EMBEDDING_THREADS_NOT_DEPLOYED)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('normalizers tolerate an older or malformed backend', () => {
  it('normalizeEmbeddingThreads', () => {
    expect(normalizeEmbeddingThreads(undefined)).toBeUndefined();
    expect(normalizeEmbeddingThreads({ threadsApi: 2 })).toBeUndefined();
    expect(normalizeEmbeddingThreads({ ...saved, threadsApi: 'x', threadsAll: 0 })).toEqual({
      ...saved,
      threadsApi: null,
      threadsAll: null,
    });
  });

  it('readEmbeddingStatus', () => {
    expect(readEmbeddingStatus(undefined)).toBeUndefined();
    expect(readEmbeddingStatus({ resources: {} } as never)).toBeUndefined();
    expect(
      readEmbeddingStatus({
        ...liveStatus,
        embeddingQueue: { model: { childAlive: true } },
      } as never)
    ).toBeUndefined();
    expect(readEmbeddingStatus(liveStatus as never)).toEqual({
      effective: 2,
      source: 'console',
      max: 3,
      role: 'all',
      childAlive: true,
      cores: 0.98,
    });
  });
});
