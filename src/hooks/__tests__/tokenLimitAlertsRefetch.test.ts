/**
 * Audit pass 5 (FE, MED): a limit save rewrites a notice in place (`details.releasedAt`) and the
 * backend announces it with `notification:updated { ids, kind }` — not `notification:new`. The
 * bell re-reads on every notification event of ITS kind, and after a save in this tab.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

let gets = 0;
let released = 0;
const listOf = (notifications: unknown[]) => Promise.resolve({ data: { data: { notifications } } });
let getImpl: () => Promise<unknown> = () => listOf([]);
let patchImpl: (url: string) => Promise<unknown> = () => Promise.resolve({ data: {} });
const handlers = new Map<string, Set<(data: unknown) => void>>();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: () => {
      gets += 1;
      return getImpl();
    },
    patch: (url: string) => patchImpl(url),
  },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {
    released += 1;
  },
  subscribeToEvent: (event: string, handler: (data: unknown) => void) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)?.add(handler);
  },
  unsubscribeFromEvent: (event: string, handler: (data: unknown) => void) => {
    handlers.get(event)?.delete(handler);
  },
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 4, user: { organizationId: 4 } }),
}));

const { useTokenLimitAlerts, TOKEN_LIMIT_REACHED_KIND, TOKEN_LIMITS_SAVED_EVENT } = await import(
  '@/hooks/useTokenLimitAlerts'
);
const { toastLimitSaved } = await import('@/pages/console/tokenLimits.helpers');

const emit = (event: string, data: unknown) => {
  for (const handler of handlers.get(event) ?? []) handler(data);
};

beforeEach(() => {
  gets = 0;
  released = 0;
  getImpl = () => listOf([]);
  patchImpl = () => Promise.resolve({ data: {} });
  handlers.clear();
});
afterEach(() => cleanup());

describe('useTokenLimitAlerts re-reads when a notice changes', () => {
  it.each(['notification:new', 'notification:updated', 'notification:resolved'])(
    '%s of its kind re-reads the notices',
    async (event) => {
      renderHook(() => useTokenLimitAlerts());
      await waitFor(() => expect(gets).toBe(1));
      act(() => emit(event, { ids: [9], kind: TOKEN_LIMIT_REACHED_KIND }));
      await waitFor(() => expect(gets).toBe(2));
    }
  );

  it('an event of another kind (or none) does not', async () => {
    renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(gets).toBe(1));
    act(() => {
      emit('notification:updated', { ids: [9], kind: 'kb_review_pending' });
      emit('notification:new', { kind: 'sla_breach' });
      emit('notification:new', null);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gets).toBe(1);
  });

  it('unmount unsubscribes every event it subscribed to', async () => {
    const { unmount } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(gets).toBe(1));
    expect(handlers.get('connect')?.size).toBe(1);
    unmount();
    for (const set of handlers.values()) expect(set.size).toBe(0);
    // The socket reference is given back, and a later save in this tab reads nothing.
    expect(released).toBe(1);
    act(() => {
      window.dispatchEvent(new Event(TOKEN_LIMITS_SAVED_EVENT));
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gets).toBe(1);
  });

  it('a socket reconnect re-reads the notices (F8-3)', async () => {
    renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(gets).toBe(1));
    act(() => emit('connect', undefined));
    await waitFor(() => expect(gets).toBe(2));
  });

  it('a successful limit save in the console re-reads the notices', async () => {
    renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(gets).toBe(1));
    act(() => toastLimitSaved('Daily token limits saved', { release: null, regularRelease: null }));
    await waitFor(() => expect(gets).toBe(2));
    act(() => {
      window.dispatchEvent(new Event(TOKEN_LIMITS_SAVED_EVENT));
    });
    await waitFor(() => expect(gets).toBe(3));
  });
});

const limitRow = (id: number, details: Record<string, unknown>) => ({
  id,
  kind: TOKEN_LIMIT_REACHED_KIND,
  details: { bucket: 'kb', resetsAt: '2099-01-01T00:00:00.000Z', ...details },
});

describe('useTokenLimitAlerts — dismiss and odd rows', () => {
  it('a read in flight when a notice is dismissed does not bring it back', async () => {
    getImpl = () => listOf([limitRow(9, {})]);
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    let answer: (value: unknown) => void = () => {};
    getImpl = () => new Promise((resolve) => (answer = resolve));
    let patched: (value: unknown) => void = () => {};
    patchImpl = () => new Promise((resolve) => (patched = resolve));
    act(() => result.current.refresh());
    act(() => result.current.dismiss(9));
    expect(result.current.alerts).toHaveLength(0);
    // The read sent BEFORE the dismiss answers with the notice still in it.
    await act(async () => {
      answer({ data: { data: { notifications: [limitRow(9, {})] } } });
      await Promise.resolve();
    });
    expect(result.current.alerts).toHaveLength(0);
    // Once the dismiss is through, the list is read again.
    getImpl = () => listOf([]);
    await act(async () => {
      patched({ data: {} });
      await Promise.resolve();
    });
    await waitFor(() => expect(gets).toBe(3));
    expect(result.current.alerts).toHaveLength(0);
  });

  it('two quick dismisses: the first one’s re-read does not bring the second back (pass 9)', async () => {
    getImpl = () => listOf([limitRow(9, {}), limitRow(10, {})]);
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
    const answers = new Map<string, (value: unknown) => void>();
    patchImpl = (url: string) => new Promise((resolve) => answers.set(url, resolve));
    act(() => result.current.dismiss(9));
    act(() => result.current.dismiss(10));
    expect(result.current.alerts).toHaveLength(0);
    // 9's dismiss answers first; its re-read is answered while 10's dismiss is still on its way
    // and so still carries 10 — beside 11, a new notice nobody dismissed. Waiting for 11 proves
    // that re-read was APPLIED before 10's absence is asserted (pass 10 NIT: the check used to
    // pass before the re-read arrived).
    getImpl = () => listOf([limitRow(10, {}), limitRow(11, {})]);
    await act(async () => {
      answers.get('/api/notifications/9/dismiss')?.({ data: {} });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.alerts.map((alert) => alert.id)).toEqual([11]));
    // CONTROL in the same run: once 10's dismiss is through, a read that still had it shows it.
    await act(async () => {
      answers.get('/api/notifications/10/dismiss')?.({ data: {} });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.alerts).toHaveLength(2));
  });

  it('fields of the wrong shape read as unknown, never as a release or a figure', async () => {
    getImpl = () =>
      listOf([
        {
          id: 4,
          kind: TOKEN_LIMIT_REACHED_KIND,
          // Every field present and WRONGLY typed (pass 9, NIT): absent fields proved nothing.
          details: {
            bucket: 7,
            title: { text: 'x' },
            spent: '9',
            limit: null,
            enforced: 'true',
            resetsAt: 1_900_000_000_000,
            effect: ['paused'],
            partial: 'yes',
            releaseKind: 'other',
            releasedAt: 'nope',
            checkedAt: 123,
            releaseCause: 5,
          },
        },
      ]);
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.alerts[0]).toMatchObject({
      bucket: 'unknown',
      title: null,
      effect: null,
      spent: null,
      limit: null,
      enforced: false,
      resetsAt: null,
      releasedAt: null,
      checkedAt: null,
      releasePartial: null,
      releaseKind: null,
      // Absent or unknown cause reads as the backend reads it.
      releaseCause: 'limit_setting',
    });
    // Not shown to be over: still badged.
    expect(result.current.badged).toBe(1);
  });
});

/**
 * R8 contract (c): the limit is reached again after a save released it — the backend re-uses the
 * SAME row (unread, new createdAt, new details) and sends `notification:new` + `notification:updated`.
 */
