/**
 * Knowledge base → "Removed automatically" status filter (`status=auto_removed`). Reviewer-only like
 * the other review filters; its rows' Restore goes through the Automatic actions restore route (put
 * back as it was), never Approve. A backend that does not apply the filter (no
 * `filters.autoRemovedStatus`) would return the whole knowledge base, so no rows are shown then.
 * All data is invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

const state = vi.hoisted(() => ({
  canManageKb: true,
  autoRemovedStatus: true,
  getAllCalls: [] as Array<{ status?: string }>,
  restore: vi.fn(() => Promise.resolve()),
  approve: vi.fn(() => Promise.resolve({ success: true })),
}));

const removedEntry = {
  id: 314,
  type: 'qa_pair',
  title: 'Where do I send a return to Example Shop?',
  content: 'Use the old address.',
  category: 'returns',
  departmentId: null,
  qualityScore: 0.4,
  approved: false,
  approvedBy: null,
  hidden: true,
  rejectedAt: '2026-10-19T02:00:00.000Z',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-10-19T02:00:00.000Z',
};

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      approve: state.approve,
      getAll: (params: { status?: string }) => {
        state.getAllCalls.push(params);
        return Promise.resolve({
          data: {
            entries: params.status === 'auto_removed' ? [removedEntry] : [],
            pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
            filters: {
              status: params.status ?? 'all',
              decisionStatuses: true,
              autoRemovedStatus: state.autoRemovedStatus,
              // What the real getAll derives (kbPendingDecision.test covers that derivation).
              statusApplied: params.status !== 'auto_removed' || state.autoRemovedStatus,
            },
          },
        });
      },
    },
  };
});
vi.mock('@/services/kbAutoActions.service', () => ({
  kbAutoActionsService: { restore: state.restore, getOverview: () => Promise.resolve({}) },
}));
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
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: () => state.canManageKb,
    isOrgAdmin: state.canManageKb,
  }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/components/kb/KbExportButton', () => ({ KbExportButton: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');

const renderPage = (url = '/knowledge-base') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  state.canManageKb = true;
  state.autoRemovedStatus = true;
  state.getAllCalls.length = 0;
  state.restore.mockClear();
  state.approve.mockClear();
});

describe('knowledge base → Removed automatically', () => {
  it('an old link (?status=auto_removed) still asks the list for it and shows it pressed', async () => {
    renderPage('/knowledge-base?status=auto_removed');
    await waitFor(() =>
      expect(state.getAllCalls.some((call) => call.status === 'auto_removed')).toBe(true)
    );
    expect(await screen.findByRole('button', { name: 'Removed automatically' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('is not offered to someone who may not review', async () => {
    state.canManageKb = false;
    renderPage();
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Removed automatically' })).toBeNull();
  });

  it("a row's Restore undoes the automatic removal, not an Approve, and re-reads the list", async () => {
    renderPage('/knowledge-base?status=auto_removed');
    expect(
      (await screen.findAllByText('Where do I send a return to Example Shop?')).length
    ).toBeGreaterThan(0);
    const reads = state.getAllCalls.length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]);
    await waitFor(() => expect(state.restore).toHaveBeenCalledWith(314));
    expect(state.approve).not.toHaveBeenCalled();
    await waitFor(() => expect(state.getAllCalls.length).toBeGreaterThan(reads));
  });

  it('a double click sends one restore; Restore is disabled while it runs', async () => {
    let finish: () => void = () => {};
    state.restore.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    renderPage('/knowledge-base?status=auto_removed');
    await screen.findAllByText('Where do I send a return to Example Shop?');
    const [button] = screen.getAllByRole('button', { name: 'Restore' });
    fireEvent.click(button);
    fireEvent.click(button);
    // Every view of the row (table and mobile card) is disabled while the call runs.
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button', { name: 'Restore' })
          .every((each) => each.hasAttribute('disabled'))
      ).toBe(true)
    );
    expect(state.restore).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Restore' })[0]).toBeEnabled()
    );
    expect(state.restore).toHaveBeenCalledTimes(1);
  });

  it('rows of a response that ignored the status say Approve again (Approve), never Restore', async () => {
    // A finding list shows its rows even when the status was not applied: the row must not offer
    // an automatic-removal restore the server never vouched for.
    state.autoRemovedStatus = false;
    renderPage('/knowledge-base?status=auto_removed&finding=raw_email&departmentId=3');
    await screen.findAllByText('Where do I send a return to Example Shop?');
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve again' })[0]);
    await waitFor(() => expect(state.approve).toHaveBeenCalledWith(314));
    expect(state.restore).not.toHaveBeenCalled();
  });

  it('a backend that ignores the filter shows a notice and a link, never the whole list', async () => {
    state.autoRemovedStatus = false;
    renderPage('/knowledge-base?status=auto_removed');
    expect(await screen.findByText('This server cannot filter by this yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Automatic actions' })).toHaveAttribute(
      'href',
      '/settings#ai/automatic-actions'
    );
    expect(screen.queryByText('Where do I send a return to Example Shop?')).toBeNull();
  });
});
