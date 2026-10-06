/**
 * KB cases worklist (F1–F5, gates G7/G8): the page against a fake WIRE under the REAL api-client.
 *
 * Nothing above the transport is mocked — not the service, not `apiClient` — so the interceptors
 * (org context header, error reshaping) and the service's parsing are what the page really gets.
 * The fake server keeps state: an action changes what the next report and rows read say.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { apiClient } from '@/lib/api-client';
import { installTransport, ok, type WireRequest } from '@/test/apiTransport';
import { handle, resetServer, server, workRow, type reportNow } from '@/test/kbWorklistServer';
import { useAuthStore } from '@/stores/authStore';

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
let orgAdmin = true;
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isOrgAdmin: orgAdmin }),
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
  orgAdmin = true;
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

// ---- F1: departments -------------------------------------------------------------------------

describe('F1 departments', () => {
  it('reports every department the viewer can see by default — no department sent, through the real client', async () => {
    renderPage();
    expect(await screen.findByText('Refunds take 5 days.')).toBeInTheDocument();
    const [first] = reportReads();
    expect(first.params.departmentId).toBeUndefined();
    expect(first.params.departmentIds).toBeUndefined();
    // The real request interceptor ran: the workspace header is on the wire.
    expect(first.headers['X-Organization-Context']).toBe('42');
    // Org-level viewer, nothing ticked: the server says "all" took in unlinked mailboxes too.
    expect(
      await screen.findByText('Showing every department, and mailboxes linked to no department')
    ).toBeInTheDocument();
  });

  it('an org admin in a workspace with NO department still gets the report (org-wide, unlinked mailboxes)', async () => {
    departments = [];
    renderPage();
    expect(await screen.findByText('Refunds take 5 days.')).toBeInTheDocument();
    expect(reportReads()[0].params.departmentIds).toBeUndefined();
    expect(screen.queryByText('You have no department to report on.')).toBeNull();
    expect(
      screen.getByText(
        'No department in this workspace — showing everything you can see, including mailboxes linked to no department.'
      )
    ).toBeInTheDocument();
  });

  it('a department moderator with no department: nothing requested, and it says so', async () => {
    orgAdmin = false;
    departments = [];
    renderPage();
    expect(await screen.findByText('You have no department to report on.')).toBeInTheDocument();
    expect(reportReads()).toHaveLength(0);
  });

  it('"all" for a department moderator (server: no unlinked mailboxes) says departments only', async () => {
    server.departmentViewer = true;
    renderPage();
    expect(await screen.findByText('Showing all departments you can see')).toBeInTheDocument();
    expect(screen.queryByText(/mailboxes linked to no department/)).toBeNull();
  });

  it('ticking departments narrows the report and keeps the choice in the URL', async () => {
    renderPage();
    await screen.findByText('Refunds take 5 days.');
    fireEvent.click(screen.getByLabelText('Billing'));
    await waitFor(() => expect(reportReads().at(-1)?.params.departmentIds).toBe('7'));
    expect(screen.getByTestId('location')).toHaveTextContent('?departments=7');
    fireEvent.click(screen.getByLabelText('Support EU'));
    // In the order the departments are listed, whatever order they were ticked in.
    await waitFor(() => expect(reportReads().at(-1)?.params.departmentIds).toBe('4,7'));
    expect(screen.getByTestId('location')).toHaveTextContent('?departments=4%2C7');
    fireEvent.click(screen.getByRole('button', { name: 'Clear the filter' }));
    await waitFor(() => expect(reportReads().at(-1)?.params.departmentIds).toBeUndefined());
    expect(screen.getByTestId('location')).toHaveTextContent(/^$/);
  });

  it('a URL choice is restored on load; a department the viewer cannot see is never requested', async () => {
    renderPage('/knowledge-base/cases?departments=7,99');
    await screen.findByText('Refunds take 5 days.');
    expect(screen.getByLabelText('Billing')).toBeChecked();
    expect(screen.getByLabelText('Support EU')).not.toBeChecked();
    expect(reportReads().every((read) => read.params.departmentIds === '7')).toBe(true);
  });
});

// ---- F2: cases expand, set-aside rows --------------------------------------------------------

describe('F2 the list', () => {
  it('a case expands (aria-expanded) and reads its entries — its own entry first — by id', async () => {
    renderPage();
    const toggle = await screen.findByRole('button', { name: 'Show entries (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const before = rowReads().length;
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')).not.toBeNull();
    const caseRow = await workRowEl(900);
    expect(
      rowReads()
        .slice(before)
        .map((read) => read.body)
    ).toContainEqual({ ids: [900, 11, 12] });
    expect(within(caseRow).getByText('This case')).toBeInTheDocument();
    // The status reads as the KB list reads it: the case is Approved · Case; its originals are
    // "merged into" it (never "Hidden"), with nothing to approve or hide on them.
    expect(within(caseRow).getByText('Approved')).toBeInTheDocument();
    expect(within(caseRow).getByText('Case')).toBeInTheDocument();
    const member = await workRowEl(11);
    expect(within(member).getByText('merged into #KB-900')).toBeInTheDocument();
    expect(within(member).queryByText('Hidden')).not.toBeInTheDocument();
    for (const name of [/Approve/, /Hide/, /Unhide/, /Reject/, /Edit/, /Move into case/])
      expect(within(member).queryByRole('button', { name })).not.toBeInTheDocument();
  });

  it('Open thread links the conversation the answer was learned from, as the app links threads', async () => {
    server.orgCode = 'ACM';
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const named = await workRowEl(11);
    // getConvUrlId: the org-scoped public id when there is one (as every thread link here).
    await waitFor(() =>
      expect(within(named).getByRole('link', { name: /Open thread C-77/ })).toHaveAttribute(
        'href',
        '/messages?id=ACM-C-77'
      )
    );
    const unnamed = await workRowEl(12);
    expect(within(unnamed).getByRole('link', { name: /Open thread #5002/ })).toHaveAttribute(
      'href',
      '/messages?id=5002'
    );
    // No conversation resolved ⇒ no link, never a guessed one.
    expect(
      within(await workRowEl(900)).queryByRole('link', { name: /Open thread/ })
    ).not.toBeInTheDocument();
  });

  it('set-aside entries are rows with a reason badge, filterable by reason', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Not in any case (4)' })).toBeInTheDocument();
    expect(within(await workRowEl(21)).getByText('Raw email')).toBeInTheDocument();
    expect(within(await workRowEl(22)).getByText('Awaiting KB review')).toBeInTheDocument();
    expect(within(await workRowEl(23)).getByText('Customer-specific')).toBeInTheDocument();
    expect(within(await workRowEl(24)).getByText('detached from a case')).toBeInTheDocument();
    // Listed as rows — not counted a second time in the findings panel.
    expect(screen.queryByRole('list', { name: 'Findings' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'raw_email' } });
    await waitFor(() => expect(screen.queryByTestId('work-row-22')).not.toBeInTheDocument());
    expect(screen.getByTestId('work-row-21')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Raw email (1)' })).toBeInTheDocument();
  });

  it('an approved entry with no clear language says it is ALSO a single answer; a pending one does not', async () => {
    server.entries.set(41, workRow({ id: 41, status: 'approved' }));
    server.entries.set(42, workRow({ id: 42, status: 'pending' }));
    server.reasons.set(41, 'no_clear_language');
    server.reasons.set(42, 'no_clear_language');
    renderPage();
    const also = 'Approved, so it is also listed among the cases as a single learned answer.';
    expect(within(await workRowEl(41)).getByText(also)).toBeInTheDocument();
    expect(within(await workRowEl(42)).queryByText(also)).not.toBeInTheDocument();
  });

  it('a row with no question or title is named by its own reference', async () => {
    server.entries.set(
      21,
      workRow({ id: 21, question: null, title: '  ', publicId: 'KB-21', status: 'pending' })
    );
    renderPage();
    expect(
      within(await workRowEl(21)).getByRole('link', { name: 'Entry #KB-21' })
    ).toBeInTheDocument();
  });

  it('with a search, the set-aside list says the search does not narrow it', async () => {
    renderPage();
    const note = /The search narrows the cases only, not this list\./;
    await workRowEl(21);
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search questions'), {
      target: { value: 'refunds' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(note)).toBeInTheDocument();
    expect(await workRowEl(21)).toBeInTheDocument();
  });

  it('set-aside rows are read a page at a time, never all at once', async () => {
    for (let id = 1000; id < 1060; id += 1) {
      server.entries.set(id, workRow({ id }));
      server.reasons.set(id, 'unclassified');
    }
    renderPage();
    await workRowEl(21);
    const asked = rowReads().map((read) => (read.body as { ids: number[] }).ids.length);
    expect(Math.max(...asked)).toBeLessThanOrEqual(25);
    // Page 2 reads (and shows) the NEXT 25, not the first ones again.
    fireEvent.click(screen.getByRole('button', { name: /^2$/ }));
    expect(await workRowEl(1030)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('work-row-21')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Not in any case (64)' })).toBeInTheDocument();
  });
});

describe('F2 layout', () => {
  it("the cases' page control sits under the cases, above the set-aside list", async () => {
    server.casesPages = 3;
    renderPage();
    const heading = await screen.findByRole('heading', { name: /Not in any case/ });
    const pageTwo = screen.getByRole('button', { name: /^2$/ });
    // DOCUMENT_POSITION_FOLLOWING: the heading comes after the cases' page control.
    expect(
      pageTwo.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    fireEvent.click(pageTwo);
    await waitFor(() => expect(reportReads().at(-1)?.params.page).toBe('2'));
  });
});

describe('F2 empty states', () => {
  const emptyServer = (setAside: boolean) => {
    server.entries = new Map(setAside ? [[21, workRow({ id: 21 })]] : []);
    server.reasons = new Map(setAside ? [[21, 'raw_email' as const]] : []);
  };
  const withNoCases = () => {
    const original = handle;
    return async (request: WireRequest) => {
      const answer = await original(request);
      if (request.path === '/api/knowledge-base/consolidation/cases' && answer.status === 200) {
        const data = (answer.data as { data: ReturnType<typeof reportNow> }).data;
        return ok({ ...data, headers: [], footer: { belowQualityBar: 0 } });
      }
      return answer;
    };
  };

  it('no case, set-aside rows listed ⇒ says they are listed below, and they are', async () => {
    emptyServer(true);
    wire.restore();
    wire = installTransport(apiClient, withNoCases());
    renderPage();
    expect(
      await screen.findByText(
        'No learned answer here forms a case yet — the entries set aside are listed below.'
      )
    ).toBeInTheDocument();
    expect(await workRowEl(21)).toBeInTheDocument();
  });

  it('no case and nothing set aside ⇒ never "listed below"', async () => {
    emptyServer(false);
    wire.restore();
    wire = installTransport(apiClient, withNoCases());
    renderPage();
    expect(await screen.findByText('No learned answers match here yet.')).toBeInTheDocument();
    expect(screen.queryByText(/listed below/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Not in any case/ })).not.toBeInTheDocument();
  });
});

// ---- F3: actions -----------------------------------------------------------------------------

describe('F3 row actions', () => {
  it('Approve: the request, the row at once, and the report re-read', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    const reads = reportReads().length;
    fireEvent.click(within(row21).getByRole('button', { name: /Approve/ }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/21/approve')).toHaveLength(1)
    );
    await waitFor(() => expect(within(row21).getByText('Approved')).toBeInTheDocument());
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(reads));
  });

  it('a double click sends ONE request', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    const approve = within(row21).getByRole('button', { name: /Approve/ });
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/entries/21/approve'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    // Both clicks land before React re-renders the button disabled (one act, no flush between).
    act(() => {
      approve.click();
      approve.click();
    });
    // While it is in flight every action on the list is locked, visibly — not only ignored.
    await waitFor(() =>
      expect(within(row21).getByRole('button', { name: /^Hide$/ })).toBeDisabled()
    );
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(within(row21).getByText('Approved')).toBeInTheDocument());
    expect(wire.calls('PATCH', '/api/knowledge-base/entries/21/approve')).toHaveLength(1);
  });

  it('Hide a raw email: the row leaves the set-aside list and the count drops, without a reload', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    fireEvent.click(within(row21).getByRole('button', { name: /^Hide$/ }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/21/hide')).toHaveLength(1)
    );
    expect(await screen.findByRole('heading', { name: 'Not in any case (3)' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('work-row-21')).not.toBeInTheDocument());
  });

  it('Reject: the row says Rejected AT ONCE (before the re-read answers), as the KB list words it', async () => {
    renderPage();
    const row22 = await workRowEl(22);
    // Hold the re-read: what the row says now is the page's own update, not the server's.
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(within(row22).getByRole('button', { name: /Reject/ }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/22/reject')).toHaveLength(1)
    );
    await waitFor(() =>
      expect(within(row22).getByText(/^Rejected · deleted after/)).toBeInTheDocument()
    );
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    // Rejected entries are no longer set aside: the re-read takes it off the list.
    await waitFor(() => expect(screen.queryByTestId('work-row-22')).not.toBeInTheDocument());
  });

  it('Unhide (F4): PATCH /unhide — never approve — and the row comes back as it was (pending)', async () => {
    renderPage();
    const row24 = await workRowEl(24);
    // Hold the re-read: the row says what the server restored, at once (it then leaves the list —
    // unhiding ends "detached").
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(within(row24).getByRole('button', { name: /Unhide/ }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/24/unhide')).toHaveLength(1)
    );
    expect(wire.calls('PATCH', '/api/knowledge-base/entries/24/approve')).toHaveLength(0);
    await waitFor(() => expect(within(row24).getByText('Pending')).toBeInTheDocument());
    server.hold = undefined;
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it('Edit: the full entry is read, the shared editor saves question + answer, the row and report update', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    fireEvent.click(within(row21).getByRole('button', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    expect(wire.calls('GET', '/api/knowledge-base/entries/21')).toHaveLength(1);
    fireEvent.change(within(dialog).getByLabelText('Question'), {
      target: { value: 'Where is my order?' },
    });
    fireEvent.change(within(dialog).getByLabelText('Answer'), {
      target: { value: 'Tracking is in the email.' },
    });
    const reads = reportReads().length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/21')).toHaveLength(1)
    );
    expect(wire.calls('PATCH', '/api/knowledge-base/entries/21')[0].body).toMatchObject({
      question: 'Where is my order?',
      answer: 'Tracking is in the email.',
    });
    await waitFor(() => expect(within(row21).getByText('Where is my order?')).toBeInTheDocument());
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(reads));
  });

  it('Move into case: searched on the server, same scope only, confirmed with the case answer, POST attach', async () => {
    renderPage('/knowledge-base/cases?departments=7');
    const row21 = await workRowEl(21);
    fireEvent.click(within(row21).getByRole('button', { name: /Move into case/ }));
    const dialog = await screen.findByRole('dialog');
    // Every case of the shown departments is searched — not this page's — and a case of another
    // scope (KB-950, source:2) is never offered, with a line saying one was left out.
    expect(await within(dialog).findByRole('button', { name: /Case #KB-900/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Case #KB-950/ })).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        '1 matching case serves another mailbox or department and is not offered.'
      )
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Find a case'), {
      target: { value: 'nothing like it' },
    });
    expect(
      await within(dialog).findByText("No case of this entry's scope matches “nothing like it”.")
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Find a case'), {
      target: { value: 'refunds' },
    });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Case #KB-900/ }));
    const searches = reportReads().filter((read) => read.params.search === 'refunds');
    expect(searches.at(-1)?.params).toMatchObject({
      departmentIds: '7',
      pageSize: '100',
      page: '1',
    });
    // The confirm step names the case and its answer, and how to undo.
    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent('Move into case #KB-900?');
    expect(confirm).toHaveTextContent('Case answer: Refunds take 5 days.');
    expect(confirm).toHaveTextContent('use Remove from case');
    expect(confirm).toHaveTextContent('the entry then comes back as Pending');
    expect(wire.calls('POST', '/api/knowledge-base/consolidation/cases/900/attach')).toHaveLength(
      0
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Move' }));
    await waitFor(() =>
      expect(
        wire.calls('POST', '/api/knowledge-base/consolidation/cases/900/attach')[0]?.body
      ).toEqual({ entryIds: [21] })
    );
    // Said next to the list it changed.
    const section = screen.getByRole('region', { name: 'Entries not in any case' });
    expect(await within(section).findByText('Moved into case #KB-900.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('work-row-21')).not.toBeInTheDocument());
  });

  it('Move refused (409): says why, entry stays', async () => {
    server.attach = 'conflict';
    renderPage();
    const row21 = await workRowEl(21);
    await moveInto(row21);
    const reads = reportReads().length;
    expect(
      await within(row21).findByText('Not moved into case #KB-900: it is already in a case.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('work-row-21')).toBeInTheDocument();
    // A refusal can mean the entry moved meanwhile: the report is read again.
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(reads));
  });

  it('Move refused for another scope: names that reason, not a generic one', async () => {
    server.attach = 'conflict';
    server.attachReason = 'other_scope';
    renderPage();
    const row21 = await workRowEl(21);
    await moveInto(row21);
    expect(
      await within(row21).findByText(
        'Not moved into case #KB-900: that case serves a different mailbox or department.'
      )
    ).toBeInTheDocument();
  });

  it('a row the server marks as a case is never offered Move or review actions', async () => {
    server.entries.set(21, workRow({ id: 21, ...server.entries.get(21), isCase: true }));
    renderPage();
    const row21 = await workRowEl(21);
    expect(within(row21).getByText('Case')).toBeInTheDocument();
    expect(within(row21).queryByRole('button', { name: /Move into case/ })).not.toBeInTheDocument();
    expect(within(row21).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
    fireEvent.click(within(row21).getByRole('button', { name: /Unmerge case/ }));
    // Its originals are not the rows listed around it: no count is claimed.
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'the case entry is removed and its original entries come back on their own'
    );
  });

  it('Unmerge the case (its own row): confirmed, POST unmerge, report re-read', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const caseRow = await workRowEl(900);
    fireEvent.click(within(caseRow).getByRole('button', { name: /Unmerge case/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('its 2 original entries come back on their own');
    const reads = reportReads().length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unmerge' }));
    await waitFor(() =>
      expect(
        wire.calls('POST', '/api/knowledge-base/consolidation/cases/900/unmerge')
      ).toHaveLength(1)
    );
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(reads));
  });

  it('neither right: no action, and the row says why — the thread link still is', async () => {
    for (const [id, entry] of server.entries)
      server.entries.set(id, { ...entry, canDecide: false, canModerate: false });
    renderPage();
    const row21 = await workRowEl(21);
    expect(within(row21).queryAllByRole('button')).toHaveLength(0);
    expect(
      within(row21).getByText('View only — you do not moderate this entry’s department.')
    ).toBeInTheDocument();
    expect(within(row21).getByRole('link', { name: /Open thread C-1/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const caseRow = await workRowEl(900);
    expect(within(caseRow).queryAllByRole('button')).toHaveLength(0);
    expect(
      within(caseRow).getByText(
        'Only a moderator of every department this case serves can unmerge it.'
      )
    ).toBeInTheDocument();
  });

  it('canModerate without canDecide: review actions yes, Move no — and it says why', async () => {
    for (const [id, entry] of server.entries)
      server.entries.set(id, { ...entry, canDecide: false, canModerate: true });
    renderPage();
    const row21 = await workRowEl(21);
    expect(within(row21).getByRole('button', { name: /Approve/ })).toBeInTheDocument();
    expect(within(row21).getByRole('button', { name: /^Hide$/ })).toBeInTheDocument();
    expect(within(row21).getByRole('button', { name: /Edit/ })).toBeInTheDocument();
    expect(within(row21).queryByRole('button', { name: /Move into case/ })).not.toBeInTheDocument();
    expect(
      within(row21).getByText(
        'Moving it into a case needs a moderator of every department its source serves.'
      )
    ).toBeInTheDocument();
  });

  it('an older backend without canModerate: review actions follow canDecide', async () => {
    for (const [id, entry] of server.entries) {
      const { canModerate: _dropped, ...older } = entry;
      server.entries.set(id, { ...older, canDecide: false });
    }
    renderPage();
    const row21 = await workRowEl(21);
    expect(within(row21).queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
  });

  it('Reject shows its own spinner while it runs; the other actions are locked', async () => {
    renderPage();
    const row22 = await workRowEl(22);
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/entries/22/reject'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(within(row22).getByRole('button', { name: /Reject/ }));
    await waitFor(() =>
      expect(within(row22).queryByRole('button', { name: /Reject/ })).not.toBeInTheDocument()
    );
    expect(within(row22).getByRole('button', { name: /Approve/ })).toBeDisabled();
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});
