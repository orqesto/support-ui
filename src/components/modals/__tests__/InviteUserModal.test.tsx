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
let departmentsByWorkspace: Record<
  number,
  Array<{ id: number; name: string; active: boolean; served: boolean }>
> = {};
const defaultDepartments = [{ id: 70, name: 'Support', active: true, served: true }];
type Dept = { id: number; name: string; active: boolean; served: boolean };
const getDepartments = vi.fn<() => Promise<Dept[]>>();
vi.mock('@/services/department.service', () => ({
  departmentService: { getAll: () => getDepartments() },
}));
type Integration = { id: number; name: string; enabled: boolean; type: string };
const getIntegrations = vi.fn<() => Promise<{ data: Integration[] }>>();
vi.mock('@/services/integrations.service', () => ({
  integrationsService: { getAll: () => getIntegrations() },
}));
vi.mock('@/utils/departmentReachability', () => ({ isDepartmentServed: () => true }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

const { InviteUserModal } = await import('../InviteUserModal');

const onInvite = vi.fn<(...args: unknown[]) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  selectedOrganizationId = 7;
  isAdmin = true;
  departmentsByWorkspace = {};
  getIntegrations.mockResolvedValue({ data: [] });
  getDepartments.mockImplementation(() =>
    Promise.resolve(
      (selectedOrganizationId !== null && departmentsByWorkspace[selectedOrganizationId]) ||
        defaultDepartments
    )
  );
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
      'User will be added to this workspace'
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

  it('a global admin with no workspace selected has none: said, submit disabled, nothing sent', async () => {
    selectedOrganizationId = null;
    render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    expect(screen.getByTestId('invite-workspace-hint')).toHaveTextContent(
      'No workspace is selected'
    );
    // Not their own workspace (the backend gives a global admin no default).
    expect(screen.queryByDisplayValue('Workspace #3')).not.toBeInTheDocument();
    fill();
    const submit = screen.getByRole('button', { name: /Send Invitation|Invite/ });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest('form') as HTMLFormElement);
    expect(
      await screen.findByText('No workspace is selected. Choose a workspace first.', {
        selector: ':not([data-testid])',
      })
    ).toBeInTheDocument();
    expect(onInvite).not.toHaveBeenCalled();
  });

  it('a workspace switch while mounted drops the old workspace picks', async () => {
    departmentsByWorkspace = {
      7: [{ id: 70, name: 'Support', active: true, served: true }],
      8: [{ id: 80, name: 'Sales', active: true, served: true }],
    };
    const { rerender } = render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    await waitFor(() => expect(screen.getByText('Support')).toBeInTheDocument());
    selectedOrganizationId = 8;
    getCurrent.mockResolvedValue({ id: 8, name: 'Other' });
    rerender(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    expect(await screen.findByDisplayValue('Other')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Sales')).toBeInTheDocument());
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Send Invitation|Invite/ }));
    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    // Department 70 belongs to workspace 7: never sent with workspace 8.
    expect(onInvite.mock.calls[0][2]).toEqual([80]);
    expect(onInvite.mock.calls[0][3]).toBe(8);
  });

  it('a late workspace answer from before a switch is not shown', async () => {
    let resolveOld: (value: { id: number; name: string }) => void = () => {};
    getCurrent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    const { rerender } = render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    selectedOrganizationId = 8;
    getCurrent.mockResolvedValue({ id: 8, name: 'Other' });
    rerender(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    expect(await screen.findByDisplayValue('Other')).toBeInTheDocument();
    // The old request answers last — with the old workspace, which even matched ITS render.
    resolveOld({ id: 7, name: 'Acme Support' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByDisplayValue('Other')).toBeInTheDocument();
  });

  it('a late department list from before a switch is not applied', async () => {
    let resolveOld: (value: Dept[]) => void = () => {};
    getDepartments.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    const { rerender } = render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    departmentsByWorkspace = { 8: [{ id: 80, name: 'Sales', active: true, served: true }] };
    selectedOrganizationId = 8;
    getCurrent.mockResolvedValue({ id: 8, name: 'Other' });
    rerender(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    await waitFor(() => expect(screen.getByText('Sales')).toBeInTheDocument());
    resolveOld([{ id: 70, name: 'Support', active: true, served: true }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Support')).not.toBeInTheDocument();
    expect(screen.getByText('Sales')).toBeInTheDocument();
  });

  it("a late sender list from before a switch never becomes the invite's sender", async () => {
    const senders = (ids: number[]) => ({
      data: ids.map((id) => ({ id, name: `Mailbox ${id}`, enabled: true, type: 'email' })),
    });
    let resolveOld: (value: { data: Integration[] }) => void = () => {};
    getIntegrations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    const { rerender } = render(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    departmentsByWorkspace = { 8: [{ id: 80, name: 'Sales', active: true, served: true }] };
    selectedOrganizationId = 8;
    getCurrent.mockResolvedValue({ id: 8, name: 'Other' });
    getIntegrations.mockResolvedValue(senders([801, 802]));
    rerender(<InviteUserModal isOpen onClose={vi.fn()} onInvite={onInvite} />);
    await waitFor(() => expect(screen.getByText('Sales')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Mailbox 801')).toBeInTheDocument());
    resolveOld(senders([701, 702]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The picker still offers workspace 8's mailboxes, not workspace 7's.
    expect(screen.getByText('Mailbox 801')).toBeInTheDocument();
    expect(screen.queryByText(/Mailbox 70\d/)).not.toBeInTheDocument();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /Send Invitation|Invite/ }));
    await waitFor(() => expect(onInvite).toHaveBeenCalled());
    expect(onInvite.mock.calls[0][4]).toBe(801);
  });
});
