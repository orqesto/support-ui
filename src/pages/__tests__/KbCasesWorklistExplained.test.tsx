/**
 * KB cases worklist — what the buttons do (G5): one help line, a tooltip per button, "Move into
 * case" only where a case exists, "Split case" on a case, and the nightly review's own changes
 * (an automatic clean-up with Undo; a held entry with Keep using / Reject).
 *
 * Same harness as KbCasesWorklist.test: the page against a fake WIRE under the REAL api-client.
 * All data is invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { chooseOption } from '@/test/chooseOption';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { apiClient } from '@/lib/api-client';
import { installTransport } from '@/test/apiTransport';
import { handle, reportNow, resetServer, server, workRow } from '@/test/kbWorklistServer';
import { resetKbAutoChangedBackend } from '@/hooks/useKbAutoChangedBackend';
import { useAuthStore } from '@/stores/authStore';
import { ACTION_TIPS, actionsHelp } from '@/components/kb/kbWorkRowModel';
import { CASE_PROBE_MAX_PAGES, KbCasesReportView } from '@/components/kb/KbCasesReportView';
import type { KbCasesReport } from '@/services/kbConsolidation.service';

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({
    data: [
      { id: 4, name: 'Support EU' },
      { id: 7, name: 'Billing' },
    ],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true }),
}));

const { KbCasesPage } = await import('../KbCasesPage');

let wire: ReturnType<typeof installTransport>;

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/knowledge-base/cases']} future={ROUTER_FUTURE}>
        <KbCasesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

const workRowEl = (id: number) => screen.findByTestId(`work-row-${id}`);
const reportReads = () => wire.calls('GET', '/api/knowledge-base/consolidation/cases');

/** The tooltip a button shows on focus (as on hover). */
const tooltipOf = async (button: HTMLElement) => {
  fireEvent.focus(button);
  return (await screen.findByRole('tooltip')).textContent;
};

beforeEach(() => {
  resetServer();
  resetKbAutoChangedBackend();
  useAuthStore.setState({
    isAuthenticated: false,
    selectedOrganizationId: 42,
    user: { id: 1, departmentIds: [4, 7] } as never,
  });
  wire = installTransport(apiClient, handle);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  wire.restore();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, selectedOrganizationId: null });
});

describe('what the buttons do', () => {
  it('one help line above the entries, and each button says its effect', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    const list = screen.getByRole('region', { name: 'Entries not in any case' });
    expect(within(list).getByTestId('kb-actions-help')).toHaveTextContent(actionsHelp(true));
    expect(await tooltipOf(within(row21).getByRole('button', { name: /Edit/ }))).toBe(
      ACTION_TIPS.edit
    );
    fireEvent.blur(within(row21).getByRole('button', { name: /Edit/ }));
    expect(await tooltipOf(within(row21).getByRole('button', { name: /Move into case/ }))).toBe(
      ACTION_TIPS.move
    );
  });

  it('a case row offers "Split case" (not Unmerge), which says it undoes the case', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const caseRow = await workRowEl(900);
    expect(within(caseRow).queryByRole('button', { name: /Unmerge/ })).toBeNull();
    const split = within(caseRow).getByRole('button', { name: /Split case/ });
    expect(await tooltipOf(split)).toBe(
      'Undo this case: its original entries come back on their own'
    );
    fireEvent.click(split);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Split this case?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Split case' }));
    await waitFor(() =>
      expect(
        wire.calls('POST', '/api/knowledge-base/consolidation/cases/900/unmerge')
      ).toHaveLength(1)
    );
  });
});

