/**
 * Whoever can switch workspaces must see the banner that names the one they are in.
 *
 * Rendered side by side for the same session: the `OrganizationSwitcher` (the control)
 * and the `WorkspaceBanner` (the warning). They must appear together or not at all —
 * a session that can switch but sees no banner is exactly the 2026-08-16 incident
 * class (a `reply_style` activation applied to the wrong tenant). Audit u39 P0-1.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Org = { id: number; name: string; slug: string };
const getAll = vi.fn<() => Promise<{ data: Org[] }>>();
const myOrganizations = vi.fn<() => Promise<Org[]>>();

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAll: () => getAll(),
    getCurrent: () => Promise.resolve({ id: 1, name: 'Acme', code: 'ACM' }),
  },
}));
vi.mock('@/services/auth.service', () => ({
  authService: {
    myOrganizations: () => myOrganizations(),
    switchOrganization: vi.fn(),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

type AuthState = {
  user: { id: number; role: string; organizationId: number } | null;
  selectedOrganizationId: number | null;
  setSelectedOrganization: () => void;
};
let authState: AuthState;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: AuthState) => unknown) => selector(authState),
}));

const { OrganizationSwitcher } = await import('../OrganizationSwitcher');
const { WorkspaceBanner } = await import('../WorkspaceBanner');

const ONE: Org[] = [{ id: 1, name: 'Acme', slug: 'acme' }];
const TWO: Org[] = [...ONE, { id: 2, name: 'Globex', slug: 'globex' }];

const session = (role: string, memberships: Org[]) => {
  authState = {
    user: { id: 9, role, organizationId: 1 },
    selectedOrganizationId: 1,
    setSelectedOrganization: vi.fn(),
  };
  myOrganizations.mockResolvedValue(memberships);
  getAll.mockResolvedValue({ data: memberships });
};

const renderBoth = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrganizationSwitcher />
      <WorkspaceBanner />
    </QueryClientProvider>
  );

const switcherShown = () =>
  screen.queryAllByText('Select Workspace').length > 0 || screen.queryAllByText('Acme').length > 0;

beforeEach(() => {
  getAll.mockReset();
  myOrganizations.mockReset();
});
afterEach(cleanup);

describe('the switcher and the banner agree on who can switch', () => {
  it('THE FIX: a member of two workspaces gets the switcher AND the banner', async () => {
    session('user', TWO);
    renderBoth();
    await waitFor(() => expect(switcherShown()).toBe(true));
    // The banner used to check global-admin only — this member could switch unwarned.
    expect(await screen.findByTestId('workspace-banner')).toBeInTheDocument();
  });

  it('a member of one workspace gets neither', async () => {
    session('user', ONE);
    renderBoth();
    await waitFor(() => expect(myOrganizations).toHaveBeenCalled());
    // Both stay hidden even after the membership answer has been applied.
    await waitFor(() => expect(switcherShown()).toBe(false));
    expect(screen.queryByTestId('workspace-banner')).not.toBeInTheDocument();
  });

  it('a global admin gets both without any membership lookup for the banner', async () => {
    session('admin', ONE);
    renderBoth();
    expect(await screen.findByTestId('workspace-banner')).toBeInTheDocument();
    await waitFor(() => expect(switcherShown()).toBe(true));
    // Admins switch by context header; the banner must not wait on a list they may not be in.
    expect(myOrganizations).not.toHaveBeenCalled();
  });
});
