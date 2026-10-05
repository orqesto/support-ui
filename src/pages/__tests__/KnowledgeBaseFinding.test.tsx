/**
 * Owner, 2026-10-05: "when I click on 'clean up' and 'KB review' it just open all kb items, but I
 * assume it should open specific lists". A finding now links to the knowledge base narrowed to the
 * entries it counted (the backend resolves them from the report itself), says so, and lets the
 * person leave that view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as KbServiceModule from '@/services/kb.service';
import type { KbCasesFindings } from '@/services/kbConsolidation.service';

const getAllCalls: Array<Record<string, unknown>> = [];
let total = 2;
/** new: echoes the finding it applied (BE with the filter) · old: ignores it · error: fails. */
let backend: 'new' | 'old' | 'error' = 'new';
const rawEntry: KbServiceModule.KBEntry = {
  id: 41,
  type: 'qa_pair',
  title: 'Raw one',
  content: 'Question: Hi Bob, see below\nAnswer: thanks',
  category: 'support',
  departmentId: null,
  qualityScore: 0.8,
  approved: true,
  hidden: false,
  usageCount: 0,
  createdAt: '2026-10-05T09:00:00.000Z',
  capturedVia: 'resolve',
};
let entries: KbServiceModule.KBEntry[] = [];
/** When set, every list request waits here until the test answers it. */
let held: Array<() => void> | null = null;
/** The page the list answers with (the page it was asked for when null). */
let answerPage: number | null = null;
const hidden: number[] = [];

vi.mock('@/services/kb.service', async (importOriginal) => {
  const actual = await importOriginal<typeof KbServiceModule>();
  return {
    ...actual,
    kbService: {
      ...actual.kbService,
      getAll: (params: Record<string, unknown>) => {
        getAllCalls.push(params);
        if (backend === 'error') return Promise.reject(new Error('Department not found'));
        if (held) {
          const queue = held;
          const snapshot = { ...params };
          return new Promise((resolve) => {
            queue.push(() =>
              resolve({
                data: {
                  entries: [],
                  pagination: { page: 1, limit: 50, total, totalPages: 1 },
                  filters: { finding: snapshot.finding ?? null },
                },
              })
            );
          });
        }
        const page = answerPage ?? (params.page as number | undefined) ?? 1;
        const data = { entries, pagination: { page, limit: 50, total, totalPages: page } };
        return Promise.resolve({
          data:
            backend === 'new' ? { ...data, filters: { finding: params.finding ?? null } } : data,
        });
      },
      hide: (id: number) => {
        hidden.push(id);
        return Promise.resolve({ success: true, data: {} });
      },
      approve: (id: number) => {
        hidden.push(id);
        // As the backend does while the entry's KB review is still open (another entry of it is
        // undecided): the entry is approved and stays in the finding's list.
        entries = entries.map((entry) => (entry.id === id ? { ...entry, approved: true } : entry));
        return Promise.resolve({ success: true, data: {} });
      },
      reject: (id: number) => {
        hidden.push(id);
        return Promise.resolve({ success: true, data: { rejectedAt: '2026-10-05T10:00:00Z' } });
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
  MessageSourceFilter: () => null,
}));
vi.mock('@/components/admin/DepartmentBadge', () => ({ default: () => null }));
vi.mock('@/hooks/useDepartmentContextKey', () => ({ useDepartmentContextKey: () => '' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true, isOrgAdmin: true }),
}));
vi.mock('@/hooks/useUiFlags', () => ({ useUiFlags: () => ({ isSurfaceVisibleToMe: () => true }) }));
vi.mock('@/components/kb/KbRunNow', () => ({ KbRunNow: () => null }));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 3, name: 'Support' }] }),
  useDepartmentById: (id: number | null | undefined) =>
    id === 3 ? { id: 3, name: 'Support' } : undefined,
}));

const { KnowledgeBasePage } = await import('../KnowledgeBasePage');
const { KbCasesFindingsPanel } = await import('../KbCasesPage');
const { kbFindingFromSearch, kbFindingHref, withoutKbFinding } = await import('@/lib/kbFinding');

const findings = (overrides: Partial<KbCasesFindings> = {}): KbCasesFindings => ({
  rawEmails: 48,
  judgedCustomerSpecific: 0,
  couldNotClassify: 0,
  awaitingKbReview: 19,
  noClearLanguage: 0,
  detached: 0,
  possibleDuplicates: [],
  ...overrides,
});

