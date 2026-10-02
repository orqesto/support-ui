import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingSummaryEntry } from '@/services/importProgress.service';

/** Plain functions, not module-level vi.fn (see RecentRunsAndKbFailures.test). */
let calls = 0;
let answer: () => Promise<ProcessingSummaryEntry[]> = () => Promise.resolve([]);
vi.mock('@/services/importProgress.service', () => ({
  importProgressService: {
    summary: () => {
      calls += 1;
      return answer();
    },
  },
}));

const { useProcessingSummary, PROCESSING_SUMMARY_POLL_MS } = await import(
  '@/hooks/useProcessingSummary'
);
const { ProcessingIndicator } = await import('@/components/processing/ProcessingIndicator');

const entry = (sourceId: number): ProcessingSummaryEntry => ({
  sourceId,
  name: `Mailbox ${sourceId}`,
  type: 'gmail',
  unavailable: false,
  inProgress: 1,
  problems: 0,
  countCapped: false,
});

const refusal = (status: number) =>
  new AxiosError('refused', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });

const flush = () => act(async () => {});

/** Moves fake time and lets what it started settle. */
const advance = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });

beforeEach(() => {
  vi.useFakeTimers();
  calls = 0;
  answer = () => Promise.resolve([entry(1)]);
});
afterEach(() => vi.useRealTimers());

