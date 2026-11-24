/**
 * Mentors (1.1.330): the console's per-user page shows the mentor mark on a workspace membership.
 * The mark comes with the directory row's `workspaces[]`; it is set in the workspace itself.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { PlatformUserRow } from '@/services/platform.service';

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
      organizationName: 'Example Desk',
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
    { id: 7, name: 'Example Desk', role: 'moderator', departmentIds: [], idpManaged: false },
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
        data: [{ id: 7, name: 'Example Desk' }],
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
    // Select (the "Add to workspace" picker) reads the theme, so the page cannot
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
beforeEach(() => vi.clearAllMocks());

const membershipRow = async () =>
  (await screen.findByRole('combobox', { name: 'Role for ada@example.com in Example Desk' })).closest(
    'li'
  ) as HTMLElement;

describe('PlatformUserPage — mentor mark', () => {
  it('a mentor membership carries a Mentor badge', async () => {
    getUser.mockResolvedValue({
      ...row,
      workspaces: [{ ...row.workspaces[0], isMentor: true }],
    });
    renderAt('/console/platform/users/42');
    expect(within(await membershipRow()).getByText('Mentor')).toBeInTheDocument();
  });

  it('control: a working agent (or an older backend without the field) has none', async () => {
    getUser.mockResolvedValue(row);
    renderAt('/console/platform/users/42');
    expect(within(await membershipRow()).queryByText('Mentor')).toBeNull();
  });
});
