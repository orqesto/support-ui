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
/** The rows of page 2 (null or empty ⇒ one page); page 1 always lists `listEntries`. */
let secondPage: unknown[] | null = null;

// useCurrentOrgCode reads react-query; these suites render without a QueryClientProvider.
// KB engine Stage 1: the summary is not under test here; unknown opens Live answers.
vi.mock('@/components/kb/page/useKbEngineSummary', () => ({
  useKbEngineSummary: () => ({ summary: null, settled: true, nightlyOff: false }),
}));
// No real network calls: "Automatic actions" asks the backend whether its routes exist.
vi.mock('@/hooks/useAutoActionsAvailable', () => ({
  useAutoActionsAvailable: () => false,
  resetAutoActionsAvailability: () => undefined,
}));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACM' }));
vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: Record<string, unknown>) => {
        getAllCalls.push(params);
        if (failList) return Promise.reject(new Error('boom'));
        const page = Number(params.page ?? 1);
        const pages = secondPage?.length ? 2 : 1;
        const rows = page === 1 ? listEntries : page === 2 ? (secondPage ?? []) : [];
        const total = listEntries.length + (secondPage?.length ?? 0);
        return Promise.resolve({
          success: true,
          data: {
            entries: rows,
            pagination: { page, limit: 50, total, totalPages: pages },
            filters: {
              status: params.status ?? 'all',
              ...(capable ? { decisionStatuses: true } : {}),
              // What the real getAll derives from that flag for the status asked for.
              statusApplied:
                capable ||
                !['needs_decision', 'suggested_change', 'set_aside'].includes(
                  params.status as string
                ),
            },
          },
        });
      },
      approve: () => Promise.resolve({ success: true }),
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
    onClose: (decided: boolean) => void;
    onDecided: () => void;
  }) =>
    decision ? (
      <div role="dialog">
        dialog {decision.suggestionId}
        <button type="button" onClick={() => onClose(false)}>
          close dialog
        </button>
        <button type="button" onClick={onDecided}>
          decide in dialog
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
  secondPage = null;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}); // Pagination scrolls to the top
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Knowledge Base decision filters', () => {
  it('KB page has no Cases report button', async () => {
    render(
      <MemoryRouter initialEntries={['/knowledge-base']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Cases report' })).toBeNull();
  });

  it('approving a row under Needs your decision re-reads the list, so the decided row leaves it', async () => {
    listEntries = [
      entry({
        approved: false,
        pendingDecision: { suggestionId: 5, kind: 'approve_capture', reasons: [], canDecide: true },
      }),
    ];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    const [approve] = await screen.findAllByRole('button', { name: 'Approve' });
    const before = getAllCalls.length;
    fireEvent.click(approve);
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(before));
    expect(getAllCalls.at(-1)?.status).toBe('needs_decision');
  });

  it('asks the server for the status in the URL and shows no notice when it applied it', async () => {
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
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
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=suggested_change']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    expect(await screen.findByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the Questions view' })).toHaveAttribute(
      'href',
      '/knowledge-base?view=questions'
    );
    expect(screen.queryByText('Unfiltered row from an older server')).toBeNull();
  });

  it.each([
    // The review page lists no capture approvals: an older backend lists them as Pending entries.
    ['needs_decision', 'Show Not live yet entries', '/knowledge-base?status=pending'],
    ['set_aside', 'Open the Questions view', '/knowledge-base?view=questions'],
  ])(
    'an older backend under %s links to where it still lists those rows',
    async (status, linkName, href) => {
      capable = false;
      render(
        <MemoryRouter initialEntries={[`/knowledge-base?view=live&status=${status}`]}>
          <KnowledgeBasePage />
        </MemoryRouter>
      );
      expect(await screen.findByText(NOTICE)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: linkName })).toHaveAttribute('href', href);
      expect(screen.queryByRole('link', { name: 'Open the review page' })).toBeNull();
    }
  );

  it('the capability flag present: the rows show and no notice', async () => {
    listEntries = [entry({ id: 22, title: 'Filtered row from a new server' })];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=suggested_change']}>
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

  it('opening and clicking filters a new backend applies never flashes the notice', async () => {
    // Watched from the FIRST render: before any answer there is no capability flag to read, and
    // that is the moment a notice keyed on the flag alone would flash. (A later click cannot catch
    // it: a new backend's previous answer already carries the flag.)
    const seen: boolean[] = [];
    const { container } = render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    seen.push(container.textContent?.includes(NOTICE) ?? false);
    const observer = new MutationObserver(() =>
      seen.push(container.textContent?.includes(NOTICE) ?? false)
    );
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    await screen.findAllByText('No entries found');
    const before = getAllCalls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Skipped by the engine' }));
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
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
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
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
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
          '/knowledge-base?view=live&status=needs_decision&finding=raw_email&departmentId=3#qa_pair',
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
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
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
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=suggested_change']}>
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
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    expect((await screen.findAllByText(CANNOT_DECIDE)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
  });

  it('deciding the only row of the last page re-reads the page before it, not an empty page', async () => {
    listEntries = [entry({ id: 30, title: 'First page row' })];
    secondPage = [
      entry({
        id: 31,
        title: 'Last page row',
        pendingDecision: { suggestionId: 81, kind: 'rewrite', reasons: [], canDecide: true },
      }),
    ];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=suggested_change']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('First page row');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Review' }))[0]);
    secondPage = []; // the decision empties the last page
    const before = getAllCalls.length;
    fireEvent.click(screen.getByRole('button', { name: 'decide in dialog' }));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(before));
    expect(getAllCalls.at(-1)).toMatchObject({ page: 1, status: 'suggested_change' });
  });

  it('bulk-approving every row of the last page re-reads the page before it', async () => {
    const capture = (id: number) =>
      entry({
        id,
        title: `Saved answer ${id}`,
        approved: false,
        pendingDecision: {
          suggestionId: id + 100,
          kind: 'approve_capture',
          reasons: [],
          canDecide: true,
        },
      });
    listEntries = [capture(40)];
    secondPage = [capture(41), capture(42)];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('Saved answer 40');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(await screen.findByLabelText('Select all (2)'));
    secondPage = [];
    const before = getAllCalls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Approve selected (2)' }));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(before));
    expect(getAllCalls.at(-1)).toMatchObject({ page: 1, status: 'needs_decision' });
  });

  it('a decided row that stays listed keeps the page (no jump back)', async () => {
    listEntries = [entry({ id: 32, title: 'First page row' })];
    secondPage = [
      entry({
        id: 33,
        title: 'Still listed row',
        pendingDecision: { suggestionId: 82, kind: 'rewrite', reasons: [], canDecide: true },
        otherPendingDecisions: 1,
      }),
    ];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=suggested_change']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('First page row');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Review' }))[0]);
    const before = getAllCalls.length;
    fireEvent.click(screen.getByRole('button', { name: 'decide in dialog' }));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(before));
    expect(getAllCalls.slice(before).map((call) => call.page)).toEqual([2]);
    expect(await screen.findAllByText('Still listed row')).not.toHaveLength(0);
  });

  it('approving the only row of the last page from its row button shows the page before it', async () => {
    listEntries = [entry({ id: 34, title: 'First page answer', approved: false })];
    secondPage = [
      entry({
        id: 35,
        title: 'Last page answer',
        approved: false,
        pendingDecision: {
          suggestionId: 83,
          kind: 'approve_capture',
          reasons: [],
          canDecide: true,
        },
      }),
    ];
    render(
      <MemoryRouter initialEntries={['/knowledge-base?view=live&status=needs_decision']}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
    await screen.findAllByText('First page answer');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findAllByText('Last page answer');
    const before = getAllCalls.length;
    secondPage = [];
    fireEvent.click((await screen.findAllByRole('button', { name: 'Approve' }))[0]);
    await waitFor(() => expect(getAllCalls.at(-1)?.page).toBe(1));
    expect(getAllCalls.slice(before).map((call) => call.page)).toEqual([2, 1]);
    expect(await screen.findAllByText('First page answer')).not.toHaveLength(0);
  });
});
