/**
 * Owner, 2026-10-05: "I dont see where it can be triggered manually". "Run now" starts the nightly
 * KB run for the workspace and says, in each state, what is true: running, how the last run ended,
 * or why it did not start.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KbConsolidationRunState, KbRunNowResult } from '@/services/kbConsolidation.service';

let stateQueue: Array<KbConsolidationRunState | null> = [];
let runNowResult: () => Promise<KbRunNowResult> = () =>
  Promise.resolve({ started: true, startedAt: '2026-10-05T10:00:00Z' });
let runNowCalls = 0;
/** The next N state reads fail (a 503 / network blip). */
let failReads = 0;
/** The status the failing reads carry (undefined = network, as the real client delivers it). */
let failStatus: number | undefined;
/** Replaces the whole read when set (to make one read slow). */
let readOverride: (() => Promise<KbConsolidationRunState | null>) | null = null;
let reads = 0;
const toasts: string[] = [];

vi.mock('@/services/kbConsolidation.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    kbConsolidationService: {
      // The last queued state repeats: a poll after the queue ran out reads the newest one.
      getRunState: () => {
        reads += 1;
        if (readOverride) return readOverride();
        if (failReads > 0) {
          failReads -= 1;
          return Promise.reject(
            Object.assign(new Error('state unavailable'), { status: failStatus })
          );
        }
        return Promise.resolve(
          (stateQueue.length > 1 ? stateQueue.shift() : stateQueue[0]) ?? null
        );
      },
      runNow: () => {
        runNowCalls += 1;
        return runNowResult();
      },
    },
  };
});
vi.mock('@/lib/toast', () => ({
  toast: {
    success: (message: string) => toasts.push(message),
    error: () => {},
    info: () => {},
    warning: () => {},
  },
}));

const { KbRunNow, RUN_POLL_MS, lastRunText, refusalText } = await import('../KbRunNow');
const { normalizeRunState } = await import('@/services/kbConsolidation.service');

const idle = (overrides: Partial<KbConsolidationRunState> = {}): KbConsolidationRunState => ({
  runningSince: null,
  last: null,
  canRun: true,
  ...overrides,
});

