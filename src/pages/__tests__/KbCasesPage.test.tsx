/**
 * F2 (KB consolidation #873): the Cases report. Every caption must stay TRUE in every state.
 *
 * ⛔ Only a moderator-approved CASE row has a standard answer; every other row says "no standard
 * answer yet" and never shows one (even if a field carried text). Row counts overlap — one
 * thread can raise several cases — so nothing is ever totalled as "conversations", and an entry
 * count is never called "unique cases".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { KbCaseRow, KbCasesReport } from '@/services/kbConsolidation.service';

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
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: [{ id: 4, name: 'Support EU' }], isLoading: false }),
}));

const { KbCasesPage, KbCasesReportView, KB_CASES_CAPTION } = await import('../KbCasesPage');

const row = (over: Partial<KbCaseRow>): KbCaseRow => ({
  kind: 'single',
  title: null,
  label: 'refund',
  language: 'en',
  scopeKey: 's:1',
  caseId: null,
  casePublicId: null,
  suggestionId: null,
  question: null,
  questions: ['Member question?'],
  standardAnswer: null,
  entryIds: [1],
  conversations: 2,
  customers: 2,
  firstSeen: '2026-09-01T00:00:00.000Z',
  lastSeen: '2026-09-20T00:00:00.000Z',
  source: 'support@acme.test',
  ...over,
});

const report = (over: Partial<KbCasesReport> = {}): KbCasesReport => ({
  headers: [
    {
      label: 'refund',
      language: 'en',
      conversations: 7,
      rows: [
        row({
          kind: 'case',
          title: null,
          caseId: 900,
          casePublicId: 'KB-900',
          question: 'How do refunds work?',
          questions: null,
          standardAnswer: 'Refunds take 5 days.',
          conversations: 5,
        }),
        row({ kind: 'proposed', title: 'proposed case — awaiting review', suggestionId: 70 }),
        // A non-case row that (wrongly) carries answer text must still not show it.
        row({ kind: 'group', title: 'unreviewed group', standardAnswer: 'AI DRAFT TEXT' }),
        row({ kind: 'group', title: 'declined for case #900' }),
        row({ kind: 'single' }),
      ],
    },
  ],
  pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  footer: { belowQualityBar: 12 },
  findings: {
    rawEmails: 4,
    judgedCustomerSpecific: 2,
    couldNotClassify: 1,
    awaitingKbReview: 3,
    noClearLanguage: 1,
    detached: 1,
    possibleDuplicates: [{ caseIds: [900, 905] }],
  },
  classifying: { settled: 40, total: 50 },
  bounded: false,
  miningOff: false,
  ...over,
});

const view = (data: KbCasesReport) =>
  render(
    <MemoryRouter>
      <KbCasesReportView report={data} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(screen.getByText('declined for case #900')).toBeInTheDocument();
    expect(screen.getAllByText('no standard answer yet')).toHaveLength(4);
    expect(screen.getAllByText(/Standard answer:/)).toHaveLength(1);
    expect(screen.queryByText('AI DRAFT TEXT')).not.toBeInTheDocument();
  });

  it('never totals anything as "conversations" and never says "unique cases"', () => {
    const { container } = view(report());
    expect(screen.getByText('7 threads in total, each counted once')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/unique cases/i);
    expect(container.textContent).not.toMatch(/\d+ conversations in total/i);
    expect(container.textContent).not.toMatch(/total conversations/i);
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
    expect(findings).toMatch(/#900, #905 — review whether they are one case \(Unmerge one/);
  });

  it('hides "classifying" once everything is settled', () => {
    view(report({ classifying: { settled: 50, total: 50 } }));
    expect(screen.queryByText(/Classifying:/)).not.toBeInTheDocument();
  });

  it('mining off says so instead of an empty table', () => {
    view(report({ miningOff: true, headers: [] }));
    expect(
      screen.getByText(/Learning from conversations is off for this department/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/No learned answers match/)).not.toBeInTheDocument();
  });

  it('flags a bounded scope', () => {
    view(report({ bounded: true }));
    expect(screen.getByText(/Only the newest\s+are grouped/)).toBeInTheDocument();
  });

  it('the page states what the counts are, asks for the department, sorts, and downloads the CSV', async () => {
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
        departmentId: 4,
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
        departmentId: 4,
        search: '',
        sort: 'lastSeen',
      })
    );
  });
});
