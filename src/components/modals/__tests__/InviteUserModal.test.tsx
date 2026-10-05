/**
 * FE audit 2026-09-29 C-H3: a global admin's Invite offered every workspace, defaulted to the first
 * one, and the backend invited into the CURRENT one anyway (it reads `X-Organization-Context`). The
 * dialog now names the workspace the invite actually goes to, and refuses a prefilled other one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let selectedOrganizationId: number | null = 7;
let isAdmin = true;
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 1, organizationId: 3 }, selectedOrganizationId }),
}));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin }) }));
const getCurrent = vi.fn<() => Promise<{ id: number; name: string }>>();
const getAllPages = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getCurrent: () => getCurrent(),
    getAllPages: (...args: unknown[]) => getAllPages(...args),
  },
}));
vi.mock('@/services/department.service', () => ({
  departmentService: {
    getAll: () => Promise.resolve([{ id: 70, name: 'Support', active: true, served: true }]),
  },
}));
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => Promise.resolve({ data: [] }) },
}));
vi.mock('@/utils/departmentReachability', () => ({ isDepartmentServed: () => true }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

const { InviteUserModal } = await import('../InviteUserModal');

const onInvite = vi.fn<(...args: unknown[]) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  selectedOrganizationId = 7;
  isAdmin = true;
  getCurrent.mockResolvedValue({ id: 7, name: 'Acme Support' });
  onInvite.mockResolvedValue();
});
afterEach(cleanup);

const fill = () => {
  fireEvent.change(screen.getByPlaceholderText('user@example.com'), {
    target: { value: 'new@example.com' },
  });
};

describe('InviteUserModal — the invite goes to the workspace the requests go to', () => {
  it('names the current workspace, offers no other, and invites into it', async () => {
    render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    expect(await screen.findByDisplayValue('Acme Support')).toBeDisabled();
    expect(screen.getByTestId('invite-workspace-hint')).toHaveTextContent(
      'To invite into another workspace, switch to it first.'
    );
    // No list of every workspace is loaded any more.
    expect(getAllPages).not.toHaveBeenCalled();
    fill();
    await waitFor(() => expect(screen.getByText('Support')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Send Invitation|Invite/ }));
    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    expect(onInvite.mock.calls[0][3]).toBe(7);
  });

  it('a non-admin: the workspace is their selected one; without a selection, their own', async () => {
    isAdmin = false;
    selectedOrganizationId = null;
    getCurrent.mockResolvedValue({ id: 3, name: 'Home' });
    render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    expect(await screen.findByDisplayValue('Home')).toBeInTheDocument();
    expect(screen.getByTestId('invite-workspace-hint')).toHaveTextContent(
      'User will be added to your workspace'
    );
    fill();
    await waitFor(() => expect(screen.getByText('Support')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Send Invitation|Invite/ }));
    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    expect(onInvite.mock.calls[0][3]).toBe(3);
  });

  it('a prefilled OTHER workspace is refused: said, and the submit is disabled', async () => {
    render(
      <InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} prefilledOrganizationId={9} />
    );
    expect(await screen.findByTestId('invite-workspace-hint')).toHaveTextContent(
      'different workspace'
    );
    fill();
    const submit = screen.getByRole('button', { name: /Send Invitation|Invite/ });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    // A submit that does not go through the button (Enter in a field) meets the same refusal.
    fireEvent.submit(submit.closest('form') as HTMLFormElement);
    expect(
      await screen.findByText(
        'This invitation is for a different workspace. Switch to that workspace first.'
      )
    ).toBeInTheDocument();
    expect(onInvite).not.toHaveBeenCalled();
  });

  it('control: a prefilled workspace equal to the current one invites normally', async () => {
    render(
      <InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} prefilledOrganizationId={7} />
    );
    expect(await screen.findByDisplayValue('Acme Support')).toBeInTheDocument();
    fill();
    await waitFor(() => expect(screen.getByText('Support')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Send Invitation|Invite/ }));
    await waitFor(() => expect(onInvite.mock.calls[0]?.[3]).toBe(7));
  });

  it('a workspace answer for another workspace is never shown as the target', async () => {
    getCurrent.mockResolvedValue({ id: 99, name: 'Someone else' });
    render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    expect(await screen.findByDisplayValue('Workspace #7')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Someone else')).not.toBeInTheDocument();
  });
});
