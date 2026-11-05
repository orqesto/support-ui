import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { RoleDefaults } from '@/services/notificationSettingsService';

const fetchRoles = vi.fn<() => Promise<RoleDefaults | null>>();
const saveRoles = vi.fn<(role: string, lines: Record<string, unknown>) => Promise<RoleDefaults>>();
vi.mock('@/services/notificationSettingsService', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  fetchRoleDefaults: () => fetchRoles(),
  saveRoleDefaults: (role: string, lines: Record<string, unknown>) => saveRoles(role, lines),
}));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: () => new Promise(() => undefined) } }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn(), failure: vi.fn() }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));
const perms = { isAdmin: false, isOrgAdmin: true, hasPermission: () => true };
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => perms }));

const { NotificationRoleDefaults } = await import('../NotificationRoleDefaults');
const { OrganizationSettings } = await import('../OrganizationSettings');
const { MemoryRouter } = await import('react-router-dom');
const { invalidateSharedFetch } = await import('@/lib/sharedFetch');
const { useAuthStore } = await import('@/stores/authStore');

const overview = (differing: Array<{ id: number; name: string; value: unknown }> = []): RoleDefaults => ({
  roles: ['org_admin', 'moderator', 'support', 'associate'].map((role) => ({
    role,
    lines: [
      {
        key: 'kind:spam_arrival',
        value: false,
        locked: false,
        alwaysOn: false,
        differing: role === 'support' ? differing.length : 0,
        differingUsers: role === 'support' ? differing : [],
      },
      { key: 'kind:conversation_assigned', value: true, locked: false, alwaysOn: true, differing: 0, differingUsers: [] },
    ],
  })),
});

const pickRole = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));

beforeEach(() => {
  vi.clearAllMocks();
  perms.isOrgAdmin = true;
});

