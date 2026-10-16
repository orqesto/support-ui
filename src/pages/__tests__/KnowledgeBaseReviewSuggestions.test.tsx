/**
 * Owner, 2026-10-16: the knowledge base review (merges + quality fixes) "I can reach only via
 * notifications" — once the bell row clears there was no way back to it. The knowledge base page
 * now links to it for anyone who may review.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

let canManageKb = true;
const getAllCalls: Array<{ status?: string }> = [];

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: { status?: string }) => {
        getAllCalls.push(params);
        return Promise.resolve({
          data: { entries: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } },
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
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => canManageKb, isOrgAdmin: canManageKb }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/components/kb/KbExportButton', () => ({ KbExportButton: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [] }),
  useDepartmentById: () => undefined,
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');

const Probe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="search">{location.search}</output>
      <button
        type="button"
        onClick={() => navigate('/knowledge-base?status=needs_decision&keep=1')}
      >
        probe: go
      </button>
    </>
  );
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/knowledge-base']}>
      <Routes>
        <Route
          path="/knowledge-base"
          element={
            <>
              <KnowledgeBasePage />
              <Probe />
            </>
          }
        />
        <Route path="/knowledge-base/merges" element={<p>merges review page</p>} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  canManageKb = true;
  getAllCalls.length = 0;
});

describe('knowledge base → review suggestions', () => {
  it('"Review suggestions" filters this list to suggested changes instead of leaving the page', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Review suggestions' }));
    await waitFor(() =>
      expect(getAllCalls.some((call) => call.status === 'suggested_change')).toBe(true)
    );
    expect(screen.queryByText('merges review page')).toBeNull();
  });

  it('a link to ?status= while the page is open refetches with it and shows it selected', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'probe: go' }));
    await waitFor(() =>
      expect(getAllCalls.some((call) => call.status === 'needs_decision')).toBe(true)
    );
    expect(screen.getByRole('button', { name: 'Needs your decision' })).toBeInTheDocument();
  });

  it('picking a filter writes ?status= and keeps the other params', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'probe: go' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set aside' }));
    await waitFor(() =>
      expect(screen.getByTestId('search').textContent).toBe('?status=set_aside&keep=1')
    );
    fireEvent.click(screen.getByText('All', { selector: 'button:not([title])' }));
    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe('?keep=1'));
  });

  it('is not offered to someone who may not manage the knowledge base', async () => {
    canManageKb = false;
    renderPage();
    await screen.findByRole('heading', { name: 'Knowledge Base' });
    expect(screen.queryByRole('button', { name: 'Review suggestions' })).toBeNull();
  });
});
