/**
 * KB cases worklist — the Move-into-case picker (split from KbCasesWorklistActions.test.tsx for
 * size; same harness). KB cases worklist (F1–F5, gates G7/G8): the page against a fake WIRE under the REAL api-client.
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
import { handle, resetServer, server } from '@/test/kbWorklistServer';
import type { KbWorkRow } from '@/services/kbConsolidation.service';
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

describe('audit round 2 — the move picker', () => {
  it('an entry with no scope is not offered Move, and says why', async () => {
    server.entries.set(21, { ...(server.entries.get(21) as KbWorkRow), scopeKey: '' });
    renderPage();
    const row21 = await workRowEl(21);
    expect(within(row21).queryByRole('button', { name: /Move into case/ })).toBeNull();
    expect(
      within(row21).getByText(
        'It belongs to no mailbox or department, so it cannot be moved into a case.'
      )
    ).toBeInTheDocument();
  });

  it('a case of a matched TOPIC that does not match itself is neither offered nor counted', async () => {
    renderPage();
    fireEvent.click(within(await workRowEl(21)).getByRole('button', { name: /Move into case/ }));
    const dialog = await screen.findByRole('dialog');
    // No search: KB-950 (another scope) is counted as left out.
    expect(
      await within(dialog).findByText(
        '1 matching case serves another mailbox or department and is not offered.'
      )
    ).toBeInTheDocument();
    // "refunds" matches KB-900's question; the server returns its whole topic, KB-950 included —
    // which does not match "refunds", so it is not counted.
    fireEvent.change(within(dialog).getByLabelText('Find a case'), {
      target: { value: 'refunds' },
    });
    expect(await within(dialog).findByRole('button', { name: /Case #KB-900/ })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByText(/serves another mailbox/)).toBeNull());
  });

  it("a backend that searches case numbers: the server's exact rule, and the field says so", async () => {
    server.numberCases = true;
    renderPage();
    fireEvent.click(within(await workRowEl(21)).getByRole('button', { name: /Move into case/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /Case #KB-900/ });
    const field = within(dialog).getByLabelText('Find a case');
    expect(field).toHaveAttribute(
      'placeholder',
      'Exact case number, or words of a question or topic'
    );
    const offered = async (asked: string, name: RegExp) => {
      fireEvent.change(field, { target: { value: asked } });
      expect(await within(dialog).findByRole('button', { name })).toBeInTheDocument();
    };
    // Case id 77 is KB-1200: its public number, with or without prefix, '#', leading zeros.
    for (const asked of ['1200', '01200', 'KB-1200', 'kb-01200', '#1200', ' KB-1200 ']) {
      await offered(asked, /Case #KB-1200/);
      // KB-5's INTERNAL id is 1200 — but it has a public number, so "1200" is not it; and the
      // topic's other cases (KB-900) are not what was asked.
      expect(within(dialog).queryByRole('button', { name: /Case #KB-5\b/ })).toBeNull();
      expect(within(dialog).queryByRole('button', { name: /Case #KB-900/ })).toBeNull();
      // KB-11200 is in the topic the server returned, and its number only CONTAINS 1200.
      expect(within(dialog).queryByRole('button', { name: /Case #KB-11200/ })).toBeNull();
    }
    for (const asked of ['900', '0900', 'KB-0900', '#900']) await offered(asked, /Case #KB-900/);
    // A case with no public number is found by its id.
    await offered('88', /Case #88/);
    await offered('#88', /Case #88/);
    // A part of a number is not a number.
    fireEvent.change(field, { target: { value: '120' } });
    expect(
      await within(dialog).findByText(/No case of this entry's scope matches “120”/)
    ).toBeInTheDocument();
  });

  it('an older backend: the field does not promise case numbers', async () => {
    server.olderCaseRows = true;
    renderPage();
    fireEvent.click(within(await workRowEl(21)).getByRole('button', { name: /Move into case/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('button', { name: /Case #KB-900/ });
    expect(within(dialog).getByLabelText('Find a case')).toHaveAttribute(
      'placeholder',
      'Words of a question or topic'
    );
  });

  it('"all departments": the picker sends no department list', async () => {
    renderPage();
    fireEvent.click(within(await workRowEl(21)).getByRole('button', { name: /Move into case/ }));
    await within(await screen.findByRole('dialog')).findByRole('button', { name: /Case #KB-900/ });
    const pickerRead = reportReads().find((read) => read.params.pageSize === '100');
    expect(pickerRead?.params.departmentIds).toBeUndefined();
  });

  it('an older backend that does not say the scope: every case offered, no scope claimed', async () => {
    for (const [id, entry] of server.entries) {
      const { scopeKey: _dropped, ...older } = entry;
      server.entries.set(id, older);
    }
    renderPage();
    fireEvent.click(within(await workRowEl(21)).getByRole('button', { name: /Move into case/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: /Case #KB-950/ })).toBeInTheDocument();
    expect(within(dialog).queryByText(/this entry’s own mailbox/)).toBeNull();
    expect(
      within(dialog).getByText(
        'Cases in the departments shown. Only a case of the entry’s own mailbox or department accepts it.'
      )
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Find a case'), {
      target: { value: 'nothing like it' },
    });
    expect(
      await within(dialog).findByText('No case matches “nothing like it”.')
    ).toBeInTheDocument();
  });
});
