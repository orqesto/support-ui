/**
 * F4 (KB consolidation #873): Hide / Reject / Delete on a merged CASE row unmerge it — the case
 * goes and its originals come back. That is not what those words usually mean, so the page must
 * confirm first, say what comes back, and re-read the list afterwards (the rows changed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';

type KBEntry = KbServiceModule.KBEntry;

const getAll = vi.fn<(...args: unknown[]) => unknown>();
const hide = vi.fn<(...args: unknown[]) => unknown>();
const del = vi.fn<(...args: unknown[]) => unknown>();
const unmerge = vi.fn<(...args: unknown[]) => unknown>();

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (...args: unknown[]) => getAll(...args),
      hide: (...args: unknown[]) => hide(...args),
      delete: (...args: unknown[]) => del(...args),
      getById: () => new Promise(() => {}),
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
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: false }),
}));
vi.mock('@/hooks/useUiFlags', () => ({
  useUiFlags: () => ({ isSurfaceVisibleToMe: () => false }),
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

  it('control: Hide on a plain entry hides at once, with no confirm', async () => {
    hide.mockResolvedValue({ success: true, data: null });
    page();
    const row = await tableRow('Plain');
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(hide).toHaveBeenCalledWith(10));
    expect(screen.queryByText('Hide this case?')).not.toBeInTheDocument();
  });
});
