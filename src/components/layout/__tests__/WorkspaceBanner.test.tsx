/**
 * 2026-08-16, production: a `reply_style` activation meant for `odly` landed on
 * **framehouse — the client** and stood for ~90 seconds. The screen offered nothing to
 * check against; the only tenant control is a switcher at the far bottom-left of the sidebar.
 *
 * The banner is mounted by the Layout, not by the 52 screens that write per-org rows, so
 * these tests pin the two decisions that make that safe: it names the workspace, and it
 * never invents one.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceBanner } from '../WorkspaceBanner';

const getCurrent = vi.fn();
vi.mock('@/services/organization.service', () => ({
  organizationService: { getCurrent: () => getCurrent() as unknown },
}));

// The memberships a non-admin could switch between — the switcher's own data source.
const myOrganizations = vi.fn();
vi.mock('@/services/auth.service', () => ({
  authService: { myOrganizations: () => myOrganizations() as unknown },
}));

let role = 'admin';
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 1, role, organizationId: 4 }, selectedOrganizationId: 4 }),
}));

const renderBanner = (path = '/settings') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspaceBanner />
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  role = 'admin';
  getCurrent.mockReset();
  getCurrent.mockResolvedValue({ id: 4, name: 'framehouse', code: 'FRM' });
  myOrganizations.mockReset();
  myOrganizations.mockResolvedValue([{ id: 4, name: 'framehouse', slug: 'framehouse' }]);
});
afterEach(cleanup);

describe('the workspace banner', () => {
  it('names the workspace whose rows the next click will write', async () => {
    renderBanner();
    expect(await screen.findByText('framehouse')).toBeInTheDocument();
    expect(screen.getByText(/You are editing/)).toBeInTheDocument();
    expect(screen.getByText('(FRM)')).toBeInTheDocument();
  });

  it('says so rather than guessing when the workspace has not resolved', async () => {
    getCurrent.mockImplementation(() => new Promise(() => {}));
    renderBanner();
    expect(await screen.findByText('an unidentified workspace')).toBeInTheDocument();
    // A wrong name is worse than no name — nothing may be invented here.
    expect(screen.queryByText('framehouse')).not.toBeInTheDocument();
  });

  it('stays out of the way of users who cannot switch workspaces', async () => {
    role = 'agent';
    renderBanner();
    await waitFor(() => expect(myOrganizations).toHaveBeenCalled());
    expect(screen.queryByTestId('workspace-banner')).not.toBeInTheDocument();
  });

  it('warns a member who belongs to two workspaces — they can switch too', async () => {
    // The banner used to render for global admins only, while the switcher rendered for
    // anyone with two memberships. This user could switch and write with no banner.
    role = 'agent';
    myOrganizations.mockResolvedValue([
      { id: 4, name: 'framehouse', slug: 'framehouse' },
      { id: 5, name: 'odly', slug: 'odly' },
    ]);
    renderBanner();
    expect(await screen.findByTestId('workspace-banner')).toBeInTheDocument();
    expect(await screen.findByText('framehouse')).toBeInTheDocument();
  });

  // Owner, 2026-09-22: settings screens only. The work surfaces show whose data they are.
  it.each(['/messages/42', '/dashboard', '/needs-routing'])('is hidden on %s', async (path) => {
    renderBanner(path);
    await waitFor(() => expect(getCurrent).toHaveBeenCalled());
    expect(screen.queryByTestId('workspace-banner')).not.toBeInTheDocument();
  });

  it('still names the workspace on a screen nobody listed', async () => {
    renderBanner('/some-screen-written-next-year');
    expect(await screen.findByTestId('workspace-banner')).toBeInTheDocument();
  });
});
