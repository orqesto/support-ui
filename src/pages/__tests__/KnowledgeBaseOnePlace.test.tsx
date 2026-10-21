/**
 * The Knowledge Base list is the one place to decide and to undo: a deep link opens the entry's
 * decision even when the row is not on page 1, and "Changed automatically" lists what the system
 * did by itself with one undo per row. All data is invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';
import type * as ApiClientModule from '@/lib/api-client';

type Params = { status?: string; search?: string };
const state = vi.hoisted(() => ({
  autoChangedStatus: true,
  getAllCalls: [] as Array<{ status?: string; search?: string }>,
  post: vi.fn((..._args: unknown[]) => Promise.resolve({ data: {} })),
  patch: vi.fn((..._args: unknown[]) => Promise.resolve({ data: { data: {} } })),
}));

const base = {
  type: 'qa_pair',
  category: 'returns',
  departmentId: null,
  qualityScore: 0.8,
  approved: true,
  approvedBy: null,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-10-19T02:00:00.000Z',
  content: 'Some content.',
};
const mergeEntry = {
  ...base,
  id: 42,
  title: 'Return address for Example Shop',
  pendingDecision: { suggestionId: 5, kind: 'merge', reasons: [], canDecide: true },
};
const otherEntry = { ...base, id: 7, title: 'Opening hours', pendingDecision: null };
const cleanedEntry = {
  ...base,
  id: 50,
  title: 'Customer-specific answer',
  autoChange: {
    action: 'cleanPersonalData',
    at: '2026-10-20T02:00:00.000Z',
    confidence: 0.9,
    undo: 'undo_clean',
    suggestionId: 77,
  },
};

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    apiClient: { ...actual.apiClient, post: state.post, patch: state.patch },
  };
});
vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      // The detail route sends no decision (only the list does).
      getById: (id: number) =>
        Promise.resolve({
          data: { ...(id === 42 ? mergeEntry : otherEntry), pendingDecision: undefined },
        }),
      getAll: (params: Params) => {
        state.getAllCalls.push(params);
        const status = params.status;
        const entries =
          status === 'auto_changed'
            ? [cleanedEntry]
            : status === 'suggested_change'
              ? params.search
                ? [mergeEntry]
                : [otherEntry]
              : [];
        const applied = status !== 'auto_changed' || state.autoChangedStatus ? true : false;
        return Promise.resolve({
          data: {
            entries: state.autoChangedStatus || status !== 'auto_changed' ? entries : [],
            pagination: { page: 1, limit: 50, total: entries.length, totalPages: 1 },
            filters: {
              status: status ?? 'all',
              decisionStatuses: true,
              autoRemovedStatus: true,
              autoChangedStatus: state.autoChangedStatus,
              statusApplied: applied,
            },
          },
        });
      },
    },
  };
});
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/knowledge-base/ConfluenceCatalogSection', () => ({
  ConfluenceCatalogSection: () => null,
}));
vi.mock('@/components/settings/DocumentationSettings', () => ({
  DocumentationSettings: () => null,
}));
vi.mock('@/components/messages/MessageSourceFilter', () => ({
  ALL_SOURCES: 'all',
  NO_SOURCE: 'none',
  MessageSourceFilter: () => null,
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/components/kb/KbConsolidationReview', () => ({ KbConsolidationReview: () => null }));
vi.mock('@/components/kb/KbQualityReview', () => ({ KbQualityReview: () => null }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/components/kb/KbExportButton', () => ({ KbExportButton: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');

const renderPage = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  state.autoChangedStatus = true;
  state.getAllCalls.length = 0;
  state.post.mockClear();
  state.patch.mockClear();
});

describe('knowledge base → one place to decide', () => {
  it('a deep link to an entry that is not on page 1 opens its decision', async () => {
    renderPage('/knowledge-base?status=suggested_change&id=42');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review merge' })).toBeInTheDocument()
    );
  });
});

describe('knowledge base → Changed automatically', () => {
  it('asks for status=auto_changed and says "in the last 90 days"', async () => {
    renderPage('/knowledge-base');
    const button = await screen.findByRole('button', { name: 'Changed automatically' });
    expect(button.getAttribute('title')).toMatch(/in the last 90 days/);
    fireEvent.click(button);
    await waitFor(() =>
      expect(state.getAllCalls.some((call) => call.status === 'auto_changed')).toBe(true)
    );
  });

  it('an undo_clean row offers "Undo clean-up", which posts the quality undo', async () => {
    renderPage('/knowledge-base?status=auto_changed');
    await screen.findAllByText('Customer-specific answer');
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo clean-up' })[0]);
    await waitFor(() =>
      expect(state.post).toHaveBeenCalledWith(
        '/api/knowledge-base/consolidation/quality/77/undo',
        {}
      )
    );
  });

  it('an older backend (no autoChangedStatus) falls back to "Removed automatically"', async () => {
    state.autoChangedStatus = false;
    renderPage('/knowledge-base?status=auto_changed');
    await waitFor(() =>
      expect(state.getAllCalls.some((call) => call.status === 'auto_removed')).toBe(true)
    );
    expect(
      await screen.findByRole('button', { name: 'Removed automatically' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changed automatically' })).toBeNull();
  });
});
