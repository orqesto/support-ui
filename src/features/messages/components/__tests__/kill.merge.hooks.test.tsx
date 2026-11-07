/**
 * useThreadMergeContext — the races between merge-list reads, thread switches and confirmed
 * changes (only the latest read may write), withMergeChange on a never-read list and on a row
 * already listed, and a merged-in label while the list is unread. Plus useIsPhone subscribing to
 * the media query's 'change' event by its NAME (the existing mock ignored the type).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type * as MergeServiceModule from '@/services/conversationMerge.service';
import type { MessageEvent } from '@/types';

type Deferred = { promise: Promise<unknown>; resolve: (value: unknown) => void };
const deferred = (): Deferred => {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const reads: Array<{ id: number; read: Deferred }> = [];
const listMerges = (id: number) => {
  const read = deferred();
  reads.push({ id, read });
  return read.promise;
};
vi.mock('@/services/conversationMerge.service', async () => {
  const real = await vi.importActual<typeof MergeServiceModule>(
    '@/services/conversationMerge.service'
  );
  return {
    ...real,
    conversationMergeService: {
      ...real.conversationMergeService,
      listMerges,
      participants: () => Promise.resolve([]),
    },
  };
});
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ODL' }));

type ManualMerge = MergeServiceModule.ManualMerge;

const { useThreadMergeContext, withMergeChange } = await import('../useThreadMergeContext');
const { PHONE_QUERY, useIsPhone } = await import('../useIsPhone');

const row = (id: number): ManualMerge => ({
  id,
  publicId: `SUP-${id}`,
  subject: null,
  mergedAt: null,
  mergedBy: null,
});
const ROW_A = row(1);
const ROW_B = row(2);
const ROW_C = row(3);

const settle = async (index: number, rows: ManualMerge[] | null) => {
  await act(async () => {
    reads[index].read.resolve(rows);
    await Promise.resolve();
  });
};

beforeEach(() => {
  reads.length = 0;
});

describe('withMergeChange', () => {
  it('a list never read stays null, for either kind of change', () => {
    expect(withMergeChange(null, { unmerged: 1 })).toBeNull();
    expect(withMergeChange(null, { mergedIn: [ROW_A] })).toBeNull();
  });

  it('a merged-in row already listed (a re-read landed first) is listed once', () => {
    expect(withMergeChange([ROW_A, ROW_B], { mergedIn: [ROW_A] })).toEqual([ROW_B, ROW_A]);
    expect(withMergeChange([ROW_A], { mergedIn: [ROW_A, ROW_C] })).toEqual([ROW_A, ROW_C]);
  });
});

describe('useThreadMergeContext — only the latest read writes', () => {
  it('switching threads: the old thread’s read landing LAST never shows as this one’s', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useThreadMergeContext(id, false, 0),
      { initialProps: { id: 10 } }
    );
    expect(reads.map((entry) => entry.id)).toEqual([10]);
    rerender({ id: 20 });
    expect(reads.map((entry) => entry.id)).toEqual([10, 20]);
    await settle(1, [ROW_C]);
    expect(result.current.merges).toEqual([ROW_C]);
    await settle(0, [ROW_A, ROW_B]);
    expect(result.current.merges).toEqual([ROW_C]);
  });

  it('switching threads: the old read landing BEFORE the new one is not shown either', async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useThreadMergeContext(id, false, 0),
      { initialProps: { id: 10 } }
    );
    rerender({ id: 20 });
    await settle(0, [ROW_A, ROW_B]);
    expect(result.current.merges).toBeNull();
    await settle(1, [ROW_C]);
    expect(result.current.merges).toEqual([ROW_C]);
  });

  it('a confirmed unmerge disowns the read already in flight, even after a reload starts', async () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useThreadMergeContext(10, false, key),
      { initialProps: { key: 0 } }
    );
    await settle(0, [ROW_A, ROW_B]);
    expect(result.current.merges).toEqual([ROW_A, ROW_B]);
    // A refresh read starts, carrying the list from BEFORE the unmerge.
    rerender({ key: 1 });
    expect(reads).toHaveLength(2);
    act(() => result.current.applyMergeChange({ unmerged: ROW_A.id }));
    expect(result.current.merges).toEqual([ROW_B]);
    act(() => result.current.reloadMerges());
    expect(reads).toHaveLength(3);
    // The stale read lands: the unmerged row must not come back.
    await settle(1, [ROW_A, ROW_B]);
    expect(result.current.merges).toEqual([ROW_B]);
    // CONTROL: the latest read does write.
    await settle(2, [ROW_B, ROW_C]);
    expect(result.current.merges).toEqual([ROW_B, ROW_C]);
  });
});

describe('useThreadMergeContext — mergedFromLabel before the list is read', () => {
  const merged = (trail: number[]) =>
    ({ metadata: { mergeTrail: trail } }) as unknown as MessageEvent;

  it('says “from a merged ticket” (no crash) while the first read is pending', () => {
    const { result } = renderHook(() => useThreadMergeContext(10, false, 0));
    expect(result.current.merges).toBeNull();
    expect(result.current.mergedFromLabel(merged([555]))).toBe('from a merged ticket');
  });

  it('…and after a first read the backend could not answer (null)', async () => {
    const { result } = renderHook(() => useThreadMergeContext(10, false, 0));
    await settle(0, null);
    expect(result.current.merges).toBeNull();
    expect(result.current.mergedFromLabel(merged([1]))).toBe('from a merged ticket');
  });
});

describe('useIsPhone — subscribes to the query’s change event by name', () => {
  type Listener = (event: MediaQueryListEvent) => void;
  const listeners = new Map<string, Set<Listener>>();
  const state = { phone: false };

  beforeEach(() => {
    listeners.clear();
    state.phone = false;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        get matches() {
          return state.phone && query === PHONE_QUERY;
        },
        media: query,
        onchange: null,
        addEventListener: (type: string, listener: Listener) => {
          if (!listeners.has(type)) listeners.set(type, new Set());
          listeners.get(type)?.add(listener);
        },
        removeEventListener: (type: string, listener: Listener) => {
          listeners.get(type)?.delete(listener);
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  const fire = (phone: boolean) => {
    state.phone = phone;
    for (const listener of listeners.get('change') ?? [])
      listener({ matches: phone, media: PHONE_QUERY } as MediaQueryListEvent);
  };

  it('a crossing of 640px reported as “change” flips it', () => {
    const { result } = renderHook(() => useIsPhone());
    expect(result.current).toBe(false);
    expect(listeners.get('change')?.size).toBe(1);
    act(() => fire(true));
    expect(result.current).toBe(true);
  });

  it('unmounting removes the “change” listener', async () => {
    const { unmount } = renderHook(() => useIsPhone());
    expect(listeners.get('change')?.size).toBe(1);
    unmount();
    await waitFor(() => expect(listeners.get('change')?.size).toBe(0));
  });
});
