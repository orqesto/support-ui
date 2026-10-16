/**
 * Owner, 2026-10-16: the knowledge base review (merges + quality fixes) "I can reach only via
 * notifications" — once the bell row clears there was no way back to it. The knowledge base page
 * now links to it for anyone who may review.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

let canManageKb = true;

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: () =>
        Promise.resolve({
          data: { entries: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } },
        }),
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
});

describe('knowledge base → review suggestions', () => {
  it('"Review suggestions" opens the merges and quality review', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Review suggestions' }));
    expect(await screen.findByText('merges review page')).toBeInTheDocument();
  });

  it('is not offered to someone who may not manage the knowledge base', async () => {
    canManageKb = false;
    renderPage();
    await screen.findByRole('heading', { name: 'Knowledge Base' });
    expect(screen.queryByRole('button', { name: 'Review suggestions' })).toBeNull();
  });
});
