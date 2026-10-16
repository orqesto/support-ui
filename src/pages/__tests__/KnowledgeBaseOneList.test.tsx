/** One Knowledge Base list, phase 1: the decision filters and the older-backend notice. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

const getAllCalls: Array<Record<string, unknown>> = [];
/** What the mocked list echoes as the applied status: a new BE echoes the request, an old one 'all'. */
let echo: 'request' | 'all' = 'request';
let failList = false;
let canReview = true;
let listEntries: unknown[] = [];

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: Record<string, unknown>) => {
        getAllCalls.push(params);
        if (failList) return Promise.reject(new Error('boom'));
        return Promise.resolve({
          success: true,
          data: {
            entries: listEntries,
            pagination: { page: 1, limit: 50, total: listEntries.length, totalPages: 1 },
            filters: { status: echo === 'request' ? (params.status ?? 'all') : 'all' },
          },
        });
      },
    },
  };
});
vi.mock('@/components/kb/KbDecisionDialog', () => ({
  KbDecisionDialog: ({
    decision,
    onClose,
    onDecided,
  }: {
    decision: { suggestionId: number } | null;
    onClose: () => void;
    onDecided: () => void;
  }) =>
    decision ? (
      <div role="dialog">
        dialog {decision.suggestionId}
        <button type="button" onClick={() => (onClose(), onDecided())}>
          close dialog
        </button>
      </div>
    ) : null,
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
  usePermissions: () => ({ hasPermission: () => canReview, isOrgAdmin: true }),
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
  failList = false;
  canReview = true;
  listEntries = [];
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

  it('clicking a filter a new backend applies never flashes the notice', async () => {
    const seen: boolean[] = [];
    const { container } = render(
      <MemoryRouter initialEntries={['/knowledge-base?status=approved']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('No entries found');
    const observer = new MutationObserver(() =>
      seen.push(container.textContent?.includes(NOTICE) ?? false)
    );
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    const before = getAllCalls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Set aside' }));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(before));
    await screen.findAllByText('No entries found');
    await waitFor(() =>
      expect(getAllCalls[getAllCalls.length - 1]).toMatchObject({ status: 'set_aside' })
    );
    observer.disconnect();
    expect(seen).not.toContain(true);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('a failed fetch does not blame the server', async () => {
    failList = true;
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(0));
    expect(await screen.findByText('Failed to Load')).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('a non-reviewer (server caps to approved) gets no notice', async () => {
    canReview = false;
    echo = 'all';
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('No entries found');
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('while a KB-cases finding is open the notice stays off', async () => {
    echo = 'all';
    render(
      <MemoryRouter
        initialEntries={[
          '/knowledge-base?status=needs_decision&finding=raw_email&departmentId=3#qa_pair',
        ]}
      >
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('No entries found');
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('a removal suggestion offers Review; closing the dialog refetches the list', async () => {
    listEntries = [
      {
        id: 11,
        title: 'Reset a password',
        content: 'Use the reset link.',
        type: 'qa_pair',
        category: 'general',
        qualityScore: 0.9,
        usageCount: 0,
        approved: true,
        hidden: false,
        pendingDecision: { suggestionId: 77, kind: 'remove', reasons: [], canDecide: true },
        otherPendingDecisions: 0,
      },
    ];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    const [review] = await screen.findAllByRole('button', { name: 'Review' });
    const before = getAllCalls.length;
    fireEvent.click(review);
    expect(screen.getByText(/dialog 77/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close dialog' }));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(before));
    expect(screen.queryByText(/dialog 77/)).toBeNull();
  });

  it('offers no Review when the viewer cannot decide', async () => {
    listEntries = [
      {
        id: 12,
        title: 'Refund window',
        content: 'Thirty days.',
        type: 'qa_pair',
        category: 'general',
        qualityScore: 0.9,
        usageCount: 0,
        approved: true,
        hidden: false,
        pendingDecision: { suggestionId: 78, kind: 'merge', reasons: [], canDecide: false },
        otherPendingDecisions: 0,
      },
    ];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    expect(
      (await screen.findAllByText('Only a workspace admin can decide this')).length
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  });
});