describe('"Move into case" only where a case exists', () => {
  it('no case anywhere in the teams: not offered', async () => {
    server.noCases = true;
    renderPage();
    const row21 = await workRowEl(21);
    expect(within(row21).getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(within(row21).queryByRole('button', { name: /Move into case/ })).toBeNull();
    // The page held every case: nothing more was read to tell.
    expect(reportReads()).toHaveLength(1);
  });

  it('no case on this page, but more pages: read once to tell — a case elsewhere keeps it offered', async () => {
    server.noCases = 'page';
    server.casesPages = 2;
    renderPage();
    const row21 = await workRowEl(21);
    expect(
      await within(row21).findByRole('button', { name: /Move into case/ })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(reportReads().some((read) => read.params.pageSize === '100')).toBe(true)
    );
  });

  const probeReads = () =>
    reportReads()
      .filter((read) => read.params.pageSize === '100')
      .map((read) => Number(read.params.page));

  it('more pages and no case on any of them: read to the last page, then not offered', async () => {
    server.noCases = true;
    server.casesPages = 2;
    renderPage();
    const row21 = await workRowEl(21);
    await waitFor(() =>
      expect(within(row21).queryByRole('button', { name: /Move into case/ })).toBeNull()
    );
    expect(probeReads()).toEqual([1, 2]);
    // The help line does not name a button that is not there.
    expect(screen.getAllByTestId('kb-actions-help')[0]).toHaveTextContent(actionsHelp(false));
    expect(screen.getAllByTestId('kb-actions-help')[0].textContent).not.toMatch(/Move into case/);
  });

  it('a case only on page 2: found there, and offered', async () => {
    server.casesPages = 2;
    server.withCases = (params) => params.pageSize === '100' && params.page === '2';
    renderPage();
    const row21 = await workRowEl(21);
    await waitFor(() => expect(probeReads()).toEqual([1, 2]));
    expect(within(row21).getByRole('button', { name: /Move into case/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('kb-actions-help')[0]).toHaveTextContent(actionsHelp(true));
  });

  it(`past ${CASE_PROBE_MAX_PAGES} pages without a case: not known — still offered`, async () => {
    server.noCases = true;
    server.casesPages = CASE_PROBE_MAX_PAGES + 5;
    renderPage();
    const row21 = await workRowEl(21);
    await waitFor(() => expect(probeReads()).toHaveLength(CASE_PROBE_MAX_PAGES));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(probeReads()).toHaveLength(CASE_PROBE_MAX_PAGES);
    expect(within(row21).getByRole('button', { name: /Move into case/ })).toBeInTheDocument();
  });

  it('read once per scope: a re-read of the report does not page through again', async () => {
    server.noCases = true;
    server.casesPages = 2;
    renderPage();
    await workRowEl(21);
    await waitFor(() => expect(probeReads()).toEqual([1, 2]));
    // Anything that re-reads the report (here: a re-sort), not a row action.
    await chooseOption(screen.getByLabelText('Sort'), 'Most recently seen');
    await waitFor(() =>
      expect(reportReads().filter((read) => read.params.pageSize !== '100').length).toBeGreaterThan(
        1
      )
    );
    expect(probeReads()).toEqual([1, 2]);
  });

  it('scope switched mid-read: the old scope’s late answer is never shown for the new one', async () => {
    server.casesPages = 2;
    // Departments 4: a case on page 2 (answer: offered). Departments 7: none anywhere.
    server.withCases = (params) =>
      params.pageSize === '100' && params.page === '2' && params.departmentIds === '4';
    let release: () => void = () => {};
    server.hold = (request) =>
      request.params.pageSize === '100' && request.params.departmentIds === '4'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    const pageReport = (ids: number[]): KbCasesReport => {
      const built = reportNow(ids);
      return {
        ...built,
        headers: built.headers.map((header) => ({
          ...header,
          rows: header.rows.filter((caseRow) => caseRow.kind !== 'case'),
        })),
      };
    };
    const worklist = (ids: number[]) => ({
      departmentIds: ids,
      onChanged: () => Promise.resolve(),
      onNotice: () => {},
    });
    const tree = (ids: number[]) => (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter future={ROUTER_FUTURE}>
          <KbCasesReportView report={pageReport(ids)} worklist={worklist(ids)} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(tree([4]));
    await workRowEl(21);
    await waitFor(() => expect(probeReads()).toEqual([1]));
    rerender(tree([7]));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('work-row-21')).queryByRole('button', { name: /Move into case/ })
      ).toBeNull()
    );
    // The held read for departments 4 answers now: it must change nothing.
    release();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      within(screen.getByTestId('work-row-21')).queryByRole('button', { name: /Move into case/ })
    ).toBeNull();
    // …and it stopped paging that scope (no page 2 for departments 4).
    expect(
      reportReads().filter((read) => read.params.departmentIds === '4' && read.params.page === '2')
    ).toHaveLength(0);
  });
});