describe('useProcessingSummary', () => {
  it('asks at once and every 15 s', async () => {
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    expect(calls).toBe(1);
    expect(result.current.entries).toEqual([entry(1)]);
    await advance(PROCESSING_SUMMARY_POLL_MS);
    expect(calls).toBe(2);
  });

  it('a 403 stops polling (a role without the permission)', async () => {
    answer = () => Promise.reject(refusal(403));
    renderHook(() => useProcessingSummary(1, 0));
    await flush();
    await advance(PROCESSING_SUMMARY_POLL_MS * 3);
    expect(calls).toBe(1);
  });

  it('CONTROL: a 500 keeps polling', async () => {
    answer = () => Promise.reject(refusal(500));
    renderHook(() => useProcessingSummary(1, 0));
    await flush();
    // One tick at a time: each answer settles before the next tick, as 15 s apart they do.
    for (const _tick of [1, 2]) {
      await advance(PROCESSING_SUMMARY_POLL_MS);
    }
    expect(calls).toBe(3);
  });

  it('a workspace switch drops the old numbers and asks for the new ones', async () => {
    const { result, rerender } = renderHook(({ org }) => useProcessingSummary(org, 0), {
      initialProps: { org: 1 },
    });
    await flush();
    expect(result.current.entries).toHaveLength(1);
    let resolveNext: (value: ProcessingSummaryEntry[]) => void = () => undefined;
    answer = () => new Promise((resolve) => (resolveNext = resolve));
    rerender({ org: 2 });
    await flush();
    expect(result.current.entries).toEqual([]);
    await act(async () => {
      resolveNext([entry(9)]);
      await Promise.resolve();
    });
    expect(result.current.entries).toEqual([entry(9)]);
  });

  it('a new refreshKey asks now, not at the next tick', async () => {
    const { rerender } = renderHook(({ key }) => useProcessingSummary(1, key), {
      initialProps: { key: 0 },
    });
    await flush();
    expect(calls).toBe(1);
    rerender({ key: 1 });
    await flush();
    expect(calls).toBe(2);
  });

  it('a hidden tab stops polling', async () => {
    renderHook(() => useProcessingSummary(1, 0));
    await flush();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(PROCESSING_SUMMARY_POLL_MS * 3);
    expect(calls).toBe(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(calls).toBe(2);
  });

  it('no workspace yet: asks nothing', async () => {
    renderHook(() => useProcessingSummary(undefined, 0));
    await flush();
    expect(calls).toBe(0);
  });

  it('CONTROL for useVisiblePolling: a change of pace alone asks nothing at once (pass 4, L2)', async () => {
    const { useVisiblePolling } = await import('@/hooks/useVisiblePolling');
    let ticks = 0;
    const tick = () => {
      ticks += 1;
    };
    const { rerender } = renderHook(({ ms }) => useVisiblePolling(tick, true, ms), {
      initialProps: { ms: 15_000 },
    });
    expect(ticks).toBe(1);
    rerender({ ms: 300_000 });
    expect(ticks).toBe(1);
    await advance(300_000);
    expect(ticks).toBe(2);
  });
});

/**
 * FE audit pass 19, LOW: the backend's two 15 s caches can answer `resumeQueued: false` for a few
 * polls beside a pause a resume has just taken up. The entry as the final controller writes it
 * (getProcessingSummary, every field on every entry), 10 min after the reset, its mine resuming on
 * schedule.
 */
describe('resumeQueued: false is passed on only once it persists', () => {
  const RESET = '2026-10-02T00:00:00.000Z';
  const pausedMine = (over: Partial<ProcessingSummaryEntry> = {}): ProcessingSummaryEntry => ({
    ...entry(1),
    inProgress: 0,
    pausedByLimit: 1,
    pausedUntil: RESET,
    resumeWindowEnd: '2026-10-02T00:30:00.000Z',
    minePausedUntil: RESET,
    mineResumeWindowEnd: '2026-10-02T00:30:00.000Z',
    resumeQueued: false,
    waitingForSlot: false,
    releaseQueuedAt: null,
    resumeAdmittedAt: null,
    ...over,
  });
  // The mine began: its run record is the newest, nothing is paused any more — no wake window
  // either (getProcessingSummary sends null with no counted pause; pass 20, NIT).
  const running = (): ProcessingSummaryEntry => ({
    ...pausedMine({ inProgress: 1, pausedByLimit: 0, pausedUntil: null, resumeWindowEnd: null }),
    minePausedUntil: null,
    mineResumeWindowEnd: null,
    resumeQueued: null,
    waitingForSlot: null,
  });
  // Its own unmount only: `cleanup()` would unmount the hook too, and stop its polling.
  const label = (entries: ProcessingSummaryEntry[]) => {
    const view = render(<ProcessingIndicator entries={entries} onOpen={() => undefined} />);
    const text = screen.getByTestId('processing-indicator').getAttribute('aria-label');
    view.unmount();
    return text;
  };
  beforeEach(() => vi.setSystemTime(new Date('2026-10-02T00:10:00.000Z')));
  afterEach(() => cleanup());

  it('a false on two polls 15 s apart, then running, never reads stuck', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    expect(result.current.entries[0].resumeQueued).toBeNull();
    expect(label(result.current.entries)).toMatch(/resuming after 00:00 UTC/);
    await advance(PROCESSING_SUMMARY_POLL_MS);
    expect(result.current.entries[0].resumeQueued).toBeNull();
    expect(label(result.current.entries)).not.toMatch(/no resume queued/);
    answer = () => Promise.resolve([running()]);
    await advance(PROCESSING_SUMMARY_POLL_MS);
    expect(label(result.current.entries)).toMatch(/1 mail check or mine still processing/);
  });

  // Hard-coded, not looped on the constant (pass 20, LOW): a raised threshold must go red here —
  // a stuck mine is called stuck by the poll 45 s after its first false.
  it('CONTROL: still false 45 s later — stuck, with the way out', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    await advance(15_000);
    await advance(15_000);
    expect(result.current.entries[0].resumeQueued).toBeNull();
    await advance(15_000);
    expect(result.current.entries[0].resumeQueued).toBe(false);
    expect(label(result.current.entries)).toBe(
      '1 knowledge-base mine paused at the daily AI limit has no resume queued and will not continue by itself; re-mine the mailbox to continue'
    );
  });

  it('another answer in between starts the wait again; so does another paused mine', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    await advance(PROCESSING_SUMMARY_POLL_MS * 2);
    answer = () => Promise.resolve([pausedMine({ resumeQueued: true })]);
    await advance(PROCESSING_SUMMARY_POLL_MS);
    answer = () => Promise.resolve([pausedMine()]);
    // One poll at a time: 15, 30, 45 s after the true answer — 30 s after the first false.
    await advance(PROCESSING_SUMMARY_POLL_MS);
    await advance(PROCESSING_SUMMARY_POLL_MS);
    await advance(PROCESSING_SUMMARY_POLL_MS);
    expect(result.current.entries[0].resumeQueued).toBeNull();
    // 45 s after the first false of the old pause, a NEW paused mine's first false.
    answer = () => Promise.resolve([pausedMine({ minePausedUntil: '2026-10-03T00:00:00.000Z' })]);
    await advance(PROCESSING_SUMMARY_POLL_MS);
    expect(result.current.entries[0].resumeQueued).toBeNull();
  });

  it('a workspace switch starts the wait again', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result, rerender } = renderHook(({ org }) => useProcessingSummary(org, 0), {
      initialProps: { org: 1 },
    });
    await flush();
    await advance(15_000);
    await advance(15_000);
    rerender({ org: 2 });
    await flush();
    await advance(15_000);
    expect(result.current.entries[0].resumeQueued).toBeNull();
  });

  it('an unavailable answer (null) in between starts the wait again', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    await advance(15_000);
    answer = () => Promise.resolve([pausedMine({ resumeQueued: null })]);
    await advance(15_000);
    answer = () => Promise.resolve([pausedMine()]);
    await advance(15_000);
    await advance(15_000);
    // 60 s after the first false, 30 s after the false that followed the null.
    expect(result.current.entries[0].resumeQueued).toBeNull();
  });

  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const show = async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
  };

  it('a short hidden stretch: the first poll after it confirms', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    await advance(15_000);
    await advance(15_000);
    hide();
    await advance(20_000);
    await show();
    // 50 s after the first false, 20 s after the last sighting.
    expect(result.current.entries[0].resumeQueued).toBe(false);
  });

  // Pass 21, NIT: one failed poll, and the answer after it a little late, is still the same
  // stretch of sightings — at exactly two polls apart it started the wait again.
  it('one failed poll and a slow answer after it: still confirmed 45 s after the first false', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    answer = () => Promise.reject(new Error('network'));
    await advance(15_000);
    answer = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve([pausedMine()]), 300);
      });
    await advance(15_000);
    await advance(300);
    expect(result.current.entries[0].resumeQueued).toBeNull();
    answer = () => Promise.resolve([pausedMine()]);
    await advance(15_000);
    // Confirmed by the poll at 45.0 s after the first false (the clock reads 45.3 s: the slow
    // answer's 300 ms), with one poll unseen in between.
    expect(result.current.entries[0].resumeQueued).toBe(false);
  });

  it('CONTROL: two failed polls in a row start the wait again', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    answer = () => Promise.reject(new Error('network'));
    await advance(15_000);
    await advance(15_000);
    answer = () => Promise.resolve([pausedMine()]);
    await advance(15_000);
    await advance(15_000);
    // 60 s after the first false, 15 s after the first false seen after the gap.
    expect(result.current.entries[0].resumeQueued).toBeNull();
  });

  // FE audit pass 20, NIT: a false seen before a hide must not survive an unseen true.
  it('a long hidden stretch: the wait starts again on the first poll after it', async () => {
    answer = () => Promise.resolve([pausedMine()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    await advance(15_000);
    await advance(15_000);
    hide();
    await advance(90_000);
    await show();
    expect(result.current.entries[0].resumeQueued).toBeNull();
    await advance(15_000);
    await advance(15_000);
    expect(result.current.entries[0].resumeQueued).toBeNull();
    await advance(15_000);
    expect(result.current.entries[0].resumeQueued).toBe(false);
  });
});