beforeEach(() => {
  stateQueue = [];
  runNowCalls = 0;
  failReads = 0;
  failStatus = undefined;
  readOverride = null;
  reads = 0;
  toasts.length = 0;
  runNowResult = () => Promise.resolve({ started: true, startedAt: '2026-10-05T10:00:00Z' });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('KbRunNow', () => {
  it('renders nothing on a backend without the route (state null)', async () => {
    stateQueue = [null];
    const { container } = render(<KbRunNow onRunEnded={() => {}} />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('a moderator sees the run line but no button', async () => {
    stateQueue = [idle({ canRun: false })];
    render(<KbRunNow onRunEnded={() => {}} />);
    expect(await screen.findByText(/No run recorded yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Run now/ })).toBeNull();
  });

  it('switched off ⇒ says which switch, and starts nothing', async () => {
    stateQueue = [idle()];
    runNowResult = () => Promise.resolve({ started: false, reason: 'disabled', retryAfter: null });
    render(<KbRunNow onRunEnded={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Run now/ }));
    expect(await screen.findByText(/kb\.consolidation_enabled/)).toBeTruthy();
    expect(toasts).toEqual([]);
  });

  it('an unknown refusal is shown with its code, not swallowed', async () => {
    stateQueue = [idle()];
    runNowResult = () =>
      Promise.resolve({ started: false, reason: 'something_new', retryAfter: null });
    render(<KbRunNow onRunEnded={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Run now/ }));
    expect(await screen.findByText('The run did not start (something_new).')).toBeTruthy();
  });

  it('started ⇒ toast, the button locks while running, and the report reloads when the run ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const ended: number[] = [];
    stateQueue = [idle(), idle({ runningSince: '2026-10-05T10:00:00Z' })];
    render(<KbRunNow onRunEnded={() => ended.push(1)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Run now/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Running/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /Running/ }).hasAttribute('disabled')).toBe(true);
    expect(toasts).toEqual(['Run started']);
    expect(ended).toEqual([]);
    // The run ends: the next poll reads an idle state with a recorded run.
    stateQueue = [
      idle({
        last: {
          trigger: 'manual',
          startedAt: '2026-10-05T10:00:00Z',
          finishedAt: '2026-10-05T10:04:00Z',
          outcome: 'done',
          skipped: null,
          partial: false,
        },
      }),
    ];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    await waitFor(() => expect(ended).toEqual([1]));
    expect(screen.getByText(/Last run \(started by hand\) finished at/)).toBeTruthy();
  });

  it('two quick clicks start one run', async () => {
    stateQueue = [idle()];
    let release: () => void = () => {};
    runNowResult = () =>
      new Promise((resolve) => {
        release = () => resolve({ started: true, startedAt: '2026-10-05T10:00:00Z' });
      });
    render(<KbRunNow onRunEnded={() => {}} />);
    const button = await screen.findByRole('button', { name: /Run now/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(runNowCalls).toBe(1);
    await act(() => Promise.resolve(release()));
  });
});

describe('run state wording and shape', () => {
  const base = {
    trigger: 'nightly' as const,
    startedAt: '2026-10-05T05:00:00Z',
    finishedAt: '2026-10-05T05:02:00Z',
  };
  it('says partial, skipped and failed for what they are', () => {
    expect(lastRunText({ ...base, outcome: 'done', skipped: null, partial: true })).toMatch(
      /next run continues/
    );
    expect(
      lastRunText({ ...base, outcome: 'skipped', skipped: 'disabled', partial: false })
    ).toMatch(/did not run \(.+\): Consolidation is switched off/);
    expect(lastRunText({ ...base, outcome: 'failed', skipped: 'error', partial: false })).toMatch(
      /^Last nightly run failed/
    );
  });

  it('normalizeRunState tolerates missing and malformed fields', () => {
    expect(normalizeRunState(undefined)).toEqual({ runningSince: null, last: null, canRun: false });
    expect(normalizeRunState({ runningSince: 5, canRun: 'yes', last: { startedAt: 'x' } })).toEqual(
      {
        runningSince: null,
        last: null,
        canRun: false,
      }
    );
  });
});

describe('KbRunNow after audit pass 1', () => {
  const finished = (finishedAt = '2026-10-05T10:04:00Z') =>
    idle({
      last: {
        ...{
          trigger: 'manual',
          startedAt: '2026-10-05T10:00:00Z',
          finishedAt: '2026-10-05T10:04:00Z',
          outcome: 'done',
          skipped: null,
          partial: false,
        },
        finishedAt,
      },
    });

  it('one failed read mid-run does not end the watch: the report still reloads when the run ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const ended: number[] = [];
    stateQueue = [idle({ runningSince: '2026-10-05T10:00:00Z' })];
    render(<KbRunNow onRunEnded={() => ended.push(1)} />);
    await screen.findByRole('button', { name: /Running/ });
    failReads = 1;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    // Still watching after the failure.
    expect(screen.getByRole('button', { name: /Running/ })).toBeTruthy();
    stateQueue = [finished()];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    await waitFor(() => expect(ended).toEqual([1]));
  });

  it('a run that ended before the next read still reloads the report', async () => {
    const ended: number[] = [];
    stateQueue = [idle()];
    render(<KbRunNow onRunEnded={() => ended.push(1)} />);
    const button = await screen.findByRole('button', { name: /Run now/ });
    // The read right after the start already sees the run over.
    stateQueue = [finished()];
    fireEvent.click(button);
    await waitFor(() => expect(ended).toEqual([1]));
  });

  it('a refusal goes away once a newer run outcome is seen, without another click', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stateQueue = [finished('2026-10-05T09:00:00Z')];
    runNowResult = () =>
      Promise.resolve({ started: false, reason: 'already_running', retryAfter: null });
    render(<KbRunNow onRunEnded={() => {}} />);
    const button = await screen.findByRole('button', { name: /Run now/ });
    // The read after the refusal shows the other run going on.
    stateQueue = [idle({ runningSince: '2026-10-05T10:00:00Z' })];
    fireEvent.click(button);
    expect(await screen.findByText('A run is already going on for this workspace.')).toBeTruthy();
    await screen.findByRole('button', { name: /Running/ });
    // A poll then shows that run finished: the refusal is stale.
    stateQueue = [finished('2026-10-05T10:30:00Z')];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    await waitFor(() =>
      expect(screen.queryByText('A run is already going on for this workspace.')).toBeNull()
    );
    expect(runNowCalls).toBe(1);
  });

  it('cooldown says when to retry; an unknown skip keeps its code and time', () => {
    expect(refusalText('cooldown', '2026-10-05T10:14:00Z')).toMatch(
      /^The last run finished only a few minutes ago\. Try again after /
    );
    expect(refusalText('cooldown', null)).toBe('The last run finished only a few minutes ago.');
    expect(refusalText('brand_new', null)).toBe('The run did not start (brand_new).');
    expect(
      lastRunText({
        trigger: 'nightly',
        startedAt: 'x',
        finishedAt: '2026-10-05T05:02:00Z',
        outcome: 'skipped',
        skipped: 'run_time_bound',
        partial: true,
      })
    ).toMatch(/^Last nightly run was skipped at .+ \(run_time_bound\)\.$/);
  });

  it('a cooldown refusal stays, even when the read after it shows a newer run (audit pass 2)', async () => {
    stateQueue = [finished('2026-10-05T09:00:00Z')];
    runNowResult = () =>
      Promise.resolve({ started: false, reason: 'cooldown', retryAfter: '2026-10-05T10:15:00Z' });
    render(<KbRunNow onRunEnded={() => {}} />);
    const button = await screen.findByRole('button', { name: /Run now/ });
    stateQueue = [finished('2026-10-05T10:05:00Z')];
    fireEvent.click(button);
    expect(await screen.findByText(/The last run finished only a few minutes ago/)).toBeTruthy();
    await act(async () => {});
    expect(screen.getByText(/The last run finished only a few minutes ago/)).toBeTruthy();
  });

  it('a first read that fails is retried: the control appears once the state can be read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    failReads = 1;
    stateQueue = [idle()];
    const { container } = render(<KbRunNow onRunEnded={() => {}} />);
    await act(async () => {});
    expect(container.innerHTML).toBe('');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    expect(await screen.findByRole('button', { name: /Run now/ })).toBeTruthy();
  });

  it('a refusal to read (403) is an answer: no polling on it (audit pass 3)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    failReads = 5;
    failStatus = 403;
    const { container } = render(<KbRunNow onRunEnded={() => {}} />);
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);
    });
    expect(reads).toBe(1);
    expect(container.innerHTML).toBe('');
  });

  it('a slow read that lands after a newer one is ignored (audit pass 3)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const ended: number[] = [];
    stateQueue = [idle({ runningSince: '2026-10-05T10:00:00Z' })];
    render(<KbRunNow onRunEnded={() => ended.push(1)} />);
    await screen.findByRole('button', { name: /Running/ });
    // The next poll hangs; the one after answers "finished".
    let releaseSlow: (state: KbConsolidationRunState) => void = () => {};
    readOverride = () =>
      new Promise((resolve) => {
        releaseSlow = resolve;
      });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    readOverride = null;
    stateQueue = [finished()];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    await waitFor(() => expect(ended).toEqual([1]));
    // The slow read finally answers with the OLD running state: it must not apply.
    await act(() => Promise.resolve(releaseSlow(idle({ runningSince: '2026-10-05T10:00:00Z' }))));
    expect(screen.getByRole('button', { name: /Run now/ })).toBeTruthy();
    expect(ended).toEqual([1]);
  });

  it('the refusal live region is mounted before it has anything to say', async () => {
    stateQueue = [idle()];
    render(<KbRunNow onRunEnded={() => {}} />);
    await screen.findByRole('button', { name: /Run now/ });
    expect(screen.getByTestId('kb-run-refusal').textContent).toBe('');
  });

  it('a 403 during a run stops the reads and takes "Running…" down (audit pass 4)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stateQueue = [idle({ runningSince: '2026-10-05T10:00:00Z' })];
    const { container } = render(<KbRunNow onRunEnded={() => {}} />);
    await screen.findByRole('button', { name: /Running/ });
    failReads = 100;
    failStatus = 403;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
    });
    const readsAfterRefusal = reads;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 5);
    });
    expect(reads).toBe(readsAfterRefusal);
    expect(screen.queryByRole('button', { name: /Running/ })).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('the run line is a live region, separate from the refusal region', async () => {
    stateQueue = [idle()];
    render(<KbRunNow onRunEnded={() => {}} />);
    const line = await screen.findByTestId('kb-run-status');
    expect(line.getAttribute('role')).toBe('status');
    expect(screen.getByTestId('kb-run-refusal').getAttribute('role')).toBe('status');
  });

  it.each([401, 404])(
    'a %i during a run is a refusal: reads stop and the control goes',
    async (code) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stateQueue = [idle({ runningSince: '2026-10-05T10:00:00Z' })];
      const { container } = render(<KbRunNow onRunEnded={() => {}} />);
      await screen.findByRole('button', { name: /Running/ });
      failReads = 100;
      failStatus = code;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
      });
      const readsAfter = reads;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);
      });
      expect(reads).toBe(readsAfter);
      expect(container.innerHTML).toBe('');
    }
  );

  it.each([408, 429, 503])(
    'a %i during a run is passing: it keeps reading and keeps "Running…"',
    async (code) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      stateQueue = [idle({ runningSince: '2026-10-05T10:00:00Z' })];
      render(<KbRunNow onRunEnded={() => {}} />);
      await screen.findByRole('button', { name: /Running/ });
      failReads = 100;
      failStatus = code;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS);
      });
      const readsAfter = reads;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(RUN_POLL_MS * 3);
      });
      expect(reads).toBeGreaterThan(readsAfter);
      expect(screen.getByRole('button', { name: /Running/ })).toBeTruthy();
    }
  );
});
