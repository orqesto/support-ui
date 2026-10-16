/** One Knowledge Base list, phase 1: the decision filters and the older-backend notice. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

const getAllCalls: Array<Record<string, unknown>> = [];
/**
 * Every backend echoes the requested status (an older one returns the UNFILTERED list for a status
 * it does not know); only a backend that applies the decision statuses sends `decisionStatuses`.
 */
let capable = true;
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
            filters: {
              status: params.status ?? 'all',
              ...(capable ? { decisionStatuses: true } : {}),
            },
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
const { KB_STATUS_IGNORED_NOTICE: NOTICE } = await import('@/components/kb/KbStatusIgnoredNotice');
const { CANNOT_DECIDE } = await import('@/components/kb/KbPendingDecisionBadge');
const entry = (over: Record<string, unknown>) => ({
  id: 10,
  title: 'Example entry',
  content: 'Example answer.',
  type: 'qa_pair',
  category: 'general',
  qualityScore: 0.9,
  usageCount: 0,
  approved: true,
  hidden: false,
  pendingDecision: null,
  otherPendingDecisions: 0,
  ...over,
});

beforeEach(() => {
  getAllCalls.length = 0;
  capable = true;
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

  it('an older backend (echoes the status, no capability flag): the notice replaces the unfiltered rows', async () => {
    capable = false;
    listEntries = [entry({ id: 21, title: 'Unfiltered row from an older server' })];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=suggested_change']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the review page' })).toHaveAttribute(
      'href',
      '/knowledge-base/merges'
    );
    expect(screen.queryByText('Unfiltered row from an older server')).toBeNull();
  });

  it('the capability flag present: the rows show and no notice', async () => {
    listEntries = [entry({ id: 22, title: 'Filtered row from a new server' })];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=suggested_change']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    expect((await screen.findAllByText('Filtered row from a new server')).length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('an older backend on an old status (approved) shows its rows, no notice', async () => {
    capable = false;
    listEntries = [entry({ id: 23, title: 'Approved row' })];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=approved']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    expect((await screen.findAllByText('Approved row')).length).toBeGreaterThan(0);
    expect(screen.queryByText(NOTICE)).toBeNull();
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
    capable = false;
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('No entries found');
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('while a KB-cases finding is open the notice stays off', async () => {
    capable = false;
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

  it('Suggested change: an entry also under a capture review offers Review for the merge the server leads with', async () => {
    // The BE leads the row with the filter's kind (the merge), the capture counted in "+1 more".
    listEntries = [
      entry({
        id: 24,
        approved: false,
        pendingDecision: { suggestionId: 79, kind: 'merge', reasons: [], canDecide: true },
        otherPendingDecisions: 1,
      }),
    ];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?status=suggested_change']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    const [review] = await screen.findAllByRole('button', { name: 'Review' });
    fireEvent.click(review);
    expect(screen.getByText(/dialog 79/)).toBeInTheDocument();
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
    expect((await screen.findAllByText(CANNOT_DECIDE)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  });
});
