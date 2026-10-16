/** One Knowledge Base list, phase 1: the decision filters and the older-backend notice. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

const getAllCalls: Array<Record<string, unknown>> = [];
/** What the mocked list echoes as the applied status: a new BE echoes the request, an old one 'all'. */
let echo: 'request' | 'all' = 'request';

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: Record<string, unknown>) => {
        getAllCalls.push(params);
        return Promise.resolve({
          success: true,
          data: {
            entries: [],
            pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
            filters: { status: echo === 'request' ? (params.status ?? 'all') : 'all' },
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
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/components/kb/KbRunNow', () => ({ KbRunNow: () => null }));
vi.mock('@/components/kb/KbExportButton', () => ({ KbExportButton: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 3, name: 'Support' }] }),
  useDepartmentById: () => undefined,
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');
const NOTICE = 'This server cannot filter by this yet — showing every entry.';

beforeEach(() => {
  getAllCalls.length = 0;
  echo = 'request';
});
afterEach(cleanup);

describe('Knowledge Base decision filters', () => {
  it('asks the server for the status in the URL and shows no notice when it applied it', async () => {
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(0));
    expect(getAllCalls[getAllCalls.length - 1]).toMatchObject({ status: 'needs_decision' });
    expect((await screen.findAllByText('No entries found')).length).toBeGreaterThan(0);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('an older backend echoes "all": say so instead of passing the full list off as filtered', async () => {
    echo = 'all';
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
  });
});
