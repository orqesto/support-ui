/**
 * KB cases worklist — an older backend (F5), answers that arrive late, and the audit's regressions.
 * Same fake wire under the REAL api-client as KbCasesWorklist.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { chooseOption } from '@/test/chooseOption';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { apiClient } from '@/lib/api-client';
import { installTransport } from '@/test/apiTransport';
import { handle, resetServer, server, workRow } from '@/test/kbWorklistServer';
import { useAuthStore } from '@/stores/authStore';
import type { KbWorkRow } from '@/services/kbConsolidation.service';

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
let departments = [
  { id: 4, name: 'Support EU' },
  { id: 7, name: 'Billing' },
];
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: () => ({ data: departments, isLoading: false }),
}));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: true }),
}));

const { KbCasesPage } = await import('../KbCasesPage');
// ---- harness ---------------------------------------------------------------------------------

let wire: ReturnType<typeof installTransport>;

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
};

const renderPage = (url = '/knowledge-base/cases') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[url]} future={ROUTER_FUTURE}>
        <KbCasesPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );

const reportReads = () => wire.calls('GET', '/api/knowledge-base/consolidation/cases');
const rowReads = () => wire.calls('POST', '/api/knowledge-base/consolidation/entries/rows');
const workRowEl = (id: number) => screen.findByTestId(`work-row-${id}`);

/** Move into case: open the picker, wait for the server's search, pick, confirm. */
const moveInto = async (row: HTMLElement, name: RegExp = /Case #KB-900/) => {
  fireEvent.click(within(row).getByRole('button', { name: /Move into case/ }));
  fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move' }));
};

beforeEach(() => {
  departments = [
    { id: 4, name: 'Support EU' },
    { id: 7, name: 'Billing' },
  ];
  resetServer();
  useAuthStore.setState({
    isAuthenticated: false,
    selectedOrganizationId: 42,
    user: { id: 1, departmentIds: [4, 7] } as never,
  });
  wire = installTransport(apiClient, handle);
  // jsdom has no scrolling; Pagination scrolls the window on a page change.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  wire.restore();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, selectedOrganizationId: null });
});

