/**
 * The URL decides the workspace — not the recipient's last-used one.
 *
 * ⛔ The defect: `/messages?id=MKT-170` carried no workspace, so it resolved against
 * `selectedOrganizationId` persisted in whoever opened it. Public ids are unique per ORG and
 * the counter is per department, so two workspaces with an `MKT` department both mint
 * `MKT-1`, `MKT-2`, … On prod `INF` and `SUP` each exist in six workspaces and 54 ids
 * already resolve in more than one — so the wrong workspace opens a DIFFERENT REAL
 * conversation rather than failing.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const myOrganizations = vi.fn<() => Promise<{ id: number; name: string; slug: string }[]>>();
const getAll =
  vi.fn<(...args: unknown[]) => Promise<{ data: { id: number; name: string; slug: string }[] }>>();
vi.mock('@/services/auth.service', () => ({
  authService: { myOrganizations: () => myOrganizations() },
}));
vi.mock('@/services/organization.service', () => ({
  organizationService: { getAll: (...args: unknown[]) => getAll(...args) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

const setSelectedOrganization = vi.fn();
const store = {
  user: { id: 5, role: 'agent' } as { id: number; role: string } | null,
  selectedOrganizationId: 38 as number | null,
  setSelectedOrganization,
};
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => store }));

import { WorkspaceGate } from '../WorkspaceGate';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/w/:slug" element={<WorkspaceGate />}>
          <Route path="messages" element={<div>THE INBOX</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  store.user = { id: 5, role: 'agent' };
  store.selectedOrganizationId = 38;
  myOrganizations.mockResolvedValue([
    { id: 19, name: 'Orbelli test', slug: 'orbelli-test' },
    { id: 38, name: 'G-2', slug: 'g-2' },
  ]);
});

describe('WorkspaceGate', () => {
  it('switches the store to the workspace named in the URL, then renders the page', async () => {
    renderAt('/w/orbelli-test/messages');

    expect(await screen.findByText('THE INBOX')).toBeInTheDocument();
    // The whole point: the link said orbelli-test while the store held g-2.
    expect(setSelectedOrganization).toHaveBeenCalledWith(19);
  });

  it('does NOT render the page for a workspace the user is not in — it names it', async () => {
    renderAt('/w/framehouse/messages');

    expect(await screen.findByText(/belongs to another workspace/i)).toBeInTheDocument();
    expect(screen.getByText('framehouse')).toBeInTheDocument();
    // ⛔ The old behaviour: silently resolve in whatever workspace was selected.
    expect(screen.queryByText('THE INBOX')).not.toBeInTheDocument();
    expect(setSelectedOrganization).not.toHaveBeenCalled();
  });

  it('fails CLOSED when the workspace list cannot be loaded', async () => {
    myOrganizations.mockRejectedValue(new Error('network'));

    renderAt('/w/orbelli-test/messages');

    expect(await screen.findByText(/workspace not found/i)).toBeInTheDocument();
    expect(screen.queryByText('THE INBOX')).not.toBeInTheDocument();
  });

  it('CONTROL: the URL already matching the store still renders, with no redundant switch', async () => {
    store.selectedOrganizationId = 19;

    renderAt('/w/orbelli-test/messages');

    expect(await screen.findByText('THE INBOX')).toBeInTheDocument();
    expect(setSelectedOrganization).not.toHaveBeenCalled();
  });

  it('a global admin reads the full workspace list, not just their memberships', async () => {
    store.user = { id: 13, role: 'admin' };
    getAll.mockResolvedValue({ data: [{ id: 18, name: 'framehouse', slug: 'framehouse' }] });

    renderAt('/w/framehouse/messages');

    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(await screen.findByText('THE INBOX')).toBeInTheDocument();
    expect(myOrganizations).not.toHaveBeenCalled();
  });
});
