import { act, renderHook } from '@testing-library/react';
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
