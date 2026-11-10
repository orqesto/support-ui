/**
 * A merged case's originals, named before and after it is split up: the confirm of Hide / Reject /
 * Delete / Unmerge on a case row lists the entries that come back (read when it opens), and the
 * outcome names the entries that came back. Without either (an older backend, a failed read) the
 * page keeps its generic text. Same page setup as KnowledgeBaseCaseUnmerge.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/features/kb';

type KBEntry = KbServiceModule.KBEntry;

const getById = vi.fn<(...args: unknown[]) => unknown>();
const getAll = vi.fn<(...args: unknown[]) => unknown>();
const hide = vi.fn<(...args: unknown[]) => unknown>();
const del = vi.fn<(...args: unknown[]) => unknown>();
const unmerge = vi.fn<(...args: unknown[]) => unknown>();
const getCaseOriginals = vi.fn<(...args: unknown[]) => unknown>();
const approve = vi.fn<(...args: unknown[]) => unknown>();
const unhide = vi.fn<(...args: unknown[]) => unknown>();
const toastCalls: Array<{ kind: string; message: string }> = [];
// useCurrentOrgCode reads react-query; these suites render without a QueryClientProvider.
// KB engine Stage 1: the summary is not under test here; unknown opens Live answers.
vi.mock('@/features/kb/components/page/useKbEngineSummary', () => ({
  useKbEngineSummary: () => ({ summary: null, settled: true, nightlyOff: false }),
}));
// No real network calls: "Automatic actions" asks the backend whether its routes exist.
vi.mock('@/features/kb/hooks/useAutoActionsAvailable', () => ({
  useAutoActionsAvailable: () => false,
  resetAutoActionsAvailability: () => undefined,
}));
vi.mock('@/features/kb/components/KbExportButton', () => ({ KbExportButton: () => null }));
vi.mock('@/hooks/useCurrentOrgCode', () => ({ useCurrentOrgCode: () => 'ACM' }));
vi.mock('@/lib/toast', () => ({
  toast: Object.fromEntries(
    ['success', 'info', 'warning', 'error'].map((kind) => [
      kind,
      (message: string) => toastCalls.push({ kind, message }),
    ])
  ),
}));

vi.mock('@/features/kb/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (...args: unknown[]) => getAll(...args),
      hide: (...args: unknown[]) => hide(...args),
      approve: (...args: unknown[]) => approve(...args),
      unhide: (...args: unknown[]) => unhide(...args),
      delete: (...args: unknown[]) => del(...args),
      getById: (...args: unknown[]) => getById(...args),
    },
  };
});
vi.mock('@/features/kb/services/kbConsolidation.service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    kbConsolidationService: {
      unmerge: (...args: unknown[]) => unmerge(...args),
      getCaseOriginals: (...args: unknown[]) => getCaseOriginals(...args),
    },
  };
});
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/kb/components/ConfluenceCatalogSection', () => ({
  ConfluenceCatalogSection: () => null,
}));
vi.mock('@/features/settings/components/DocumentationSettings', () => ({
  DocumentationSettings: () => null,
}));
vi.mock('@/components/shared/MessageSourceFilter', () => ({
  ALL_SOURCES: 'all',
  NO_SOURCE: 'none',
  MessageSourceFilter: () => null,
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
let canManageKb = true;
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (perm: string) => perm !== 'manage_knowledge_base' || canManageKb,
    isOrgAdmin: false,
  }),
}));
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({
    isSurfaceVisibleToMe: () => false,
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
  toastCalls.length = 0;
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
  // A backend without the originals route: the confirm keeps its generic text.
  getCaseOriginals.mockResolvedValue(null);
  del.mockResolvedValue({ success: true, data: { unmerged: true, restored: 3 } });
});
afterEach(cleanup);

describe('KB page — naming the entries a case gives back', () => {
  const originals = {
    caseId: 9,
    casePublicId: 'KB-9',
    originals: [
      { id: 21, publicId: 'KB-21', title: 'Refund window', approved: true, hidden: true },
      { id: 22, publicId: null, title: 'Return label', approved: false, hidden: true },
    ],
  };

  it('the confirm lists the originals that come back, and which go back live', async () => {
    getCaseOriginals.mockResolvedValue(originals);
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    const dialog = await screen.findByRole('dialog');
    const list = await within(dialog).findByRole('list', { name: 'Entries that come back' });
    expect(getCaseOriginals).toHaveBeenCalledWith(9);
    expect(within(dialog).getByText(/This restores 2 original entries/)).toBeInTheDocument();
    const items = within(list).getAllByRole('listitem').map((item) => item.textContent);
    expect(items).toEqual(['#KB-21 Refund window — goes back live', '#22 Return label']);
  });

  it('a failed read of the originals keeps the generic confirm text', async () => {
    getCaseOriginals.mockRejectedValue(Object.assign(new Error('Server error'), { status: 500 }));
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(getCaseOriginals).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(within(dialog).getByText(/This restores its original entries/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument();
  });

  it('a late answer for an earlier opening never shows in a newer confirm', async () => {
    let answerFirst: (value: unknown) => void = () => {};
    getCaseOriginals
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockReturnValue(new Promise(() => {}));
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    answerFirst(originals);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(within(dialog).getByText(/This restores its original entries/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Refund window/)).not.toBeInTheDocument();
  });

  it('the outcome names the entries that came back', async () => {
    hide.mockResolvedValue({
      success: true,
      data: {
        unmerged: true,
        restored: 2,
        restoredEntries: [
          { id: 21, publicId: 'KB-21', title: 'Refund window' },
          { id: 22, publicId: null, title: 'Return label' },
        ],
      },
    });
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo the merge' }));
    const text = await screen.findByText(/2 original entries are back in the knowledge base:/);
    expect(text.textContent).toBe(
      '2 original entries are back in the knowledge base:\n#KB-21 Refund window\n#22 Return label\nSearch a number to open it.'
    );
  });

  it('Unmerge names them too (the unmerge route sends restoredEntries)', async () => {
    unmerge.mockResolvedValue({
      caseId: 9,
      restored: 1,
      restoredEntries: [{ id: 21, publicId: 'KB-21', title: 'Refund window' }],
    });
    page();
    const row = await tableRow('Refunds');
    fireEvent.click(within(row).getByRole('button', { name: 'Unmerge' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unmerge' })
    );
    expect(await screen.findByText(/1 original entry is back[^]*#KB-21 Refund window/)).toBeInTheDocument();
  });
});
