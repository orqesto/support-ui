/**
 * KB cases worklist — members of a case, the page line, focus, audit round 2 (split from
 * KbCasesWorklist.test.tsx for size; same harness). KB cases worklist (F1–F5, gates G7/G8): the page against a fake WIRE under the REAL api-client.
 *
 * Nothing above the transport is mocked — not the service, not `apiClient` — so the interceptors
 * (org context header, error reshaping) and the service's parsing are what the page really gets.
 * The fake server keeps state: an action changes what the next report and rows read say.
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
import type { KbWorkRow } from '@/services/kbConsolidation.service';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
let departments = [
  { id: 4, name: 'Support EU' },
  { id: 7, name: 'Billing' },
];
let departmentOptions: unknown;
vi.mock('@/hooks/useDepartments', () => ({
  useDepartments: (options?: unknown) => {
    departmentOptions = options;
    return { data: departments, isLoading: false };
  },
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

// ---- members of a case (D3: merge / unmerge per entry) -----------------------------------------

describe('members of a case', () => {
  const openCase = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  };

  it('a member says it is served through the case and offers Remove from case, not approve / hide', async () => {
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    expect(within(row11).queryByRole('button', { name: /Approve|^Hide$|Unhide/ })).toBeNull();
    expect(
      within(row11).getByText(
        /^Merged into this case — it is served through the case, so it is not approved or hidden on its own/
      )
    ).toBeInTheDocument();
    expect(within(row11).getByRole('button', { name: /Remove from case/ })).toBeInTheDocument();
    expect(within(row11).getByRole('link', { name: /Open thread C-77/ })).toBeInTheDocument();
  });

  it('Remove from case: confirmed, POST detach, the row is Pending at once, leaves the case on re-read, focus goes to the next row', async () => {
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    const reads = reportReads().length;
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remove this entry from case #KB-900?');
    expect(dialog).toHaveTextContent('The case stays');
    // Hold the re-read: what the row says first is the page's own update.
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove from case' }));
    await waitFor(() =>
      expect(
        wire.calls('POST', '/api/knowledge-base/consolidation/cases/900/detach')[0]?.body
      ).toEqual({ entryIds: [11] })
    );
    expect(
      await screen.findByText('Removed from case #KB-900 — it is on its own again, pending review.')
    ).toBeInTheDocument();
    expect(within(row11).getByText('Pending')).toBeInTheDocument();
    server.hold = undefined;
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(reads));
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: /^Entries of Case/ })).queryByTestId('work-row-11')
      ).toBeNull()
    );
    // It leaves the case and comes back in "Not in any case", labelled as taken out by hand.
    const setAside = screen.getByRole('region', { name: 'Entries not in any case' });
    const back = await within(setAside).findByTestId('work-row-11');
    expect(within(back).getByText('Removed from a case')).toBeInTheDocument();
    expect(
      within(back).getByText(/Taken out of its case by hand — it needs a decision/)
    ).toBeInTheDocument();
    expect(within(back).getByRole('button', { name: /Approve/ })).toBeInTheDocument();
    expect(within(back).getByRole('button', { name: /Move into case/ })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('work-row-12')));
    // Now the case's only entry: not offered for removal, and it says why.
    const row12 = screen.getByTestId('work-row-12');
    expect(within(row12).queryByRole('button', { name: /Remove from case/ })).toBeNull();
    expect(
      within(row12).getByText(
        'The case’s only entry — a case cannot be left empty. To dissolve it, use Split case on the case’s own row.'
      )
    ).toBeInTheDocument();
  });

  it('Remove refused as the last member (409): says a case cannot be left empty, points to Unmerge', async () => {
    server.detach = 'conflict';
    server.detachReason = 'last_member';
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    expect(
      await within(row11).findByText(
        'Not removed from case #KB-900: it is the case’s only entry, and a case cannot be left empty. To dissolve it, use Split case on the case’s own row.'
      )
    ).toBeInTheDocument();
  });

  it('a hidden detached entry keeps the KB wording (its thread moved); no "taken out by hand" claim', async () => {
    renderPage();
    const row24 = await workRowEl(24);
    // BE: hiding a hand-detached entry ENDS "detached" — so hidden + detached is only ever a
    // thread that moved to another mailbox.
    expect(within(row24).getByText('detached from a case')).toHaveAttribute(
      'title',
      'Its thread moved to another mailbox, so it left the case. It stays hidden.'
    );
    expect(within(row24).queryByText('Removed from a case')).toBeNull();
    expect(within(row24).queryByText(/Taken out of its case by hand/)).toBeNull();
  });

  it('hiding an entry taken out by hand drops it from "Not in any case"', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    const section = screen.getByRole('region', { name: 'Entries not in any case' });
    const back = await within(section).findByTestId('work-row-11');
    fireEvent.click(within(back).getByRole('button', { name: /^Hide$/ }));
    await waitFor(() => expect(within(section).queryByTestId('work-row-11')).toBeNull());
  });

  it('Remove refused (409): says why in the row', async () => {
    server.detach = 'conflict';
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    expect(
      await within(row11).findByText('Not removed from case #KB-900: it is no longer in that case.')
    ).toBeInTheDocument();
  });

  it('no detach route: says so and points at Unmerge; nothing claimed', async () => {
    server.detach = 'absent';
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    expect(
      await within(row11).findByText(
        'Taking one entry out of a case is not available on this server yet — Split case undoes the whole case.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Removed from case/)).not.toBeInTheDocument();
  });

  it('a 200 that does not say what it removed: the row is read again, never assumed', async () => {
    server.detach = 'unsaid';
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    const before = rowReads().length;
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    expect(await screen.findByText('Removed from case #KB-900.')).toBeInTheDocument();
    expect(
      rowReads()
        .slice(before)
        .some((read) => JSON.stringify((read.body as { ids: number[] }).ids) === '[11]')
    ).toBe(true);
  });

  it('a 200 that removed nothing (the row is still in the case) says so, never "Removed"', async () => {
    server.detach = 'noop';
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    expect(
      await within(row11).findByText('Not removed from case #KB-900: it is still in the case.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Removed from case/)).toBeNull();
  });

  it('Remove refused for a rejected member (409): says to approve it first', async () => {
    server.entries.set(11, { ...(server.entries.get(11) as KbWorkRow), status: 'rejected' });
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    expect(
      await within(row11).findByText(
        'Not removed from case #KB-900: it is rejected — approve it first, then remove it from the case.'
      )
    ).toBeInTheDocument();
  });

  it('a member the viewer cannot take out says who can', async () => {
    server.entries.set(11, { ...(server.entries.get(11) as KbWorkRow), canDecide: false });
    renderPage();
    await openCase();
    const row11 = await workRowEl(11);
    expect(within(row11).queryByRole('button', { name: /Remove from case/ })).toBeNull();
    expect(
      within(row11).getByText(
        /Only a moderator of every department the case serves can remove it\./
      )
    ).toBeInTheDocument();
  });
});

// ---- audit round 2 -------------------------------------------------------------------------------

describe('audit round 2', () => {
  it('a pending entry with no clear language says it is also in the below-the-bar count', async () => {
    server.entries.set(42, workRow({ id: 42, status: 'pending' }));
    server.reasons.set(42, 'no_clear_language');
    renderPage();
    expect(
      within(await workRowEl(42)).getByText(
        'Not approved, so it is also counted among the answers below the quality bar.'
      )
    ).toBeInTheDocument();
  });

  it('inactive departments are listed, labelled, so ticking every box is "all"', async () => {
    departments = [
      { id: 4, name: 'Support EU' },
      { id: 7, name: 'Billing' },
      { id: 9, name: 'Old desk', active: false } as never,
    ];
    renderPage();
    expect(await screen.findByLabelText('Old desk (inactive)')).toBeInTheDocument();
    expect(departmentOptions).toEqual({ includeInactive: true });
  });

  it('the line about a move clears on the next action', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    await moveInto(row21);
    expect(await screen.findByText('Moved into case #KB-900.')).toBeInTheDocument();
    fireEvent.click(within(await workRowEl(22)).getByRole('button', { name: /Approve/ }));
    await waitFor(() =>
      expect(screen.queryByText('Moved into case #KB-900.')).not.toBeInTheDocument()
    );
  });

  it('Hide a set-aside row: it leaves the list and focus moves to the next row', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    const hide = within(row21).getByRole('button', { name: /^Hide$/ });
    hide.focus();
    fireEvent.click(hide);
    await waitFor(() => expect(screen.queryByTestId('work-row-21')).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('work-row-22')));
  });
});

describe('audit round 2 — the page line and focus', () => {
  const unmergeCase = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    fireEvent.click(within(await workRowEl(900)).getByRole('button', { name: /Split case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Split case' })
    );
    return screen.findByText(/^Case unmerged\./);
  };

  it('after an Unmerge the case is gone and focus lands on the line that says so', async () => {
    renderPage();
    const line = await unmergeCase();
    await waitFor(() => expect(screen.queryByRole('link', { name: /Case #KB-900/ })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('page-notice')));
    expect(screen.getByTestId('page-notice')).toContainElement(line);
  });

  it("the page's line clears when the sort changes", async () => {
    renderPage();
    await unmergeCase();
    await chooseOption(screen.getByLabelText('Sort'), 'Most recently seen');
    await waitFor(() => expect(screen.queryByText(/^Case unmerged\./)).toBeNull());
  });

  it("the page's line clears on the next row action", async () => {
    renderPage();
    await unmergeCase();
    fireEvent.click(within(await workRowEl(22)).getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(screen.queryByText(/^Case unmerged\./)).toBeNull());
  });

  it('focus is never pulled back from where the viewer moved it', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(within(row21).getByRole('button', { name: /^Hide$/ }));
    await waitFor(() =>
      expect(wire.calls('PATCH', '/api/knowledge-base/entries/21/hide')).toHaveLength(1)
    );
    const search = screen.getByPlaceholderText('Search questions');
    search.focus();
    server.hold = undefined;
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(screen.queryByTestId('work-row-21')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(search);
  });

  it('more matching TOPICS than one read: says only the first 100 topics are searched', async () => {
    server.casesPages = 3;
    renderPage();
    fireEvent.click(within(await workRowEl(21)).getByRole('button', { name: /Move into case/ }));
    expect(
      await within(await screen.findByRole('dialog')).findByText(
        'Only the first 100 topics are searched — narrow the search.'
      )
    ).toBeInTheDocument();
  });
});

describe('audit round 3 — lines and focus that outlive their list', () => {
  it('moving the LAST row of the set-aside list: the line stays, focus goes to the heading', async () => {
    renderPage();
    await workRowEl(21);
    await chooseOption(screen.getByLabelText('Reason'), /^Raw email \(/);
    await waitFor(() => expect(screen.queryByTestId('work-row-22')).toBeNull());
    await moveInto(screen.getByTestId('work-row-21'));
    const section = screen.getByRole('region', { name: 'Entries not in any case' });
    await waitFor(() => expect(within(section).queryByTestId('work-row-21')).toBeNull());
    expect(within(section).getByText('Moved into case #KB-900.')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(section).getByRole('heading', { name: /Not in any case/ })
      )
    );
  });

  it('a re-sort of topics on the re-read keeps an open case mounted: its line survives', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const row11 = await workRowEl(11);
    server.prependTopic = true;
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    await waitFor(() => expect(screen.getByText('billing questions')).toBeInTheDocument());
    expect(
      screen.getByText('Removed from case #KB-900 — it is on its own again, pending review.')
    ).toBeInTheDocument();
  });

  it('a re-sort of cases inside a topic keeps an open case mounted: its line survives', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const row11 = await workRowEl(11);
    server.reverseRows = true;
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: /^Entries of Case/ })).queryByTestId('work-row-11')
      ).toBeNull()
    );
    expect(
      screen.getByText('Removed from case #KB-900 — it is on its own again, pending review.')
    ).toBeInTheDocument();
  });

  it("without the server's member count, no last-member claim and no count in Unmerge", async () => {
    server.olderCaseRows = true;
    server.entries.set(12, {
      ...(server.entries.get(12) as KbWorkRow),
      caseId: null,
      casePublicId: null,
    });
    renderPage();
    // The first is case KB-900's (a single answer below also has one entry).
    fireEvent.click((await screen.findAllByRole('button', { name: 'Show entries (1)' }))[0]);
    const row11 = await workRowEl(11);
    expect(within(row11).getByRole('button', { name: /Remove from case/ })).toBeInTheDocument();
    expect(within(row11).queryByText(/only entry/)).toBeNull();
    fireEvent.click(within(await workRowEl(900)).getByRole('button', { name: /Split case/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'the case entry is removed and its original entries come back on their own'
    );
  });

  it('an action whose row stays lets go of it: a later re-read never steals focus', async () => {
    renderPage();
    const row22 = await workRowEl(22);
    fireEvent.click(within(row22).getByRole('button', { name: /Approve/ }));
    await waitFor(() => expect(within(row22).getByText('Approved')).toBeInTheDocument());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    (document.activeElement as HTMLElement | null)?.blur();
    // Later, 22 leaves the list on a re-read the viewer did not start with a row action.
    server.entries.set(22, { ...(server.entries.get(22) as KbWorkRow), status: 'rejected' });
    await chooseOption(screen.getByLabelText('Sort'), 'Most recently seen');
    await waitFor(() => expect(screen.queryByTestId('work-row-22')).toBeNull());
    expect(document.activeElement).toBe(document.body);
  });

  it('a refused removal puts focus back on its Remove button', async () => {
    server.detach = 'conflict';
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    await within(row11).findByText(/^Not removed from case #KB-900/);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(row11).getByRole('button', { name: /Remove from case/ })
      )
    );
  });

  it('a refused move puts focus back on its Move button', async () => {
    server.attach = 'conflict';
    renderPage();
    const row21 = await workRowEl(21);
    await moveInto(row21);
    await within(row21).findByText(/^Not moved into case #KB-900/);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(row21).getByRole('button', { name: /Move into case/ })
      )
    );
  });

  it("the set-aside line clears on an action in a case's list", async () => {
    renderPage();
    await moveInto(await workRowEl(21));
    const section = screen.getByRole('region', { name: 'Entries not in any case' });
    expect(await within(section).findByText('Moved into case #KB-900.')).toBeInTheDocument();
    // Case KB-900 (first) now holds 3 entries: 21 joined it.
    fireEvent.click((await screen.findAllByRole('button', { name: /^Show entries/ }))[0]);
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    await waitFor(() => expect(screen.queryByText('Moved into case #KB-900.')).toBeNull());
  });

  it('the set-aside line clears when the viewer re-sorts the report', async () => {
    renderPage();
    await moveInto(await workRowEl(21));
    expect(await screen.findByText('Moved into case #KB-900.')).toBeInTheDocument();
    await chooseOption(screen.getByLabelText('Sort'), 'Most recently seen');
    await waitFor(() => expect(screen.queryByText('Moved into case #KB-900.')).toBeNull());
  });

  it('moving the LAST entry set aside anywhere: the section stays with its line, focus on its heading', async () => {
    server.reasons = new Map([[21, 'raw_email']]);
    renderPage();
    await moveInto(await workRowEl(21));
    const section = await screen.findByRole('region', { name: 'Entries not in any case' });
    expect(await within(section).findByText('No entry is set aside now.')).toBeInTheDocument();
    expect(within(section).getByText('Moved into case #KB-900.')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(section).getByRole('heading', { name: /Not in any case/ })
      )
    );
  });

  it('an entry awaiting its KB review is not offered Move, and says why', async () => {
    renderPage();
    const row22 = await workRowEl(22);
    expect(within(row22).queryByRole('button', { name: /Move into case/ })).toBeNull();
    expect(
      within(row22).getByText(
        'Its KB review is still open — decide that review first, then it can join a case.'
      )
    ).toBeInTheDocument();
  });

  it('a move refused as under review names the KB review, not a merge suggestion', async () => {
    server.attach = 'conflict';
    server.attachReason = 'under_review';
    renderPage();
    const row21 = await workRowEl(21);
    await moveInto(row21);
    expect(
      await within(row21).findByText(
        'Not moved into case #KB-900: it has an open KB review — decide that review first.'
      )
    ).toBeInTheDocument();
  });

  it("a case list's own line clears on its next action", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2)' }));
    const row11 = await workRowEl(11);
    fireEvent.click(within(row11).getByRole('button', { name: /Remove from case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove from case' })
    );
    const line = 'Removed from case #KB-900 — it is on its own again, pending review.';
    expect(await screen.findByText(line)).toBeInTheDocument();
    // Next action in the same list (held in flight): the old line is gone at once.
    let release: () => void = () => {};
    server.hold = (request) =>
      request.path === '/api/knowledge-base/consolidation/cases/900/unmerge'
        ? new Promise<void>((resolve) => {
            release = resolve;
          })
        : null;
    fireEvent.click(within(await workRowEl(900)).getByRole('button', { name: /Split case/ }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Split case' })
    );
    await waitFor(() => expect(screen.queryByText(line)).toBeNull());
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});
