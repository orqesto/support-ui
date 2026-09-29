/**
 * F3 (KB consolidation #873): the moderator's bell row for merge proposals.
 *
 * ONE standing row per department (`kb_consolidation_pending`, details.pending = still pending).
 * What can go wrong: not asking for the kind (the unfiltered list is 20 rows of every kind, so
 * the row scrolls off), counting a row that says nothing is pending, and a Review that leads
 * nowhere a moderator can decide it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';

type GetConfig = { params?: { kind?: string } };
const get = vi.fn<(url: string, config?: GetConfig) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string, config?: GetConfig) => get(url, config) },
}));
vi.mock('@/services/learning.service', () => ({
  learningService: { acceptSuggestion: vi.fn(), declineSuggestion: vi.fn() },
}));
const socketHandlers = new Map<string, Set<(data: unknown) => void>>();
const emit = (event: string, data: unknown) =>
  socketHandlers.get(event)?.forEach((handler) => handler(data));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => ({}),
  releaseSocket: () => {},
  subscribeToEvent: (event: string, handler: (data: unknown) => void) => {
    if (!socketHandlers.has(event)) socketHandlers.set(event, new Set());
    socketHandlers.get(event)?.add(handler);
  },
  unsubscribeFromEvent: (event: string, handler: (data: unknown) => void) =>
    socketHandlers.get(event)?.delete(handler),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 21, user: { organizationId: 21 } }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 4, name: 'Support EU' }] }),
}));

const { useKbReviewAlerts, KB_CONSOLIDATION_KIND, KB_REVIEW_KIND } = await import(
  '../useKbReviewAlerts'
);
const { announceKbConsolidationDecided } = await import('@/lib/kbConsolidation');
const { KbReviewSection, KB_MERGES_REVIEW_PATH } = await import(
  '@/components/layout/KbReviewSection'
);

const mergeRow = (over: Record<string, unknown> = {}) => ({
  id: 31,
  kind: 'kb_consolidation_pending',
  entityType: 'kb_consolidation',
  entityId: 4,
  organizationId: 21,
  departmentId: 4,
  severity: null,
  createdAt: '2026-09-29T02:00:00.000Z',
  details: { suggestionIds: [70, 71, 72], pending: 3 },
  ...over,
});

const respondByKind = (byKind: Record<string, unknown[]>) =>
  get.mockImplementation((_url, config) => {
    const rows = byKind[config?.params?.kind ?? ''] ?? [];
    return Promise.resolve({ data: { data: { notifications: rows, total: rows.length } } });
  });

beforeEach(() => {
  vi.clearAllMocks();
  socketHandlers.clear();
});
afterEach(cleanup);

describe('KB merge bell row (F3)', () => {
  it('asks for its own kind and surfaces ONE row per department with the pending count', async () => {
    respondByKind({ [KB_CONSOLIDATION_KIND]: [mergeRow()] });
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(result.current.consolidations).toHaveLength(1));
    expect(get).toHaveBeenCalledWith('/api/notifications', {
      params: { kind: 'kb_consolidation_pending' },
    });
    expect(result.current.consolidations[0]).toEqual({
      id: 31,
      departmentId: 4,
      suggestionIds: [70, 71, 72],
      pending: 3,
    });
    expect(result.current.rowCount).toBe(1);
  });

  it('a row that says nothing is pending is not counted', async () => {
    respondByKind({
      [KB_CONSOLIDATION_KIND]: [mergeRow({ details: { suggestionIds: [], pending: 0 } })],
    });
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.consolidations).toHaveLength(0);
    expect(result.current.rowCount).toBe(0);
  });

  it('ignores other kinds a backend that dropped ?kind= would send', async () => {
    respondByKind({
      [KB_CONSOLIDATION_KIND]: [mergeRow(), mergeRow({ id: 32, kind: 'kb_review_pending' })],
    });
    const { result } = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(result.current.consolidations).toHaveLength(1));
  });

  it('the section shows the count and department, and Review goes to the merges page', () => {
    const onNavigate = vi.fn();
    render(
      <KbReviewSection
        review={{
          alerts: [],
          consolidations: [{ id: 31, departmentId: 4, suggestionIds: [70, 71, 72], pending: 3 }],
          rowCount: 1,
          decide: vi.fn(),
          actingId: null,
          error: null,
          refresh: vi.fn(),
        }}
        showLabel
        SectionLabel={({ children }) => <p>{children}</p>}
        onNavigate={onNavigate}
      />
    );
    expect(
      screen.getByText('3 proposed merges of similar knowledge base answers are waiting for review')
    ).toBeInTheDocument();
    expect(screen.getByText('Support EU')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review proposed merges' }));
    expect(onNavigate).toHaveBeenCalledWith(KB_MERGES_REVIEW_PATH);
    expect(KB_MERGES_REVIEW_PATH).toBe('/knowledge-base/merges');
  });
});

const kindsAsked = () => get.mock.calls.map(([, config]) => config?.params?.kind ?? '(none)');

describe('KB merge bell stays current (M1)', () => {
  const mounted = async () => {
    respondByKind({ [KB_CONSOLIDATION_KIND]: [mergeRow()] });
    const hook = renderHook(() => useKbReviewAlerts());
    await waitFor(() => expect(hook.result.current.consolidations).toHaveLength(1));
    get.mockClear();
    return hook;
  };

  it('re-counts on notification:updated — one request, for that kind only', async () => {
    const { result } = await mounted();
    respondByKind({
      [KB_CONSOLIDATION_KIND]: [mergeRow({ details: { suggestionIds: [71], pending: 1 } })],
    });
    act(() => emit('notification:updated', { ids: [31], kind: KB_CONSOLIDATION_KIND }));
    await waitFor(() => expect(result.current.consolidations[0]?.pending).toBe(1));
    expect(kindsAsked()).toEqual([KB_CONSOLIDATION_KIND]);
  });

  it('a capture-review event asks only for capture reviews', async () => {
    await mounted();
    act(() => emit('notification:resolved', { ids: [5], kind: KB_REVIEW_KIND }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(kindsAsked()).toEqual([KB_REVIEW_KIND]);
  });

  it('an event of an unrelated kind asks for nothing', async () => {
    await mounted();
    act(() => emit('notification:new', { kind: 'sla_breach', organizationId: 21 }));
    act(() => emit('notification:updated', { ids: [1], kind: 'sla_breach' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(get).not.toHaveBeenCalled();
  });

  it('an event without a kind asks for nothing — every backend emit names its kind (LOW-6)', async () => {
    await mounted();
    act(() => emit('notification:resolved', { ids: [5] }));
    act(() => emit('notification:new', null));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(get).not.toHaveBeenCalled();
  });

  it('a decision taken in this tab re-counts the merge row at once', async () => {
    const { result } = await mounted();
    respondByKind({ [KB_CONSOLIDATION_KIND]: [] });
    act(() => announceKbConsolidationDecided());
    await waitFor(() => expect(result.current.consolidations).toHaveLength(0));
    expect(kindsAsked()).toEqual([KB_CONSOLIDATION_KIND]);
  });
});
