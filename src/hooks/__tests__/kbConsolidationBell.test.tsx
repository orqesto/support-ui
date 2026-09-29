/**
 * F3 (KB consolidation #873): the moderator's bell row for merge proposals.
 *
 * ONE standing row per department (`kb_consolidation_pending`, details.pending = still pending).
 * What can go wrong: not asking for the kind (the unfiltered list is 20 rows of every kind, so
 * the row scrolls off), counting a row that says nothing is pending, and a Review that leads
 * nowhere a moderator can decide it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

type GetConfig = { params?: { kind?: string } };
const get = vi.fn<(url: string, config?: GetConfig) => Promise<unknown>>();

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: (url: string, config?: GetConfig) => get(url, config) },
}));
vi.mock('@/services/learning.service', () => ({
  learningService: { acceptSuggestion: vi.fn(), declineSuggestion: vi.fn() },
}));
vi.mock('@/lib/socketManager', () => ({
  getSocket: () => null,
  releaseSocket: () => {},
  subscribeToEvent: () => {},
  unsubscribeFromEvent: () => {},
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedOrganizationId: 21, user: { organizationId: 21 } }),
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 4, name: 'Support EU' }] }),
}));

const { useKbReviewAlerts, KB_CONSOLIDATION_KIND } = await import('../useKbReviewAlerts');
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

beforeEach(() => vi.clearAllMocks());
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