const lastCall = () => getAllCalls[getAllCalls.length - 1];

beforeEach(() => {
  getAllCalls.length = 0;
  total = 2;
  backend = 'new';
  entries = [];
  answerPage = null;
  held = null;
  hidden.length = 0;
});
afterEach(cleanup);

describe('KB cases findings link to their own lists', () => {
  it('"clean up" and "KB review" open the finding, for the report department', () => {
    render(
      <MemoryRouter>
        <KbCasesFindingsPanel findings={findings()} departmentId={3} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'clean up' }).getAttribute('href')).toBe(
      '/knowledge-base?finding=raw_email&departmentId=3#qa_pair'
    );
    expect(screen.getByRole('link', { name: 'KB review' }).getAttribute('href')).toBe(
      '/knowledge-base?finding=awaiting_review&departmentId=3#qa_pair'
    );
  });

  it('without a department there is no list to open, so no link — never one to every entry', () => {
    render(
      <MemoryRouter>
        <KbCasesFindingsPanel findings={findings()} />
      </MemoryRouter>
    );
    expect(screen.getByText(/clean up/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'clean up' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'KB review' })).toBeNull();
  });
});

describe('kbFinding URL helpers', () => {
  it('reads a finding only with a valid department, and removes both', () => {
    expect(kbFindingFromSearch(new URLSearchParams('finding=raw_email&departmentId=3'))).toEqual({
      finding: 'raw_email',
      departmentId: 3,
    });
    expect(kbFindingFromSearch(new URLSearchParams('finding=raw_email'))).toBeNull();
    expect(
      kbFindingFromSearch(new URLSearchParams('finding=everything&departmentId=3'))
    ).toBeNull();
    expect(
      kbFindingFromSearch(new URLSearchParams('finding=raw_email&departmentId=-1'))
    ).toBeNull();
    expect(withoutKbFinding(new URLSearchParams('finding=raw_email&departmentId=3&id=9'))).toBe(
      'id=9'
    );
    expect(kbFindingHref('awaiting_review', 5)).toBe(
      '/knowledge-base?finding=awaiting_review&departmentId=5#qa_pair'
    );
  });
});

