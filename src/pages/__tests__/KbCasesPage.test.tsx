/**
 * F2 (KB consolidation #873): the Cases report. Every caption must stay TRUE in every state.
 *
 * ⛔ Only a moderator-approved CASE row has a standard answer; every other row says "no standard
 * answer yet" and never shows one (even if a field carried text). Row counts overlap — one
 * thread can raise several cases — so nothing is ever totalled as "conversations", and an entry
 * count is never called "unique cases".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbCasesReport } from '@/services/kbConsolidation.service';
import { report, row, zeroFindings } from '@/test/kbCasesReportFixture';

const getCases = vi.fn<(query: unknown) => Promise<KbCasesReport>>();
const downloadCasesCsv = vi.fn<(query: unknown) => Promise<void>>();
vi.mock('@/services/kbConsolidation.service', () => ({
  kbConsolidationService: {
    getCases: (query: unknown) => getCases(query),
    downloadCasesCsv: (query: unknown) => downloadCasesCsv(query),
  },
}));
vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
let departments = [{ id: 4, name: 'Support EU' }];
let viewer: { isOrgAdmin: boolean; departmentIds: number[] | undefined } = {
  isOrgAdmin: true,
  departmentIds: [],
};
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: departments, isLoading: false }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: viewer.isOrgAdmin }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { departmentIds: viewer.departmentIds } }),
}));

const { KbCasesPage, KbCasesReportView, KB_CASES_CAPTION } = await import('../KbCasesPage');

const view = (data: KbCasesReport) =>
  render(
    <MemoryRouter>
      <KbCasesReportView report={data} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  departments = [{ id: 4, name: 'Support EU' }];
  viewer = { isOrgAdmin: true, departmentIds: [] };
  getCases.mockResolvedValue(report());
  downloadCasesCsv.mockResolvedValue();
});
afterEach(cleanup);

describe('KB Cases report (F2)', () => {
  it('renders each row kind; ONLY the case row shows a standard answer', () => {
    view(report());
    expect(screen.getByRole('link', { name: 'Case #KB-900' })).toHaveAttribute(
      'href',
      '/knowledge-base?id=900'
    );
    expect(screen.getByText('Refunds take 5 days.')).toBeInTheDocument();
    expect(screen.getByText('proposed case — awaiting review')).toBeInTheDocument();
    expect(screen.getByText('unreviewed group')).toBeInTheDocument();
    expect(screen.getByText('declined for case #KB-900')).toBeInTheDocument();
    expect(screen.getAllByText('no standard answer yet')).toHaveLength(4);
    expect(screen.getAllByText(/Standard answer:/)).toHaveLength(1);
    expect(screen.queryByText('AI DRAFT TEXT')).not.toBeInTheDocument();
  });

  it('never totals anything as "conversations" and never says "unique cases"', () => {
    const { container } = view(report());
    // One noun for one thing: rows, caption and header all say "conversations"; the header is a
    // union ("each counted once"), never worded as a total.
    expect(
      screen.getByText('7 conversations across these cases, each counted once')
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+\s+threads?\b/i);
    expect(container.textContent).not.toMatch(/unique cases/i);
    expect(container.textContent).not.toMatch(/\d+ conversations in total/i);
    expect(container.textContent).not.toMatch(/total conversations/i);
  });

  it('a header over a single row does not say "across these cases"', () => {
    view(
      report({
        headers: [
          { label: 'refund', language: 'en', conversations: 2, rows: [row({ kind: 'single' })] },
        ],
      })
    );
    expect(screen.getByText('2 conversations in this case')).toBeInTheDocument();
    expect(screen.queryByText(/across these cases/)).not.toBeInTheDocument();
  });

  it('shows classifying progress, the footer and every finding incl. possible duplicates', () => {
    view(report());
    expect(screen.getByText('Classifying: 40 of 50')).toBeInTheDocument();
    expect(screen.getByText('12 more learned answers below the quality bar')).toBeInTheDocument();
    const findings = screen.getByRole('list', { name: 'Findings' }).textContent ?? '';
    expect(findings).toMatch(/4 learned entries are raw emails, not questions/);
    expect(findings).toMatch(/1 could not be classified/);
    expect(findings).toMatch(/3 awaiting KB review/);
    expect(findings).toMatch(/2 judged customer-specific/);
    expect(findings).toMatch(/1 with no clear language/);
    expect(findings).toMatch(/1 entry detached from a case/);
    // Named as the rows name them; a case with no public id yet falls back to its row id.
    expect(findings).toMatch(/#KB-900, #905 — review whether they are one case \(Unmerge one/);
  });

  it('hides "classifying" once everything is settled', () => {
    view(report({ classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 } }));
    expect(screen.queryByText(/Classifying:/)).not.toBeInTheDocument();
  });

  const allSettled = { settled: 0, total: 0, beyondBound: 0, outOfReach: 0 };
  const MINING_OFF = /No mailbox in this department feeds the knowledge base automatically/;

  it('mining off with nothing in the knowledge base here says so instead of an empty table', () => {
    view(
      report({
        miningOff: true,
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        classifying: allSettled,
      })
    );
    expect(screen.getByText(MINING_OFF)).toHaveTextContent(
      /so there are no learned answers to group into cases/
    );
    expect(screen.queryByText(/No learned answers match/)).not.toBeInTheDocument();
  });

  it('mining off never hides what the knowledge base holds, and claims nothing about when it came', () => {
    // Resolve & Save and training captures fill a department with no KB mailbox, and "awaiting
    // KB review" items are CURRENT captures — neither is "learned before mining was switched off".
    view(report({ miningOff: true, headers: [], classifying: allSettled }));
    const notice = screen.getByText(MINING_OFF);
    expect(notice).not.toHaveTextContent(/no learned answers/i);
    expect(notice).not.toHaveTextContent(/before|learning from conversations is off/i);
    expect(screen.getByText('12 more learned answers below the quality bar')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Findings' })).toHaveTextContent(
      /3 awaiting KB review/
    );
    expect(screen.queryByText(/no learned answers/i)).not.toBeInTheDocument();
  });

  it('mining off while entries are still being classified says so and shows the progress (MED-1)', () => {
    view(
      report({
        miningOff: true,
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        classifying: { settled: 0, total: 5, beyondBound: 0, outOfReach: 0 },
      })
    );
    expect(screen.queryByText(/no learned answers/i)).not.toBeInTheDocument();
    expect(screen.getByText('Classifying: 0 of 5')).toBeInTheDocument();
    expect(screen.getByText(MINING_OFF)).toHaveTextContent(
      /5 learned answers are still being classified/
    );
  });

  it('an empty report while entries are still being classified does not say none match (MED-1)', () => {
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        classifying: { settled: 0, total: 40, beyondBound: 0, outOfReach: 0 },
      })
    );
    expect(screen.getByText('Classifying: 0 of 40')).toBeInTheDocument();
    expect(screen.queryByText(/No learned answers match/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '40 learned answers are still being classified — what is shown here can still change.'
      )
    ).toBeInTheDocument();
  });

  it('an empty report with answers below the bar does not say nothing was learned', () => {
    view(
      report({
        headers: [],
        findings: zeroFindings,
        classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 },
      })
    );
    expect(screen.queryByText(/No learned answers match/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/None of the learned answers here clears the quality bar yet/)
    ).toBeInTheDocument();
  });

  it('flags a bounded scope', () => {
    view(
      report({
        bounded: true,
        classifying: { settled: 5000, total: 5000, beyondBound: 300, outOfReach: 1000 },
      })
    );
    // Both numbers: every answer past the bound (the job does not propose them) and those never
    // classified —
    // without naming the kind of scope (a source, or a department with no source).
    const notice = screen.getByText(
      "1000 older answers are past the nightly job's limit, and the nightly job does not propose them as new cases. 300 of them are not classified."
    );
    expect(notice).not.toHaveTextContent(/mailbox/i);
    expect(document.body.textContent).not.toMatch(/only the newest are|missing|counts can be low/);
  });

  it('flags a bounded scope when mining is off too', () => {
    view(
      report({
        miningOff: true,
        headers: [],
        bounded: true,
        classifying: { settled: 5000, total: 5000, beyondBound: 300, outOfReach: 1000 },
      })
    );
    expect(
      screen.getByText(
        "1000 older answers are past the nightly job's limit, and the nightly job does not propose them as new cases. 300 of them are not classified."
      )
    ).not.toHaveTextContent(/mailbox/i);
  });

  it('labelling not running: nothing reads as "being classified" or as progress (MED-1)', () => {
    view(
      report({
        headers: [],
        // Labelled answers past the bound land somewhere real: here, below the quality bar.
        footer: { belowQualityBar: 1000 },
        findings: zeroFindings,
        classifying: { settled: 0, total: 5000, beyondBound: 0, outOfReach: 1000 },
        bounded: true,
        labellingActive: false,
        labellingMode: 'off',
      })
    );
    const page = document.body.textContent ?? '';
    expect(page).not.toMatch(/being classified|Classifying:/);
    // The bound must not claim anything IS classified or proposed while nothing runs.
    expect(page).not.toMatch(/only the newest are classified/);
    expect(
      screen.getByText(
        '5000 learned answers are not classified — consolidation is not running for this workspace.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('1000 more learned answers below the quality bar')).toBeInTheDocument();
    expect(
      screen.getByText(/1000 older answers are past the nightly job's limit/)
    ).toHaveTextContent(': the nightly job does not propose them as new cases.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Classified: 0 of 5000 — consolidation is not running for this workspace.'
    );
  });

  it('labelling not running, mining off: the same plain statement', () => {
    view(
      report({
        miningOff: true,
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        classifying: { settled: 0, total: 5, beyondBound: 0, outOfReach: 0 },
        labellingActive: false,
        labellingMode: 'off',
      })
    );
    expect(document.body.textContent).not.toMatch(/being classified|Classifying:/);
    expect(screen.getByText(MINING_OFF)).toHaveTextContent(
      /5 learned answers are not classified — consolidation is not running for this workspace/
    );
  });

  it('no search and only findings: the empty text does not say nothing matches (LOW-2)', () => {
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 },
      })
    );
    expect(screen.getByRole('list', { name: 'Findings' })).toBeInTheDocument();
    expect(screen.queryByText(/No learned answers match/)).not.toBeInTheDocument();
    // An older backend sends counts only: nothing is LISTED below, so nothing says so.
    expect(
      screen.getByText('No learned answer here forms a case yet — the findings below say why.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/listed below/)).not.toBeInTheDocument();
  });

  it('the detached finding names both ways an entry leaves a case', () => {
    view(report({ findings: { ...zeroFindings, detached: 2 } }));
    expect(
      screen.getByText(
        '2 entries detached from a case (taken out by a moderator, or the thread moved to another mailbox)'
      )
    ).toBeInTheDocument();
  });

  it('set-aside ids but no worklist to list them: never says "listed below"', () => {
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 },
        setAside: [{ entryId: 5, reason: 'raw_email' }],
      })
    );
    expect(
      screen.getByText('No learned answer here forms a case yet — the findings below say why.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/listed below/)).not.toBeInTheDocument();
  });

  it("renders a group row titled 'waiting for the proposed case' as the backend names it", () => {
    view(
      report({
        headers: [
          {
            label: 'refund',
            language: 'en',
            conversations: 2,
            rows: [row({ kind: 'group', title: 'waiting for the proposed case' })],
          },
        ],
      })
    );
    const waiting = screen.getByTestId('case-row-group');
    expect(waiting).toHaveTextContent('waiting for the proposed case');
    expect(waiting).toHaveTextContent('no standard answer yet');
    expect(waiting).toHaveTextContent('Member question?');
  });

  it('entries still being classified are not promised a case', () => {
    // Once labelled, an entry can land below the quality bar or in a finding, not in a case.
    view(
      report({
        headers: [],
        footer: { belowQualityBar: 0 },
        findings: zeroFindings,
        classifying: { settled: 0, total: 40, beyondBound: 0, outOfReach: 0 },
      })
    );
    expect(screen.queryByText(/cases appear/)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '40 learned answers are still being classified — what is shown here can still change.'
      )
    ).toBeInTheDocument();
  });

  it('while a search is loading, the report on screen keeps the words of its own search', async () => {
    getCases.mockImplementation((query) =>
      (query as { search?: string }).search
        ? new Promise(() => {})
        : Promise.resolve(
            report({
              headers: [],
              findings: zeroFindings,
              classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 },
            })
          )
    );
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(
      await screen.findByText('None of the learned answers here clears the quality bar yet.')
    ).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search questions'), {
      target: { value: 'refund' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(getCases).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'refund' }))
    );
    // The reply for "refund" has not come: nothing may say "refund" matched nothing.
    expect(screen.queryByText(/No case matches “refund”/)).not.toBeInTheDocument();
  });

  it('a report that ALSO covers unlinked mailboxes gives no per-department finding link', async () => {
    getCases.mockResolvedValue({ ...report(), departmentIds: [4], unassignedScopes: true });
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(await screen.findByText(/learned entries are raw emails/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'clean up' })).toBeNull();
  });

  it('one department and nothing else: the finding links to that department', async () => {
    getCases.mockResolvedValue({ ...report(), departmentIds: [4], unassignedScopes: false });
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'clean up' })).toHaveAttribute(
      'href',
      '/knowledge-base?finding=raw_email&departmentId=4#qa_pair'
    );
  });

  it('FE pass 19 LOW-2: clearing the search box with its X clears the applied search (list and CSV)', async () => {
    getCases.mockImplementation(() => Promise.resolve(report()));
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    const box = await screen.findByPlaceholderText('Search questions');
    fireEvent.change(box, { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(getCases).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'zzz' }))
    );
    fireEvent.click(screen.getByTitle('Clear search'));
    await waitFor(() =>
      expect(getCases).toHaveBeenLastCalledWith(expect.not.objectContaining({ search: 'zzz' }))
    );
    fireEvent.click(await screen.findByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(downloadCasesCsv).toHaveBeenCalled());
    expect(downloadCasesCsv).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ search: 'zzz' })
    );
  });

  it('a search with no match says so — never a department-wide claim (LOW-1)', async () => {
    getCases.mockImplementation((query) =>
      Promise.resolve(
        (query as { search?: string }).search
          ? report({
              headers: [],
              classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 },
            })
          : report()
      )
    );
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    await screen.findByText('Refunds take 5 days.');
    fireEvent.change(screen.getByPlaceholderText('Search questions'), {
      target: { value: 'zzz' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No case matches “zzz”.')).toBeInTheDocument();
    expect(screen.queryByText(/None of the learned answers here/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No learned answers match here/)).not.toBeInTheDocument();
  });

  const ticked = () =>
    within(screen.getByRole('group', { name: 'Departments' }))
      .getAllByRole('checkbox')
      .map((box) => ({
        name: box.closest('label')?.textContent,
        checked: (box as HTMLInputElement).checked,
      }));
  const departmentsOf = (query: unknown) => (query as { departmentIds?: number[] }).departmentIds;

  it('D2: a moderator is offered only their own departments, and ALL of them are reported by default', async () => {
    departments = [
      { id: 4, name: 'Support EU' },
      { id: 7, name: 'Billing' },
    ];
    viewer = { isOrgAdmin: false, departmentIds: [7] };
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(ticked()).toEqual([{ name: 'Billing', checked: false }]);
    expect(screen.getByText('No department filter')).toBeInTheDocument();
    await waitFor(() => expect(getCases).toHaveBeenCalled());
    // None ticked = every department the viewer can see: no list is sent, the server decides.
    expect(getCases.mock.calls.every(([query]) => departmentsOf(query)?.length === 0)).toBe(true);
    expect(getCases.mock.calls.some(([query]) => 'departmentId' in (query as object))).toBe(false);
  });

  it('D2: an org admin is offered every department, none forced', async () => {
    departments = [
      { id: 4, name: 'Support EU' },
      { id: 7, name: 'Billing' },
    ];
    viewer = { isOrgAdmin: true, departmentIds: [] };
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(ticked()).toEqual([
      { name: 'Support EU', checked: false },
      { name: 'Billing', checked: false },
    ]);
    await waitFor(() =>
      expect(getCases).toHaveBeenCalledWith(expect.objectContaining({ departmentIds: [] }))
    );
  });

  it('a ticked department that leaves the list (org switch) is never requested again', async () => {
    departments = [{ id: 4, name: 'Support EU' }];
    viewer = { isOrgAdmin: true, departmentIds: [] };
    const { rerender } = render(
      <MemoryRouter initialEntries={['/knowledge-base/cases?departments=4']}>
        <KbCasesPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(getCases).toHaveBeenCalledWith(expect.objectContaining({ departmentIds: [4] }))
    );
    getCases.mockClear();
    departments = [{ id: 12, name: 'Other workspace' }];
    rerender(
      <MemoryRouter initialEntries={['/knowledge-base/cases?departments=4']}>
        <KbCasesPage />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(getCases).toHaveBeenCalledWith(expect.objectContaining({ departmentIds: [] }))
    );
    expect(getCases.mock.calls.some(([query]) => departmentsOf(query)?.includes(4))).toBe(false);
  });

  it('a moderator in no department is told so, and nothing is requested', async () => {
    departments = [{ id: 4, name: 'Support EU' }];
    viewer = { isOrgAdmin: false, departmentIds: undefined };
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(screen.getByText('You have no department to report on.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getCases).not.toHaveBeenCalled();
  });

  it('changing departments shows loading, never the previous departments as if they were these', async () => {
    departments = [
      { id: 4, name: 'Support EU' },
      { id: 7, name: 'Billing' },
    ];
    viewer = { isOrgAdmin: true, departmentIds: [] };
    let resolveBilling: (value: KbCasesReport) => void = () => {};
    let resolveStale: (value: KbCasesReport) => void = () => {};
    getCases.mockImplementation((query) => {
      const { departmentIds, sort } = query as { departmentIds: number[]; sort: string };
      const all = departmentIds.length === 0;
      if (all && sort === 'conversations') return Promise.resolve(report());
      if (all)
        return new Promise((resolve) => {
          resolveStale = resolve;
        });
      return new Promise((resolve) => {
        resolveBilling = resolve;
      });
    });
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Refunds take 5 days.')).toBeInTheDocument();
    // A slow request for all departments is still out when the viewer narrows to Billing.
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'lastSeen' } });
    fireEvent.click(screen.getByLabelText('Billing'));
    expect(screen.queryByText('Refunds take 5 days.')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { busy: true })).toBeInTheDocument();
    resolveBilling(
      report({
        headers: [],
        findings: zeroFindings,
        footer: { belowQualityBar: 0 },
        classifying: { settled: 50, total: 50, beyondBound: 0, outOfReach: 0 },
      })
    );
    expect(await screen.findByText('No learned answers match here yet.')).toBeInTheDocument();
    // The stale answer for all departments lands last — it must not replace Billing's.
    resolveStale(report());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Refunds take 5 days.')).not.toBeInTheDocument();
  });

  it('the page states what the counts are, reports every department by default, sorts, and downloads the CSV', async () => {
    render(
      <MemoryRouter>
        <KbCasesPage />
      </MemoryRouter>
    );
    expect(screen.getByTestId('cases-caption')).toHaveTextContent(KB_CASES_CAPTION);
    expect(KB_CASES_CAPTION).toMatch(
      /conversations whose answers were learned into the knowledge base/
    );
    expect(KB_CASES_CAPTION).toMatch(/one real case can appear twice/);
    await waitFor(() =>
      expect(getCases).toHaveBeenCalledWith({
        departmentIds: [],
        search: '',
        sort: 'conversations',
        page: 1,
        pageSize: 25,
      })
    );
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'lastSeen' } });
    await waitFor(() =>
      expect(getCases).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'lastSeen' }))
    );
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() =>
      expect(downloadCasesCsv).toHaveBeenCalledWith({
        departmentIds: [],
        search: '',
        sort: 'lastSeen',
      })
    );
  });
});
