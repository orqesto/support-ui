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

const get = vi.fn<(sourceId: number, start?: boolean) => Promise<ImportProgress>>();
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    get: (sourceId: number, start?: boolean) => get(sourceId, start),
    recount: vi.fn(),
  },
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
    // A knowledge-base run (the taco DeusPower import): the listing is asked for.
    expect(get).toHaveBeenCalledWith(68, true);
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

  it('a FAILED count falls back to the session view — it does not label the import Complete', async () => {
    get.mockResolvedValue({
      tracked: true,
      run: {
        state: 'failed',
        startedAt: '2026-09-25T08:30:00.000Z',
        countedAt: null,
        total: null,
        capped: false,
        cappedBy: null,
        query: null,
        error: 'Could not list the mailbox.',
      },
    });
    render(
      <MessageProcessingProgress
        session={
          { ...(COMPLETE_SESSION as object), status: 'processing', isProcessing: true } as never
        }
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(await screen.findByText('Found')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();
  });

  it('a FINISHED import gives the card back to the next live run', async () => {
    get.mockResolvedValue(tracked({ ...RUNNING_PROGRESS, eta: { state: 'done' } }));
    render(
      <MessageProcessingProgress
        session={
          { ...(COMPLETE_SESSION as object), status: 'processing', isProcessing: true } as never
        }
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(await screen.findByText('Found')).toBeInTheDocument();
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
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

  it('CONTROL: a routine poll (5 found, no knowledge-base work) asks for no listing', async () => {
    get.mockResolvedValue({ tracked: false });
    render(
      <MessageProcessingProgress
        session={{ ...(COMPLETE_SESSION as object), total: 5, kbMessagesTotal: undefined } as never}
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith(68, false));
  });

  it('a run that looks like an import (2,255 found) asks the backend to list the mailbox', async () => {
    get.mockResolvedValue({ tracked: false });
    render(
      <MessageProcessingProgress
        session={{ ...(COMPLETE_SESSION as object), total: 2255, emailTotal: 2255 } as never}
        index={0}
        onClose={vi.fn()}
        sourceType="email"
      />
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith(68, true));
  });
});

/**
 * The socket session says "complete" after every poll run, and the widget auto-closed 15 s later:
 * the import's progress vanished between runs (audit pass 2, H1).
 */
describe('the widget stays while the import runs', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a running import is NOT auto-closed when the session completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue(tracked(RUNNING_PROGRESS));
    const onClose = vi.fn();
    render(
      <MessageProcessingProgress
        session={COMPLETE_SESSION}
        index={0}
        onClose={onClose}
        sourceType="email"
      />
    );
    await waitFor(() => expect(screen.getByText(/130 \/ 2,255/)).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a user refused (403) gets the session view, and the refusal is not polled every 15 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockRejectedValue(
      new AxiosError('Forbidden', '403', undefined, undefined, {
        status: 403,
        statusText: 'Forbidden',
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
    expect(await screen.findByText('Found')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('CONTROL: a finished import closes as before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue(tracked({ ...RUNNING_PROGRESS, eta: { state: 'done' } }));
    const onClose = vi.fn();
    render(
      <MessageProcessingProgress
        session={COMPLETE_SESSION}
        index={0}
        onClose={onClose}
        sourceType="email"
      />
    );
    await waitFor(() => expect(screen.getByText('Finished')).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onClose).toHaveBeenCalled();
  });
});
