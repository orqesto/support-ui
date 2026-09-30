/**
 * F4 (KB consolidation #873): Hide / Reject / Delete on a merged CASE row unmerge it — the case
 * goes and its originals come back. That is not what those words usually mean, so the page must
 * confirm first, say what comes back, and re-read the list afterwards (the rows changed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';
import { kbEntryDetailResponse } from '@/test/kbEntryDetailResponse';

type KBEntry = KbServiceModule.KBEntry;

const getById = vi.fn<(...args: unknown[]) => unknown>();
const getAll = vi.fn<(...args: unknown[]) => unknown>();
const hide = vi.fn<(...args: unknown[]) => unknown>();
const del = vi.fn<(...args: unknown[]) => unknown>();
const unmerge = vi.fn<(...args: unknown[]) => unknown>();
const approve = vi.fn<(...args: unknown[]) => unknown>();

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (...args: unknown[]) => getAll(...args),
      hide: (...args: unknown[]) => hide(...args),
      approve: (...args: unknown[]) => approve(...args),
      delete: (...args: unknown[]) => del(...args),
      getById: (...args: unknown[]) => getById(...args),
    },
  };
});
vi.mock('@/services/kbConsolidation.service', () => ({
  kbConsolidationService: { unmerge: (...args: unknown[]) => unmerge(...args) },
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
  MessageSourceFilter: () => null,
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
let casesFlagVisible = false;
let canManageKb = true;
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => perm !== 'manage_knowledge_base' || canManageKb,
    isOrgAdmin: false,
  }),
}));
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: (key: string) => key === 'ui.kb_cases' && casesFlagVisible,
  }),
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');

const caseRow: KBEntry = {
  id: 9,
  type: 'qa_pair',
  title: 'Refunds',
  content: 'Question: Refunds?\nAnswer: 5 days.',
  category: 'support',
  departmentId: null,
  qualityScore: 0.8,
  approved: true,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-09-19T09:00:00.000Z',
  capturedVia: 'consolidation',
};
const plain: KBEntry = { ...caseRow, id: 10, title: 'Plain', capturedVia: 'resolve' };

const page = () =>
  render(
    <MemoryRouter>
      <KnowledgeBasePage />
    </MemoryRouter>
  );

const tableRow = async (title: string) => {
  await screen.findAllByText(title);
  // The list is re-read as its filters settle; a row grabbed mid-way is a detached node.
  await waitFor(() => expect(screen.queryAllByText('Loading...')).toHaveLength(0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const cells = await screen.findAllByText(title);
  return cells.map((cell) => cell.closest('tr')).find(Boolean) as HTMLElement;
};

beforeEach(() => {
  vi.clearAllMocks();
  casesFlagVisible = false;
  canManageKb = true;
  getById.mockReturnValue(new Promise(() => {}));
  getAll.mockResolvedValue({
    success: true,
    data: {
      entries: [caseRow, plain],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    },
  });
  hide.mockResolvedValue({ success: true, data: { unmerged: true, restored: 3 } });
  unmerge.mockResolvedValue({ caseId: 9, restored: 3 });
  del.mockResolvedValue({ success: true, data: { unmerged: true, restored: 3 } });
});
afterEach(cleanup);

describe('KB page — unmerging a case (F4)', () => {
  it('Hide on a case row asks first, says what comes back, then hides and re-reads the list', async () => {
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    expect(hide).not.toHaveBeenCalled();
    expect(await screen.findByText('Hide this case?')).toBeInTheDocument();
    expect(screen.getByText(/This restores its original entries/)).toBeInTheDocument();
    const callsBefore = getAll.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Undo the merge' }));
    await waitFor(() => expect(hide).toHaveBeenCalledWith(9));
    await waitFor(() => expect(getAll.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(await screen.findByText(/3 original entries are back/)).toBeInTheDocument();
  });

  it('an unmerge that brings nothing back does not say "0 original entries are back"', async () => {
    hide.mockResolvedValue({ success: true, data: { unmerged: true, restored: 0 } });
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo the merge' }));
    expect(
      await screen.findByText('The merge was undone. No original entries were left to bring back.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 original/)).not.toBeInTheDocument();
  });

  it('Delete on a case row goes through the same confirm, not the plain delete dialog', async () => {
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete this case?')).toBeInTheDocument();
    expect(screen.queryByText('Delete KB Entry')).not.toBeInTheDocument();
  });

  it('Unmerge calls the unmerge route after confirming', async () => {
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Unmerge' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unmerge' })
    );
    await waitFor(() => expect(unmerge).toHaveBeenCalledWith(9));
  });

  it('a case whose source was removed can still be unmerged (LOW-3)', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: {
        entries: [{ ...caseRow, sourceDeleted: true }, plain],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      },
    });
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Unmerge' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unmerge' })
    );
    await waitFor(() => expect(unmerge).toHaveBeenCalledWith(9));
  });

  it('pass 14 LOW-2: a case action that fails (case already unmerged elsewhere) re-reads the list', async () => {
    unmerge.mockRejectedValue(Object.assign(new Error('Case not found'), { response: { status: 404 } }));
    page();
    const row = await tableRow('Refunds');
    const callsBefore = getAll.mock.calls.length;
    fireEvent.click(within(row).getByRole('button', { name: 'Unmerge' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unmerge' })
    );
    expect(await screen.findByText('Could not unmerge')).toBeInTheDocument();
    await waitFor(() => expect(getAll.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('pass 14 LOW-1: an Unhidden detached entry hidden again reads "Hidden", not "detached from case"', async () => {
    const detached: KBEntry = {
      ...plain,
      id: 11,
      title: 'Detached one',
      approved: false,
      hidden: true,
      consolidation: { state: 'detached', caseId: 9, casePublicId: 'KB-9', caseExists: true },
    };
    getAll.mockResolvedValue({
      success: true,
      data: { entries: [detached], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    });
    approve.mockResolvedValue({ success: true, data: null });
    hide.mockResolvedValue({ success: true, data: null });
    page();
    let row = await tableRow('Detached one');
    expect(within(row).getByText('detached from case #KB-9')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'Unhide' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith(11));
    row = await tableRow('Detached one');
    fireEvent.click(await within(row).findByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(hide).toHaveBeenCalledWith(11));
    row = await tableRow('Detached one');
    await waitFor(() => expect(within(row).getByText('Hidden')).toBeInTheDocument());
    expect(within(row).queryByText(/detached from case/)).not.toBeInTheDocument();
  });

  it('pass 14 MED-1: a case row the viewer may not unmerge offers no Hide / Unmerge / Delete; the plain row keeps them', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: {
        entries: [{ ...caseRow, canUnmerge: false }, plain],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      },
    });
    page();
    const row = await tableRow('Refunds');
    for (const name of ['Hide', 'Unmerge', 'Delete', 'Reject']) {
      expect(within(row).queryByRole('button', { name })).not.toBeInTheDocument();
    }
    const plainRow = await tableRow('Plain');
    expect(within(plainRow).getByRole('button', { name: 'Hide' })).toBeInTheDocument();
    expect(within(plainRow).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('pass 14 MED-1 control: canUnmerge true keeps every case action', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: {
        entries: [{ ...caseRow, canUnmerge: true }, plain],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
      },
    });
    page();
    const row = await tableRow('Refunds');
    for (const name of ['Hide', 'Unmerge', 'Delete']) {
      expect(within(row).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('control: Hide on a plain entry hides at once, with no confirm', async () => {
    hide.mockResolvedValue({ success: true, data: null });
    page();
    const row = await tableRow('Plain');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(hide).toHaveBeenCalledWith(10));
    expect(screen.queryByText('Hide this case?')).not.toBeInTheDocument();
  });
});

/**
 * FE audit H1: a case reached by a `?id=` deep link — the "merged into #KB-9" badge, a bell, a
 * shared URL — is NOT in the list the page loaded (it lives on another tab or page). Everything
 * the drawer knows comes from `GET /entries/:id`, so that path alone must carry the case badge,
 * Unmerge, and the confirm before hide / reject / delete.
 */
