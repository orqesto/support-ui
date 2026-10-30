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
  canReview: true,
  autoEntries: [] as unknown[],
  returnedEntries: [] as unknown[],
  toastError: vi.fn(),
  getAllCalls: [] as Array<{ status?: string; search?: string }>,
  post: vi.fn((..._args: unknown[]) => Promise.resolve({ data: {} as unknown })),
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

const autoRow = (id: number, title: string, autoChange: Record<string, unknown>, over = {}) => ({
  ...base,
  id,
  title,
  ...over,
  autoChange: { at: '2026-10-20T02:00:00.000Z', confidence: 0.9, ...autoChange },
});
const removedEntry = autoRow(
  60,
  'Removed answer',
  { action: 'remove', undo: 'restore', suggestionId: null },
  { approved: false, hidden: true, rejectedAt: '2026-10-19T02:00:00.000Z' }
);
const heldEntry = autoRow(
  61,
  'Held answer',
  { action: 'hold', undo: 'release_hold', suggestionId: 88 },
  { hidden: true }
);
const minedEntry = autoRow(62, 'Mined answer', {
  action: 'approveMined',
  undo: 'unapprove_mined',
  suggestionId: null,
});
const capturedEntry = autoRow(63, 'Saved answer', {
  action: 'approveCaptures',
  undo: 'return_to_review',
  suggestionId: 15,
});
const expiredCapture = {
  ...base,
  id: 70,
  title: 'Expired capture',
  approved: false,
  pendingDecision: {
    suggestionId: 99,
    kind: 'approve_capture',
    reasons: [],
    canDecide: true,
    expiresAt: '2026-10-01T00:00:00.000Z',
    expired: true,
  },
};

// useCurrentOrgCode reads react-query; these suites render without a QueryClientProvider.
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACM' }));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: state.toastError } }));
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
            ? state.autoEntries.length > 0
              ? state.autoEntries
              : [cleanedEntry]
            : status === 'needs_decision'
              ? [expiredCapture, ...state.returnedEntries]
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
  usePermissions: () => ({ hasPermission: () => state.canReview, isOrgAdmin: true }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/components/kb/KbExportButton', () => ({ KbExportButton: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');
