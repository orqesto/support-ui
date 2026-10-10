/**
 * KB cases worklist — audit round 5: edits that re-group, proposed members, a dead case, the
 * search term cap (same harness as KbCasesWorklistActions.test.tsx). KB cases worklist (F1–F5, gates G7/G8): the page against a fake WIRE under the REAL api-client.
 *
 * Nothing above the transport is mocked — not the service, not `apiClient` — so the interceptors
 * (org context header, error reshaping) and the service's parsing are what the page really gets.
 * The fake server keeps state: an action changes what the next report and rows read say.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ROUTER_FUTURE } from '@/test/routerFuture';
import { apiClient } from '@/lib/api-client';
import { installTransport } from '@/test/apiTransport';
import { handle, LONG_QUESTION, resetServer, server } from '@/test/kbWorklistServer';
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
const workRowEl = (id: number) => screen.findByTestId(`work-row-${id}`);


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

describe('audit round 5', () => {
  it('editing a set-aside entry keeps it listed as "Being re-grouped" (newer backend)', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    fireEvent.click(within(row21).getByRole('button', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Question'), {
      target: { value: 'Where is my order?' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(within(row21).getByText('Being re-grouped')).toBeInTheDocument());
    expect(
      within(row21).getByText(
        'Being re-grouped — it appears in a case after the next grouping run (or Run now).'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/it leaves this list/)).toBeNull();
  });

  it('an older backend drops an edited entry from the list: the list SAYS so, not a silent vanish', async () => {
    server.noClassifying = true;
    renderPage();
    const row21 = await workRowEl(21);
    fireEvent.click(within(row21).getByRole('button', { name: /Edit/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Question'), {
      target: { value: 'Where is my order?' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByTestId('work-row-21')).toBeNull());
    expect(
      screen.getByText('Saved — it leaves this list until the next grouping run places it.')
    ).toBeInTheDocument();
  });

  it('an entry PROPOSED for a case is labelled, links to Merges, offers nothing else, and is counted apart', async () => {
    server.pendingAttach = new Map([[22, 7001]]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Show entries (2, 1 proposed)' }));
    const row22 = await workRowEl(22);
    expect(within(row22).getByText('Proposed to join')).toBeInTheDocument();
    expect(within(row22).getByText(/merge suggestion #7001/)).toBeInTheDocument();
    expect(within(row22).getByRole('link', { name: 'review it in Merges' })).toHaveAttribute(
      'href',
      '/knowledge-base/merges?tab=merges&suggestion=7001'
    );
    expect(within(row22).queryAllByRole('button')).toHaveLength(0);
    // Not a member: the members are still the case's own two.
    expect(
      within(await workRowEl(11)).getByRole('button', { name: /Remove from case/ })
    ).toBeInTheDocument();
  });

  it('a move into a case that was unmerged meanwhile (JSON 404) re-reads the report', async () => {
    renderPage();
    const row21 = await workRowEl(21);
    fireEvent.click(within(row21).getByRole('button', { name: /Move into case/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: /Case #KB-900/ }));
    // Someone unmerges KB-900 before this move lands.
    server.entries.delete(900);
    const reads = reportReads().length;
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move' })
    );
    expect(await within(row21).findByText(/^Not moved into case #KB-900/)).toBeInTheDocument();
    await waitFor(() => expect(reportReads().length).toBeGreaterThan(reads));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Case #KB-900/ })).toBeNull());
  });

  it('the picker reads the search term as the server does: at most 200 characters', async () => {
    server.longQuestion = true;
    renderPage();
    fireEvent.click(within(await workRowEl(21)).getByRole('button', { name: /Move into case/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /Case #KB-900/ });
    // The first 200 characters are the long case's question; what follows is past the cap.
    fireEvent.change(within(dialog).getByLabelText('Find a case'), {
      target: { value: `${LONG_QUESTION.slice(0, 200)} and more words` },
    });
    expect(
      await within(dialog).findByRole('button', { name: /Case #KB-4000/ })
    ).toBeInTheDocument();
  });
});