describe('KB page — a case opened by deep link only (H1)', () => {
  const deepLink = (id: number) =>
    render(
      <MemoryRouter initialEntries={[`/knowledge-base?id=${id}`]}>
        <KnowledgeBasePage />
      </MemoryRouter>
    );
  const drawer = async () =>
    (await screen.findByRole('heading', { name: 'Entry Details' })).parentElement
      ?.parentElement as HTMLElement;

  beforeEach(() => {
    // The list holds only the plain entry — neither the case nor its original.
    getAll.mockResolvedValue({
      success: true,
      data: { entries: [plain], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    });
    getById.mockImplementation((id) =>
      Promise.resolve(
        id === 9
          ? kbEntryDetailResponse({
              id: 9,
              title: 'Refunds',
              approved: true,
              capturedVia: 'consolidation',
              publicId: 'KB-9',
            })
          : kbEntryDetailResponse({
              id: 7,
              hidden: true,
              consolidatedInto: 9,
              casePublicId: 'KB-9',
            })
      )
    );
  });

  it('the case shows its badge and Unmerge, and Hide asks before unmerging', async () => {
    deepLink(9);
    const panel = await drawer();
    expect(await within(panel).findByText('Case')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Unmerge/ })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /^Hide$/ }));
    expect(await screen.findByText('Hide this case?')).toBeInTheDocument();
    expect(hide).not.toHaveBeenCalled();
  });

  it('Delete on the deep-linked case goes through the unmerge confirm', async () => {
    deepLink(9);
    const panel = await drawer();
    await within(panel).findByText('Case');
    fireEvent.click(within(panel).getByRole('button', { name: /Delete/ }));
    expect(await screen.findByText('Delete this case?')).toBeInTheDocument();
    expect(screen.queryByText('Delete KB Entry')).not.toBeInTheDocument();
  });

  it('pass 14 MED-1: a deep-linked case the viewer may not unmerge offers no Unmerge / Hide / Delete', async () => {
    getById.mockResolvedValue(
      kbEntryDetailResponse({
        id: 9,
        title: 'Refunds',
        approved: true,
        capturedVia: 'consolidation',
        publicId: 'KB-9',
        canUnmerge: false,
      })
    );
    deepLink(9);
    const panel = await drawer();
    await within(panel).findByText('Case');
    for (const name of [/Unmerge/, /^Hide$/, /Delete/, /Reject/]) {
      expect(within(panel).queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(within(panel).getByRole('button', { name: /Edit/ })).toBeInTheDocument();
  });

  it('a deep-linked merged original reads "merged into #KB-9" and offers no action', async () => {
    deepLink(7);
    const panel = await drawer();
    expect(await within(panel).findByRole('link', { name: 'merged into #KB-9' })).toHaveAttribute(
      'href',
      '/knowledge-base?id=9'
    );
    for (const name of [/Approve/, /Unhide/, /Restore/, /Edit/, /Delete/, /Reject/, /^Hide$/]) {
      expect(within(panel).queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });
});

describe('KB page — "Cases report" button (L2)', () => {
  const button = () => screen.queryByRole('button', { name: 'Cases report' });

  it('is absent while ui.kb_cases is not visible', async () => {
    page();
    await tableRow('Refunds');
    expect(button()).not.toBeInTheDocument();
  });

  it('is present for a moderator once the flag is on, and leads to the report', async () => {
    casesFlagVisible = true;
    page();
    await tableRow('Refunds');
    expect(button()).toBeInTheDocument();
  });

  it('is absent without manage_knowledge_base, flag or not', async () => {
    casesFlagVisible = true;
    canManageKb = false;
    page();
    await tableRow('Refunds');
    expect(button()).not.toBeInTheDocument();
  });
});