describe('a new occurrence of a notice already listed', () => {
  const row = (createdAt: string, details: Record<string, unknown>) => ({
    id: 77,
    kind: TOKEN_LIMIT_REACHED_KIND,
    title: 'Daily AI limit for KB processing reached',
    isRead: false,
    createdAt,
    details: {
      title: 'Daily AI limit for KB processing reached',
      bucket: 'kb',
      spent: 5_000_100,
      limit: 5_000_000,
      enforced: true,
      resetsAt: '2099-01-02T00:00:00.000Z',
      effect: 'Knowledge-base mining pauses until the reset.',
      ...details,
    },
  });

  it('replaces the row by id — one notice, the new details, badged again', async () => {
    getImpl = () =>
      listOf([
        row('2099-01-01T08:00:00.000Z', {
          releasedAt: '2099-01-01T09:00:00.000Z',
          partial: false,
          releaseKind: 'mining',
        }),
      ]);
    const { result } = renderHook(() => useTokenLimitAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));
    expect(result.current.badged).toBe(0);
    getImpl = () => listOf([row('2099-01-01T14:00:00.000Z', { spent: 5_000_900 })]);
    act(() => {
      emit('notification:new', { id: 77, kind: TOKEN_LIMIT_REACHED_KIND });
      emit('notification:updated', { ids: [77], kind: TOKEN_LIMIT_REACHED_KIND });
    });
    await waitFor(() => expect(result.current.alerts[0]?.spent).toBe(5_000_900));
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0]).toMatchObject({ id: 77, releasedAt: null });
    expect(result.current.badged).toBe(1);
  });
});