describe('the nightly review’s own changes', () => {
  const cleaned = () => {
    server.entries.set(
      26,
      workRow({
        id: 26,
        status: 'approved',
        question: 'When does my parcel ship?',
        answer: 'Your order ships within two days.',
        autoCleaned: { suggestionId: 501, at: '2026-10-09T02:00:00.000Z' },
      })
    );
    server.reasons.set(26, 'customer_specific');
    server.originals = new Map([
      [
        501,
        { question: 'When does my parcel ship?', answer: 'Order 0000-TEST ships within two days.' },
      ],
    ]);
  };

  it('auto-cleaned: says so, offers no Undo here (undoing is in the Knowledge Base list)', async () => {
    cleaned();
    renderPage();
    const row = await workRowEl(26);
    expect(within(row).getByText('Customer details removed automatically')).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(within(row).getByRole('link', { name: 'Open in Knowledge Base' })).toHaveAttribute(
      'href',
      '/knowledge-base?id=26'
    );
    expect(wire.calls('POST', '/api/knowledge-base/consolidation/quality/501/undo')).toHaveLength(
      0
    );
  });

  const held = () => {
    server.entries.set(
      23,
      workRow({ id: 23, status: 'hidden', heldForReview: { suggestionId: 601 } })
    );
  };

  it('held: "Not used — about one customer", with no Keep using / Reject / Unhide here', async () => {
    held();
    renderPage();
    const row = await workRowEl(23);
    expect(within(row).getByText('Not used — about one customer')).toBeInTheDocument();
    for (const name of [/Unhide/, /Keep using/, /Reject/])
      expect(within(row).queryByRole('button', { name })).toBeNull();
    expect(within(row).getByRole('link', { name: 'Open in Knowledge Base' })).toHaveAttribute(
      'href',
      '/knowledge-base?id=23'
    );
  });
});

describe('an older backend (no "Changed automatically" in the KB list): the row keeps its own undo', () => {
  beforeEach(() => {
    server.autoChangedStatus = false;
  });

  it('auto-cleaned: Undo puts the original text back through the old route', async () => {
    server.entries.set(
      26,
      workRow({
        id: 26,
        status: 'approved',
        question: 'When does my parcel ship?',
        answer: 'Your order ships within two days.',
        autoCleaned: { suggestionId: 501, at: '2026-10-09T02:00:00.000Z' },
      })
    );
    server.reasons.set(26, 'customer_specific');
    server.originals = new Map([
      [
        501,
        { question: 'When does my parcel ship?', answer: 'Order 0000-TEST ships within two days.' },
      ],
    ]);
    renderPage();
    const row = await workRowEl(26);
    const undo = await within(row).findByRole('button', { name: /Undo/ });
    expect(await tooltipOf(undo)).toBe(ACTION_TIPS.undoClean);
    fireEvent.click(undo);
    await waitFor(() =>
      expect(within(row).getByText('Order 0000-TEST ships within two days.')).toBeInTheDocument()
    );
    expect(wire.calls('POST', '/api/knowledge-base/consolidation/quality/501/undo')).toHaveLength(
      1
    );
  });

  it('held: Keep using declines the suggestion; Reject accepts it with action reject', async () => {
    server.entries.set(
      23,
      workRow({ id: 23, status: 'hidden', heldForReview: { suggestionId: 601 } })
    );
    server.entries.set(
      24,
      workRow({ id: 24, status: 'hidden', heldForReview: { suggestionId: 602 } })
    );
    renderPage();
    const keepRow = await workRowEl(23);
    fireEvent.click(await within(keepRow).findByRole('button', { name: /Keep using/ }));
    await waitFor(() =>
      expect(wire.calls('POST', '/api/learning/suggestions/601/decline')).toHaveLength(1)
    );
    const rejectRow = await workRowEl(24);
    fireEvent.click(await within(rejectRow).findByRole('button', { name: /Reject/ }));
    await waitFor(() =>
      expect(wire.calls('POST', '/api/learning/suggestions/602/accept')).toHaveLength(1)
    );
    expect(wire.calls('POST', '/api/learning/suggestions/602/accept')[0].body).toEqual({
      action: 'reject',
    });
  });

  it('a moderator of only part of the entry sees the badge and why there is no button', async () => {
    server.entries.set(
      23,
      workRow({
        id: 23,
        status: 'hidden',
        heldForReview: { suggestionId: 601 },
        canDecide: false,
      })
    );
    renderPage();
    const row = await workRowEl(23);
    expect(
      await within(row).findByText(
        'Only a moderator of every team it serves can decide the review’s change.'
      )
    ).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Keep using/ })).toBeNull();
  });
});