describe('audit pass 1 regressions', () => {
  it('a row whose source was removed reads as the KB list reads it, and offers nothing', async () => {
    const entry = server.entries.get(23) as KbWorkRow;
    server.entries.set(23, { ...entry, sourceDeleted: true });
    renderPage();
    const row23 = await workRowEl(23);
    expect(within(row23).getByText('Source removed — not used')).toBeInTheDocument();
    expect(within(row23).queryAllByRole('button')).toHaveLength(0);
  });

  it("Reject shows the purge date counted from the SERVER's rejection time", async () => {
    renderPage();
    const row22 = await workRowEl(22);
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases'
        ? new Promise<void>(() => {})
        : null;
    fireEvent.click(within(row22).getByRole('button', { name: /Reject/ }));
    const purge = new Date(
      Date.parse('2026-01-10T12:00:00.000Z') + 90 * 86_400_000
    ).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    expect(await within(row22).findByText(`Rejected · deleted after ${purge}`)).toBeInTheDocument();
  });

  it('a detached entry that still carries its old case id reads detached and can be unhidden', async () => {
    const entry = server.entries.get(24) as KbWorkRow;
    server.entries.set(24, { ...entry, caseId: 905, casePublicId: 'KB-905' });
    renderPage();
    const row24 = await workRowEl(24);
    expect(within(row24).getByText('detached from a case')).toBeInTheDocument();
    expect(within(row24).queryByText(/merged into/)).not.toBeInTheDocument();
    expect(within(row24).getByRole('button', { name: /Unhide/ })).toBeInTheDocument();
  });

  it('a reason this app does not know is listed under a reason that claims nothing', async () => {
    server.entries.set(40, workRow({ id: 40 }));
    server.rawReasons = new Map([[40, 'too_long']]);
    renderPage();
    const row40 = await workRowEl(40);
    expect(within(row40).getByText('Set aside (other reason)')).toBeInTheDocument();
    expect(within(row40).queryByText('Not classified')).not.toBeInTheDocument();
  });

  it('a refused action re-reads the row: it shows what the entry IS now', async () => {
    server.mergedMeanwhile = new Set([21]);
    renderPage();
    const row21 = await workRowEl(21);
    // Hold the report re-read (it would take the merged entry off this list): what the row says
    // meanwhile is the row's own re-read.
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases'
        ? new Promise<void>(() => {})
        : null;
    fireEvent.click(within(row21).getByRole('button', { name: /Approve/ }));
    expect(
      await within(row21).findByText(/Could not approve: This entry is part of a merged case/)
    ).toBeInTheDocument();
    expect(await within(row21).findByText('merged into #KB-900')).toBeInTheDocument();
    expect(within(row21).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
  });

  it('a slow rows answer for ids no longer shown never replaces the rows on screen', async () => {
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/entries/rows' &&
      (request.body as { ids: number[] }).ids.includes(22)
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    renderPage();
    await screen.findByText('Refunds take 5 days.');
    await waitFor(() => expect(rowReads().length).toBeGreaterThan(0));
    // While the all-reasons page is still loading, narrow to raw emails.
    await chooseOption(screen.getByLabelText('Reason'), /^Raw email \(/);
    expect(await workRowEl(21)).toBeInTheDocument();
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByTestId('work-row-21')).toBeInTheDocument();
    expect(screen.queryByTestId('work-row-22')).not.toBeInTheDocument();
    expect(screen.queryByText(/not shown — removed meanwhile/)).not.toBeInTheDocument();
    // …and the list does not keep saying it is still loading.
    const section = screen.getByRole('region', { name: 'Entries not in any case' });
    expect(within(section).queryByRole('status')).not.toBeInTheDocument();
  });
});

// ---- F5: an older backend --------------------------------------------------------------------

describe('F5 older backend', () => {
  it('a report that needs ONE department falls back to a single department, read-only', async () => {
    server.legacy = true;
    renderPage();
    expect(await screen.findByText('Refunds take 5 days.')).toBeInTheDocument();
    const reads = reportReads();
    expect(reads[0].params.departmentId).toBeUndefined();
    expect(reads.at(-1)?.params.departmentId).toBe('4');
    expect(screen.getByText('Support EU')).toBeInTheDocument();
    expect(screen.getByText(/This server reports on one department at a time/)).toBeInTheDocument();
    // No rows route there: nothing to expand, no set-aside rows; the findings stay counts.
    expect(screen.queryByRole('button', { name: /Show entries/ })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Findings' })).toHaveTextContent(
      /1 learned entry is a raw email/
    );
    expect(screen.queryByText(/listed below/)).not.toBeInTheDocument();
    expect(rowReads()).toHaveLength(0);
  });

  it('a rows read that fails says so and can be tried again', async () => {
    let failRows = true;
    wire.restore();
    wire = installTransport(apiClient, (request) => {
      if (failRows && request.path === '/api/knowledge-base/consolidation/entries/rows')
        return { status: 500, data: { success: false, error: 'Database unavailable' } };
      return handle(request);
    });
    renderPage();
    const retry = await screen.findAllByRole('button', { name: 'Try again' });
    expect(screen.queryByTestId('work-row-21')).not.toBeInTheDocument();
    failRows = false;
    fireEvent.click(retry[0]);
    expect(await workRowEl(21)).toBeInTheDocument();
  });

  it('a rows route that does not exist says so instead of an empty or broken list', async () => {
    server.rowsAbsent = true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    expect(
      (
        await screen.findAllByText(
          'This server cannot list these entries yet — open them from the knowledge base.'
        )
      ).length
    ).toBeGreaterThan(0);
  });

  it('no unhide route: nothing is approved behind the viewer — Approve is offered by name', async () => {
    server.unhideAbsent = true;
    renderPage();
    const row24 = await workRowEl(24);
    fireEvent.click(within(row24).getByRole('button', { name: /Unhide/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The entry was not changed.');
    expect(wire.calls('PATCH', '/api/knowledge-base/entries/24/approve')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve instead' }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/24/approve')).toHaveLength(1)
    );
  });

  it('no attach route: says the move is not available, nothing claimed', async () => {
    server.attach = 'absent';
    renderPage();
    const row21 = await workRowEl(21);
    await moveInto(row21);
    expect(
      await within(row21).findByText(
        'Moving an entry into a case is not available on this server yet.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Moved into case/)).not.toBeInTheDocument();
  });
});

// ---- in flight -------------------------------------------------------------------------------

describe('in-flight answers', () => {
  it('a slow report for the departments just left never lands on the new choice', async () => {
    let release: () => void = () => {};
    renderPage();
    await screen.findByText('Refunds take 5 days.');
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases' &&
      request.params.departmentIds === '4'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(screen.getByLabelText('Support EU'));
    await waitFor(() => expect(reportReads().at(-1)?.params.departmentIds).toBe('4'));
    // The viewer switches again before department 4 answered.
    fireEvent.click(screen.getByLabelText('Support EU'));
    fireEvent.click(screen.getByLabelText('Billing'));
    await waitFor(() => expect(reportReads().at(-1)?.params.departmentIds).toBe('7'));
    expect(await screen.findByText('refund for 7')).toBeInTheDocument();
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // The stale answer for department 4 lands last — Billing's report stays on screen.
    expect(screen.getByText('refund for 7')).toBeInTheDocument();
    expect(screen.queryByText('refund for 4')).not.toBeInTheDocument();
  });

  it('an action that answers after a department switch re-reads the departments shown NOW', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/entries/21/approve'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(within(row21).getByRole('button', { name: /Approve/ }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/21/approve')).toHaveLength(1)
    );
    fireEvent.click(screen.getByLabelText('Billing'));
    expect(await screen.findByText('refund for 7')).toBeInTheDocument();
    const reads = reportReads().length;
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(reads));
    // The re-read after the action is for Billing — never the scope the action was sent from.
    expect(reportReads().at(-1)?.params.departmentIds).toBe('7');
    expect(await screen.findByText('refund for 7')).toBeInTheDocument();
    expect(screen.queryByRole('status', { busy: true })).not.toBeInTheDocument();
  });

  it("a refused action's re-read of the row never overwrites a newer read of the list", async () => {
    server.mergedMeanwhile = new Set([21]);
    let gate: () => void = () => {};
    let held = false;
    wire.restore();
    wire = installTransport(apiClient, async (request) => {
      const ids = (request.body as { ids?: number[] } | undefined)?.ids;
      if (
        !held &&
        request.path === '/api/knowledge-base/consolidation/entries/rows' &&
        JSON.stringify(ids) === '[21]'
      ) {
        held = true;
        // Answered as the server is NOW, delivered later: an old answer.
        const answer = await handle(request);
        await new Promise<void>((resolve) => {
          gate = resolve;
        });
        return answer;
      }
      return handle(request);
    });
    renderPage();
    const row21 = await workRowEl(21);
    fireEvent.click(within(row21).getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(held).toBe(true));
    // Meanwhile someone approves it on its own, and the list is read again.
    server.mergedMeanwhile = new Set();
    server.entries.set(21, {
      ...(server.entries.get(21) as KbWorkRow),
      status: 'approved',
      caseId: null,
      casePublicId: null,
    });
    await chooseOption(screen.getByLabelText('Reason'), /^Raw email \(/);
    await waitFor(() =>
      expect(within(screen.getByTestId('work-row-21')).getByText('Approved')).toBeInTheDocument()
    );
    await act(async () => {
      gate();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(1));
    expect(within(screen.getByTestId('work-row-21')).getByText('Approved')).toBeInTheDocument();
  });

  it('an older backend and an org admin with NO department: says there is none to pick, no spinner forever', async () => {
    server.legacy = true;
    departments = [];
    renderPage();
    expect(
      await screen.findByText(
        'This server reports on one department at a time, and there is none to pick.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('status', { busy: true })).toBeNull();
  });

  it('a backend upgraded meanwhile: the single-department fallback returns to the department set', async () => {
    server.legacy = true;
    renderPage();
    expect(await screen.findByLabelText('Department')).toBeInTheDocument();
    server.legacy = false;
    await chooseOption(screen.getByLabelText('Department'), 'Billing');
    expect(await screen.findByLabelText('Support EU')).toBeInTheDocument();
    expect(screen.queryByText(/This server reports on one department/)).not.toBeInTheDocument();
    await waitFor(() => expect(reportReads().at(-1)?.params.departmentIds).toBe('7'));
  });
});