/**
 * FE audit pass 20, LOW (BE B3): a mine waiting for a re-mine slot past its window (03:00) and
 * then ADMITTED answered `resumeQueued: false` beside its still-paused record — "late … has not
 * resumed yet" plus a warning. The backend says so (`resumeAdmittedAt`); the hook passes the
 * backend's own slot answer on unchanged.
 */
describe('a slot wait past the window that ends in an admission', () => {
  const RESET = '2026-10-02T00:00:00.000Z';
  const WINDOW_END = '2026-10-02T00:30:00.000Z';
  const r20 = (over: Partial<ProcessingSummaryEntry> = {}): ProcessingSummaryEntry => ({
    ...entry(1),
    inProgress: 0,
    pausedByLimit: 1,
    pausedUntil: RESET,
    resumeWindowEnd: WINDOW_END,
    minePausedUntil: RESET,
    mineResumeWindowEnd: WINDOW_END,
    resumeQueued: true,
    waitingForSlot: true,
    releaseQueuedAt: null,
    resumeAdmittedAt: null,
    ...over,
  });
  const begun = (shape: (over: Partial<ProcessingSummaryEntry>) => ProcessingSummaryEntry) =>
    shape({
      inProgress: 1,
      pausedByLimit: 0,
      pausedUntil: null,
      resumeWindowEnd: null,
      minePausedUntil: null,
      mineResumeWindowEnd: null,
      resumeQueued: null,
      waitingForSlot: null,
    });
  const shown = (entries: ProcessingSummaryEntry[]) => {
    const view = render(<ProcessingIndicator entries={entries} onOpen={() => undefined} />);
    const button = screen.getByTestId('processing-indicator');
    const seen = {
      label: button.getAttribute('aria-label') ?? '',
      warns: button.querySelector('.text-warning') !== null,
    };
    view.unmount();
    return seen;
  };
  beforeEach(() => vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z')));
  afterEach(() => cleanup());

  it('BE R20: admitted reads "resuming now", calm, at once', async () => {
    answer = () => Promise.resolve([r20()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    const steps = [shown(result.current.entries)];
    answer = () =>
      Promise.resolve([
        // As the controller answers an admission: resumeQueued true, the job gone.
        r20({
          resumeQueued: true,
          waitingForSlot: false,
          resumeAdmittedAt: '2026-10-02T03:00:10.000Z',
        }),
      ]);
    await advance(15_000);
    steps.push(shown(result.current.entries));
    answer = () => Promise.resolve([begun(r20)]);
    await advance(15_000);
    steps.push(shown(result.current.entries));
    for (const step of steps) expect(step.warns).toBe(false);
    expect(steps[1].label).toBe(
      '1 knowledge-base mine paused at the daily AI limit is resuming now'
    );
  });

  it("CONTROL: without an admission the slot answer is the backend's — a false is not turned into a wait", async () => {
    answer = () => Promise.resolve([r20()]);
    const { result } = renderHook(() => useProcessingSummary(1, 0));
    await flush();
    answer = () => Promise.resolve([r20({ resumeQueued: false, waitingForSlot: false })]);
    await advance(15_000);
    expect(result.current.entries[0].waitingForSlot).toBe(false);
  });
});
