/**
 * For a Gmail source the widget shows the DATABASE's import progress, not its socket session.
 *
 * Taco, 2026-09-25: the session's numbers alternated "0 / 2173 · 0%" and "50 / 51 · 98%" a minute
 * apart and then said "Complete · 47 / 47 · 100%" with ~2,100 messages still to import. The
 * session's `status: 'complete'` must no longer be able to say that while the import runs.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageProcessingProgress } from '../MessageProcessingProgress';
import type { ImportProgress } from '@/services/importProgress.service';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
vi.mock('@/hooks/useAiConfigured', () => ({ useAiConfigured: () => ({ aiConfigured: true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const get = vi.fn<(sourceId: number) => Promise<ImportProgress>>();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: { get: (sourceId: number) => get(sourceId), recount: vi.fn() },
}));

/** What the socket session said on taco at 08:41: complete, 47 of 47. */
const COMPLETE_SESSION = {
  sessionKey: '68',
  integrationId: 68,
  integrationName: 'Gmail-orders',
  status: 'complete',
  stage: 'complete',
  total: 47,
  current: 47,
  processed: 47,
  failed: 0,
  skipped: 0,
  progress: 100,
  isProcessing: false,
  kbMessagesTotal: 10,
  kbMessagesProcessed: 0,
} as never;

type Progress = NonNullable<Extract<ImportProgress, { tracked: true }>['progress']>;

const RUNNING_PROGRESS: Progress = {
  total: 2255,
  capped: false,
  imported: 130,
  drained: false,
  notStored: 0,
  awaitingRouting: 0,
  unrecorded: 0,
  stages: [
    { stage: 'imported', done: 130, total: 2255, projected: false, eta: { state: 'estimating' } },
  ],
  eta: { state: 'estimating' },
  sampledAt: '2026-09-25T08:41:00.000Z',
};

const tracked = (progress: Progress): ImportProgress => ({
  tracked: true,
  run: {
    state: 'ready',
    startedAt: '2026-09-25T08:30:00.000Z',
    countedAt: '2026-09-25T08:31:00.000Z',
    total: 2255,
    capped: false,
    cappedBy: null,
    query: 'q',
    error: null,
  },
  progress,
});

beforeEach(() => {
  localStorage.clear();
  get.mockReset();
});
afterEach(cleanup);

describe('the processing widget and a Gmail import', () => {
  it('a running import keeps the card at "Processing" even when the socket session says complete', async () => {
    get.mockResolvedValue(tracked(RUNNING_PROGRESS));
    render(
      <MessageProcessingProgress
        session={COMPLETE_SESSION}
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await waitFor(() => expect(screen.getByText(/130 \/ 2,255/)).toBeInTheDocument());
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();
    // None of the socket-driven numbers is shown next to the database's.
    expect(screen.queryByText('Found')).not.toBeInTheDocument();
    expect(screen.queryByText(/Processed 47/)).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(68);
  });

  it('a finished import says Complete', async () => {
    get.mockResolvedValue(tracked({ ...RUNNING_PROGRESS, eta: { state: 'done' } }));
    render(
      <MessageProcessingProgress
        session={COMPLETE_SESSION}
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await waitFor(() => expect(screen.getByText('Finished')).toBeInTheDocument());
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it("CONTROL: not a Gmail source (404) keeps the widget's own numbers", async () => {
    get.mockRejectedValue(
      new AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
      })
    );
    render(
      <MessageProcessingProgress
        session={COMPLETE_SESSION}
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(await screen.findByText('Found')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it("the knowledge-base bar's track is not the colour of its fill (it read full at 0%)", async () => {
    get.mockRejectedValue(
      new AxiosError('Not Found', '404', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        data: {},
        headers: {},
        config: { headers: new AxiosHeaders() },
      })
    );
    const { container } = render(
      <MessageProcessingProgress
        session={COMPLETE_SESSION}
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await screen.findByText('Found');
    const fill = container.querySelector('.bg-ai.h-full') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.parentElement?.className).toContain('bg-ai-muted');
    expect(fill.parentElement?.className).not.toMatch(/(^|\s)bg-ai(\s|$)/);
  });
});