describe('notifications by role', () => {
  it('hidden for a moderator', () => {
    perms.isOrgAdmin = false;
    fetchRoles.mockResolvedValue(overview());
    render(
      <MemoryRouter>
        <OrganizationSettings />
      </MemoryRouter>
    );
    expect(screen.queryByText('Notifications by role')).toBeNull();
    expect(fetchRoles).not.toHaveBeenCalled();
  });

  it('shows the tab to an org admin when the BE has the endpoint, hides it when the old BE answers unavailable (403/400/404 all read as null)', async () => {
    fetchRoles.mockResolvedValue(overview());
    const { unmount } = render(
      <MemoryRouter>
        <OrganizationSettings />
      </MemoryRouter>
    );
    await screen.findByText('Notifications by role');
    unmount();
    invalidateSharedFetch();
    fetchRoles.mockResolvedValue(null);
    render(
      <MemoryRouter>
        <OrganizationSettings />
      </MemoryRouter>
    );
    await waitFor(() => expect(fetchRoles).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Notifications by role')).toBeNull();
  });

  it('hidden when the BE has no endpoint (page itself)', async () => {
    fetchRoles.mockResolvedValue(null);
    render(<NotificationRoleDefaults />);
    await screen.findByText(/not available on this server/i);
  });

  it('shows who differs before locking and confirms', async () => {
    fetchRoles.mockResolvedValue(
      overview([
        { id: 1, name: 'Alex Example', value: true },
        { id: 2, name: 'Sam Sample', value: true },
      ])
    );
    saveRoles.mockResolvedValue(overview());
    render(<NotificationRoleDefaults />);
    await screen.findByText('Spam arrived');
    pickRole('Support Agent');
    expect(screen.getByText('2 people use their own value')).toBeInTheDocument();
    fireEvent.click(screen.getByText('2 people use their own value'));
    expect(screen.getByText('Alex Example')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Locked: Spam arrived' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Alex Example/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Sam Sample/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Their own choice will be replaced/)).toBeInTheDocument();
    expect(saveRoles).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lock' }));
    expect(screen.getByRole('switch', { name: 'Locked: Spam arrived' })).toBeChecked();
  });

  it('saves value and lock per role, never always-on lines', async () => {
    fetchRoles.mockResolvedValue(overview());
    saveRoles.mockResolvedValue(overview());
    render(<NotificationRoleDefaults />);
    await screen.findByText('Spam arrived');
    pickRole('Moderator');
    expect(screen.getByRole('switch', { name: 'Assigned to me' })).toBeInactive();
    fireEvent.click(screen.getByRole('switch', { name: 'Spam arrived' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Locked: Spam arrived' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveRoles).toHaveBeenCalledTimes(1));
    expect(saveRoles).toHaveBeenCalledWith('moderator', { 'kind:spam_arrival': { value: true, locked: true } });
  });

  it('opening the tab does not read the role defaults a second time', async () => {
    fetchRoles.mockResolvedValue(overview());
    render(
      <MemoryRouter>
        <OrganizationSettings section="notification-roles" />
      </MemoryRouter>
    );
    await screen.findByText('Spam arrived');
    expect(fetchRoles).toHaveBeenCalledTimes(1);
  });

  it('keeps a draft when switching roles and marks the role that has unsaved changes', async () => {
    fetchRoles.mockResolvedValue(overview());
    render(<NotificationRoleDefaults />);
    await screen.findByText('Spam arrived');
    pickRole('Moderator');
    fireEvent.click(screen.getByRole('switch', { name: 'Spam arrived' }));
    expect(within(screen.getByRole('button', { name: /Moderator/ })).getByLabelText('unsaved changes')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Support Agent/ })).queryByLabelText('unsaved changes')).toBeNull();
    pickRole('Support Agent');
    pickRole('Moderator');
    expect(screen.getByRole('switch', { name: 'Spam arrived' })).toBeChecked();
    expect(saveRoles).not.toHaveBeenCalled();
  });

  it('leaving the page with unsaved changes says they were not saved; a clean leave says nothing', async () => {
    fetchRoles.mockResolvedValue(overview());
    const clean = render(<NotificationRoleDefaults />);
    await screen.findByText('Spam arrived');
    clean.unmount();
    expect(toastMock.warning).not.toHaveBeenCalled();
    const dirty = render(<NotificationRoleDefaults />);
    await screen.findByText('Spam arrived');
    fireEvent.click(screen.getByRole('switch', { name: 'Spam arrived' }));
    dirty.unmount();
    expect(toastMock.warning).toHaveBeenCalledTimes(1);
    expect(toastMock.warning.mock.calls[0][0]).toMatch(/not saved/);
  });

  it('a workspace switch with unsaved changes says they were discarded because of the switch', async () => {
    useAuthStore.setState({ selectedOrganizationId: 1 });
    fetchRoles.mockResolvedValue(overview());
    render(<NotificationRoleDefaults />);
    await screen.findByText('Spam arrived');
    fireEvent.click(screen.getByRole('switch', { name: 'Spam arrived' }));
    useAuthStore.setState({ selectedOrganizationId: 2 });
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1));
    expect(toastMock.warning.mock.calls[0][0]).toMatch(/switched workspace/);
    useAuthStore.setState({ selectedOrganizationId: null });
  });

  it('a server error on the probe keeps the tab, and the page offers Try again', async () => {
    fetchRoles.mockRejectedValue(new Error('503'));
    render(
      <MemoryRouter>
        <OrganizationSettings section="notification-roles" />
      </MemoryRouter>
    );
    expect(await screen.findByText('Could not load the role defaults.')).toBeInTheDocument();
    expect(screen.getAllByText('Notifications by role').length).toBeGreaterThan(0);
    fetchRoles.mockResolvedValue(overview());
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Spam arrived');
  });

  it('signing out with unsaved changes does not blame a workspace switch', async () => {
    useAuthStore.setState({ selectedOrganizationId: 1 });
    fetchRoles.mockResolvedValue(overview());
    render(<NotificationRoleDefaults />);
    await screen.findByText('Spam arrived');
    fireEvent.click(screen.getByRole('switch', { name: 'Spam arrived' }));
    useAuthStore.setState({ selectedOrganizationId: null, user: null });
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1));
    expect(toastMock.warning.mock.calls[0][0]).not.toMatch(/switched workspace/);
    useAuthStore.setState(useAuthStore.getInitialState());
  });
});