describe('Knowledge base list narrowed to a finding', () => {
  const renderAt = (url: string) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
        </Routes>
      </MemoryRouter>
    );

  it('asks the backend for that finding only, and says what the list is', async () => {
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ finding: 'raw_email', departmentId: 3, type: 'qa_pair' })
    );
    expect(
      await screen.findByText('Learned entries that are raw emails, not questions in Support (2)')
    ).toBeTruthy();
  });

  it('"Show all entries" leaves the finding: the next request has none and the banner goes', async () => {
    renderAt('/knowledge-base?finding=awaiting_review&departmentId=3#qa_pair');
    await screen.findByText('Entries awaiting a KB review in Support (2)');
    fireEvent.click(screen.getByRole('button', { name: 'Show all entries' }));
    await waitFor(() => expect(lastCall().finding).toBeUndefined());
    expect(lastCall().departmentId).toBeUndefined();
    expect(screen.queryByText(/Entries awaiting a KB review/)).toBeNull();
  });

  it('control: a plain visit asks for no finding and shows no banner', async () => {
    renderAt('/knowledge-base#qa_pair');
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(0));
    expect(lastCall().finding).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Show all entries' })).toBeNull();
  });

  it('a backend that ignores the finding: the list is never presented as the finding, and no count', async () => {
    backend = 'old';
    total = 1234;
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    expect(await screen.findByText(/cannot open a finding.s own list yet/)).toBeTruthy();
    expect(screen.queryByText(/raw emails, not questions \(/)).toBeNull();
    expect(screen.queryByText(/1,234/)).toBeNull();
  });

  it('another filter on: the count says it is what is shown, not the finding size', async () => {
    renderAt('/knowledge-base?status=approved&finding=raw_email&departmentId=3#qa_pair');
    expect(
      await screen.findByText(
        'Learned entries that are raw emails, not questions in Support (2 shown — other filters are on)'
      )
    ).toBeTruthy();
  });

  it('a failed load: no count is claimed, and the banner says the list did not load', async () => {
    backend = 'error';
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    expect(await screen.findByText('The list could not be loaded.')).toBeTruthy();
    expect(
      screen.getByText('Learned entries that are raw emails, not questions in Support')
    ).toBeTruthy();
  });

  it('hiding an entry from the finding list re-reads that page (the list shrank on the server)', async () => {
    entries = [rawEntry];
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    await screen.findAllByText('Raw one');
    await waitFor(() => expect(screen.queryAllByText('Loading...')).toHaveLength(0));
    const row = (await screen.findAllByText('Raw one'))
      .map((cell) => cell.closest('tr'))
      .find(Boolean) as HTMLElement;
    const callsBefore = getAllCalls.length;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(hidden).toEqual([41]));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(callsBefore));
    expect(lastCall()).toMatchObject({ finding: 'raw_email', departmentId: 3 });
  });

  it('Clear All leaves the finding AND its Q&A tab: every type, no finding', async () => {
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    await screen.findByText(/raw emails, not questions in Support \(2\)/);
    fireEvent.click(screen.getByRole('button', { name: /Clear All/ }));
    await waitFor(() => expect(lastCall().finding).toBeUndefined());
    expect(lastCall().type).toBeUndefined();
  });

  it("another tab hides the finding's Q&A entries: the count is not the finding size", async () => {
    total = 0;
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#document');
    expect(
      await screen.findByText(
        'Learned entries that are raw emails, not questions in Support (0 shown — other filters are on)'
      )
    ).toBeTruthy();
  });

  const rowOf = async (title: string) => {
    await screen.findAllByText(title);
    await waitFor(() => expect(screen.queryAllByText('Loading...')).toHaveLength(0));
    return (await screen.findAllByText(title))
      .map((cell) => cell.closest('tr'))
      .find(Boolean) as HTMLElement;
  };

  it('rejecting an entry from the finding list re-reads that page too', async () => {
    // Reject is offered on entries still awaiting approval.
    entries = [{ ...rawEntry, approved: false }];
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    const row = await rowOf('Raw one');
    const callsBefore = getAllCalls.length;
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(hidden).toEqual([41]));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(callsBefore));
    expect(lastCall()).toMatchObject({ finding: 'raw_email' });
  });

  it('a failed reload of the finding list leaves no old rows under its title', async () => {
    entries = [rawEntry];
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    const row = await rowOf('Raw one');
    backend = 'error';
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    expect(await screen.findByText('The list could not be loaded.')).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('Raw one')).toHaveLength(0));
  });

  it('hiding the last row of page 2 re-reads page 1, not an empty page 2 (audit pass 3)', async () => {
    entries = [rawEntry];
    answerPage = 2;
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    const row = await rowOf('Raw one');
    answerPage = null;
    fireEvent.click(within(row).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(hidden).toEqual([41]));
    await waitFor(() => expect(lastCall()).toMatchObject({ finding: 'raw_email', page: 1 }));
  });

  it('an overtaken list answer does not switch the spinner off while the newer one loads', async () => {
    held = [];
    const queue = held;
    renderAt('/knowledge-base?finding=raw_email&departmentId=3#qa_pair');
    await waitFor(() => expect(queue.length).toBeGreaterThan(0));
    fireEvent.click(await screen.findByRole('button', { name: 'Show all entries' }));
    await waitFor(() => expect(lastCall().finding).toBeUndefined());
    const requests = queue.length;
    // The older (finding) answers first; the newer is still loading.
    await act(() => Promise.resolve(queue[requests - 2]()));
    expect(screen.queryAllByText('Loading...').length).toBeGreaterThan(0);
    await act(() => Promise.resolve(queue[requests - 1]()));
    await waitFor(() => expect(screen.queryAllByText('Loading...')).toHaveLength(0));
  });

  it('approving on page 2 re-reads page 2: the entry stays listed while its review is open', async () => {
    answerPage = 2;
    entries = [{ ...rawEntry, approved: false }];
    renderAt('/knowledge-base?finding=awaiting_review&departmentId=3#qa_pair');
    const row = await rowOf('Raw one');
    // The list is on page 2 with this one row (the old code sent it back to page 1).
    const callsBefore = getAllCalls.length;
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(hidden).toEqual([41]));
    await waitFor(() => expect(getAllCalls.length).toBeGreaterThan(callsBefore));
    expect(lastCall()).toMatchObject({ finding: 'awaiting_review', page: 2 });
    expect(await screen.findAllByText('Raw one')).not.toHaveLength(0);
  });
});