const { isNewStatus } = await import('@/components/kb/KbStatusIgnoredNotice');

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
  state.canReview = true;
  state.autoEntries = [];
  state.returnedEntries = [];
  state.toastError.mockClear();
  state.post.mockImplementation(() => Promise.resolve({ data: {} }));
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

  it.each([
    ['Restore', removedEntry, 'post', '/api/knowledge-base/auto-actions/removed/60/restore'],
    ['Use it again', heldEntry, 'post', '/api/learning/suggestions/88/decline'],
    [
      'Un-approve',
      minedEntry,
      'post',
      '/api/knowledge-base/auto-actions/approved-mined/62/unapprove',
    ],
  ])('"%s" calls exactly its own route', async (label, entry, verb, url) => {
    state.autoEntries = [entry];
    renderPage('/knowledge-base?status=auto_changed');
    await screen.findAllByText(entry.title);
    fireEvent.click(screen.getAllByRole('button', { name: label })[0]);
    await waitFor(() => expect(state[verb as 'post' | 'patch']).toHaveBeenCalledTimes(1));
    expect(state[verb as 'post' | 'patch'].mock.calls[0][0]).toBe(url);
    const other = state[verb === 'post' ? 'patch' : 'post'];
    expect(other).not.toHaveBeenCalled();
  });

  it('every row says which automatic change it was', async () => {
    state.autoEntries = [removedEntry, heldEntry, cleanedEntry, minedEntry, capturedEntry];
    renderPage('/knowledge-base?status=auto_changed');
    await screen.findAllByText(capturedEntry.title);
    for (const label of [
      'Removed automatically',
      'Set aside automatically',
      'Personal details removed automatically',
      'Approved automatically (learned from mail)',
      'Approved automatically (saved by a person)',
    ])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('"Send back for review" calls the return route, not reject; the answer then waits under Needs your decision', async () => {
    state.autoEntries = [capturedEntry, minedEntry];
    state.post.mockImplementation((url: unknown) => {
      if (String(url).endsWith('/approved-captures/63/return')) {
        state.autoEntries = [minedEntry];
        state.returnedEntries = [{ ...base, id: 63, title: 'Saved answer', approved: false }];
      }
      return Promise.resolve({ data: {} });
    });
    renderPage('/knowledge-base?status=auto_changed');
    await screen.findAllByText(capturedEntry.title);
    fireEvent.click(screen.getAllByRole('button', { name: 'Send back for review' })[0]);
    await waitFor(() =>
      expect(state.post).toHaveBeenCalledWith(
        '/api/knowledge-base/auto-actions/approved-captures/63/return',
        {}
      )
    );
    expect(state.patch).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(capturedEntry.title)).toBeNull());
    // The mined approval keeps its own undo.
    expect(screen.getAllByRole('button', { name: 'Un-approve' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Needs your decision' }));
    expect((await screen.findAllByText('Saved answer')).length).toBeGreaterThan(0);
  });

  it('a 409 (already sent back) shows a plain message and refreshes the list', async () => {
    state.autoEntries = [capturedEntry];
    state.post.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('Request failed with status code 409'), { status: 409 })
      )
    );
    renderPage('/knowledge-base?status=auto_changed');
    await screen.findAllByText(capturedEntry.title);
    const callsBefore = state.getAllCalls.length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Send back for review' })[0]);
    await waitFor(() => expect(state.toastError).toHaveBeenCalled());
    expect(state.toastError.mock.calls[0][1]).toEqual({
      description: 'This answer changed since: it was sent back, or a person decided on it.',
    });
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(callsBefore));
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

describe('knowledge base → the automatic status filter waits for the backend', () => {
  it('offers neither automatic status until a list answer says which one this backend has', async () => {
    renderPage('/knowledge-base?status=approved');
    expect(screen.queryByRole('button', { name: 'Changed automatically' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Removed automatically' })).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'Changed automatically' })
    ).toBeInTheDocument();
  });

  it('an older backend: only "Removed automatically" ever appears, never "Changed automatically"', async () => {
    state.autoChangedStatus = false;
    renderPage('/knowledge-base?status=approved');
    expect(
      await screen.findByRole('button', { name: 'Removed automatically' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Changed automatically' })).toBeNull();
  });

  it('an older backend echoing an unapplied auto_changed gets the notice, not the unfiltered list', () => {
    expect(isNewStatus('auto_changed')).toBe(true);
  });
});

describe('knowledge base → expired capture and non-reviewers', () => {
  it('an expired capture is approved and rejected through the ENTRY endpoints only', async () => {
    renderPage('/knowledge-base?status=needs_decision');
    await screen.findAllByText('Expired capture');
    expect(screen.getAllByText('Expired — still waiting').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    await waitFor(() =>
      expect(state.patch).toHaveBeenCalledWith('/api/knowledge-base/entries/70/approve')
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);
    await waitFor(() =>
      expect(state.patch).toHaveBeenCalledWith('/api/knowledge-base/entries/70/reject')
    );
    const urls = [...state.post.mock.calls, ...state.patch.mock.calls].map((call) => call[0]);
    expect(urls.some((url) => String(url).includes('/api/learning/suggestions/'))).toBe(false);
  });

  it('a non-reviewer opening a suggested_change deep link: no lookup, no error, the entry opens', async () => {
    state.canReview = false;
    renderPage('/knowledge-base?status=suggested_change&id=42');
    expect(
      await screen.findByRole('heading', { name: 'Return address for Example Shop' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Entry Not Found')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review merge' })).toBeNull();
    expect(state.getAllCalls.every((call) => call.search === undefined)).toBe(true);
  });
});
