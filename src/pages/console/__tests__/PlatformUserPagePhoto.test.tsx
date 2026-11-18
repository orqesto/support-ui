/**
 * Console → user: a global admin sees the person's profile photo and can remove it, with a
 * required reason (platform-audited); the page then reads the user again.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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
      organizationName: 'TraumaTeam',
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
const removeUserPhoto = vi.fn<(id: number, reason: string) => Promise<void>>();
const getUserOrganizations = vi.fn(() =>
  Promise.resolve([
    { id: 7, name: 'TraumaTeam', role: 'moderator', departmentIds: [], idpManaged: false },
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

vi.mock('@/services/platformUserPhoto.service', () => ({
  platformUserPhotoService: { remove: (id: number, reason: string) => removeUserPhoto(id, reason) },
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
        data: [{ id: 7, name: 'TraumaTeam' }],
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
beforeEach(() => {
  getUser.mockReset();
  removeUserPhoto.mockReset().mockResolvedValue(undefined);
});

const PHOTO_PATH = `/console/platform/users/${row.id}`;

describe('console user page — profile photo moderation', () => {
  it('no photo: nothing to remove', async () => {
    getUser.mockResolvedValue({ ...row, photoKey: null } as PlatformUserRow);
    renderAt(PHOTO_PATH);
    await screen.findByText('Profile and global role');
    expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull();
  });

  it('a reason is required, then the photo is removed with it', async () => {
    getUser
      .mockResolvedValueOnce({ ...row, photoKey: 'k-photo' } as PlatformUserRow)
      .mockResolvedValue({ ...row, photoKey: null } as PlatformUserRow);
    renderAt(PHOTO_PATH);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove photo' }));
    const confirm = screen.getByRole('button', { name: 'Confirm remove' });
    expect(confirm).toBeInactive();
    fireEvent.change(
      screen.getByPlaceholderText('Reason (required) — e.g. Not a photo of the person'),
      {
        target: { value: '  Offensive image  ' },
      }
    );
    expect(confirm).not.toBeInactive();
    fireEvent.click(confirm);
    await waitFor(() => expect(removeUserPhoto).toHaveBeenCalledWith(row.id, 'Offensive image'));
    // The page reads the user again (F1): the photo and its Remove are gone, no second 404.
    await waitFor(() => expect(getUser).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove photo' })).toBeNull());
  });
});
