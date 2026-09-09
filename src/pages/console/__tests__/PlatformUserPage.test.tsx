import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { PlatformUserRow } from '@/services/platform.service';

/**
 * The console's per-user screen became a PAGE so the work is addressable. These pin the
 * two properties a dialog could not have: a URL alone is enough to load the person (no
 * list row to inherit), and an id that does not resolve says so instead of rendering an
 * empty form over a user who isn't there.
 */

const row: PlatformUserRow = {
  id: 42,
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  position: 'Support Lead',
  role: 'user',
  emailVerified: true,
  orgCount: 1,
  workspaces: [
    {
      organizationId: 7,
      organizationName: 'CoreSarms',
      role: 'moderator',
      preAllianceRole: null,
      idpManaged: false,
    },
  ],
  idpManaged: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  disabledAt: null,
  disabledReason: null,
};

const getUser = vi.fn<(id: number) => Promise<PlatformUserRow>>();
const getUserOrganizations = vi.fn(() =>
  Promise.resolve([
    { id: 7, name: 'CoreSarms', role: 'moderator', departmentIds: [], idpManaged: false },
  ])
);

vi.mock('@/services/platform.service', () => ({
  platformService: {
    getUser: (id: number) => getUser(id),
    updateUserRole: vi.fn(),
    suspendUser: vi.fn(),
    reactivateUser: vi.fn(),
  },
}));

vi.mock('@/services/user.service', () => ({
  userService: {
    getUserOrganizations: () => getUserOrganizations(),
    update: vi.fn(() => Promise.resolve({})),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getAll: () =>
      Promise.resolve({
        data: [{ id: 7, name: 'CoreSarms' }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false },
      }),
    addMember: vi.fn(),
  },
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) =>
    selector({ user: { id: 1 } }),
}));

const { PlatformUserPage } = await import('../PlatformUserPage');

const renderAt = (path: string, state?: unknown) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    // ReactSelect (the "Add to workspace" picker) reads the theme, so the page cannot
    // mount without the provider.
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <Routes>
            <Route path="/console/platform/users/:userId" element={<PlatformUserPage />} />
            <Route path="/console/platform/users" element={<div>Directory</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue(row);
});

describe('PlatformUserPage', () => {
  it('loads the user from the URL alone — no list row handed over', async () => {
    // The reason this is a page: a refresh or a pasted link has no router state, and the
    // dialog it replaces could only ever show a row the list had already fetched.
    renderAt('/console/platform/users/42');

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(getUser).toHaveBeenCalledWith(42);
    expect(await screen.findByDisplayValue('Support Lead')).toBeInTheDocument();
  });

  it('paints from the row the list handed over, and still confirms it by id', async () => {
    renderAt('/console/platform/users/42', { user: row });

    // Seeded: the name is there before any request settles.
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    await waitFor(() => expect(getUser).toHaveBeenCalledWith(42));
  });

  it('says the user could not be loaded instead of rendering an empty form', async () => {
    // CONTROL for the load path: a 404 (deleted user, mistyped id) must not look like a
    // person with blank fields, which is what a seeded-only page would have shown.
    getUser.mockRejectedValue(new Error('User not found'));
    renderAt('/console/platform/users/999');

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('rejects a non-numeric id without calling the API', async () => {
    renderAt('/console/platform/users/not-a-number');

    expect(await screen.findByText(/not valid/i)).toBeInTheDocument();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('shows the suspension state on load, not only after a mutation', async () => {
    getUser.mockResolvedValue({
      ...row,
      disabledAt: '2026-09-01T00:00:00.000Z',
      disabledReason: 'policy violation',
    });
    renderAt('/console/platform/users/42');

    expect(await screen.findByText(/can't sign in until reactivated/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /reactivate/i })).toBeInTheDocument();
  });

  it('links back to the directory', async () => {
    renderAt('/console/platform/users/42');

    const back = await screen.findByRole('link', { name: /users/i });
    fireEvent.click(back);
    expect(await screen.findByText('Directory')).toBeInTheDocument();
  });
});
