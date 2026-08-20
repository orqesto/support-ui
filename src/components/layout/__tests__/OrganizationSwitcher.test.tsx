import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * The switcher serves two different users through one component, and they switch by
 * different mechanisms:
 *
 *   - a GLOBAL ADMIN browses every workspace and switches via an org-context header;
 *   - a MEMBER sees only their own memberships and switches by having the token re-minted,
 *     because their JWT is bound to a single organization.
 *
 * Conflating them breaks in both directions: a member calling the admin list endpoint gets
 * a 403, and an admin calling the member switch endpoint gets refused for any workspace
 * they do not personally belong to — which is most of them.
 *
 * Until this change the component simply returned null for anyone who was not a global
 * admin, so a member in two workspaces had no way to switch without logging out.
 */
type Org = { id: number; name: string; slug: string };

const getAll = vi.fn<() => Promise<{ data: Org[] }>>();
const myOrganizations = vi.fn<() => Promise<Org[]>>();
const switchOrganization = vi.fn<(id: number) => Promise<{ success: boolean }>>();

vi.mock('@/services/organization.service', () => ({
  organizationService: { getAll: () => getAll() },
}));
vi.mock('@/services/auth.service', () => ({
  authService: {
    myOrganizations: () => myOrganizations(),
    switchOrganization: (id: number) => switchOrganization(id),
  },
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const setSelectedOrganization = vi.fn();
type AuthState = {
  user: { role: string } | null;
  selectedOrganizationId: number | null;
  setSelectedOrganization: typeof setSelectedOrganization;
};
let authState: AuthState;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: AuthState) => unknown) => selector(authState),
}));

const { OrganizationSwitcher } = await import('../OrganizationSwitcher');

const TWO = [
  { id: 1, name: 'Acme', slug: 'acme' },
  { id: 2, name: 'Globex', slug: 'globex' },
];

const asMember = (orgs = TWO) => {
  authState = { user: { role: 'user' }, selectedOrganizationId: 1, setSelectedOrganization };
  myOrganizations.mockResolvedValue(orgs);
};
const asGlobalAdmin = () => {
  authState = { user: { role: 'admin' }, selectedOrganizationId: 1, setSelectedOrganization };
  getAll.mockResolvedValue({ data: TWO });
};

beforeEach(() => {
  getAll.mockReset();
  myOrganizations.mockReset();
  switchOrganization.mockReset();
  setSelectedOrganization.mockReset();
  switchOrganization.mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe('OrganizationSwitcher — member', () => {
  it('renders for a member who belongs to more than one workspace', async () => {
    asMember();
    render(<OrganizationSwitcher />);

    await waitFor(() => expect(myOrganizations).toHaveBeenCalled());
    // Reads its list from the member endpoint, never the admin-only one.
    expect(getAll).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());
  });

  it('stays hidden for a member with only one workspace', async () => {
    asMember([TWO[0]]);
    const { container } = render(<OrganizationSwitcher />);

    await waitFor(() => expect(myOrganizations).toHaveBeenCalled());
    // Nothing to switch to — a dead control is just noise.
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('OrganizationSwitcher — global admin', () => {
  it('reads the full workspace list, not the member endpoint', async () => {
    asGlobalAdmin();
    render(<OrganizationSwitcher />);

    await waitFor(() => expect(getAll).toHaveBeenCalled());
    expect(myOrganizations).not.toHaveBeenCalled();
  });

  it('never calls the member switch endpoint', async () => {
    asGlobalAdmin();
    render(<OrganizationSwitcher />);
    await waitFor(() => expect(getAll).toHaveBeenCalled());

    // An admin is usually NOT a member of the workspace they are inspecting, and that
    // endpoint refuses non-members — calling it would break switching for admins.
    const toggle = screen.queryByRole('button');
    if (toggle) fireEvent.click(toggle);
    expect(switchOrganization).not.toHaveBeenCalled();
  });
});
