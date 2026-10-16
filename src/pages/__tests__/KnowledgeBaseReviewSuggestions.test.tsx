/**
 * Owner, 2026-10-16: the knowledge base review (merges + quality fixes) "I can reach only via
 * notifications" — once the bell row clears there was no way back to it. The knowledge base page
 * now links to it for anyone who may review.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/knowledge-base']}>
      <Routes>
        <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
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

  it('is not offered to someone who may not manage the knowledge base', async () => {
    canManageKb = false;
    renderPage();
    await screen.findByRole('heading', { name: 'Knowledge Base' });
    expect(screen.queryByRole('button', { name: 'Review suggestions' })).toBeNull();
  });
});
