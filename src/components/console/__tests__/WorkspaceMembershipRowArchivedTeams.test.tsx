/**
 * Console → Manage user: a member still on a switched-off (archived) team. The row seeded its
 * toggles with that team's id and saved the FULL set on every toggle, and the server refuses any
 * set that names an archived team (400 "Archived team(s) cannot be assigned") — so every toggle
 * failed, with only a toast. The set sent never names a switched-off team, the row says the member
 * is still on one, and a refusal is shown in the server's words next to the toggles.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

type Dept = { id: number; name: string; active: boolean };
const useWorkspaceDepartments = vi.fn<(orgId: number, enabled: boolean) => unknown>();
vi.mock('@/hooks/usePlatformAdmin', () => ({
  useWorkspaceDepartments: (orgId: number, enabled: boolean) =>
    useWorkspaceDepartments(orgId, enabled),
}));
const setMemberDepartments = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/services/organization.service', () => ({
  organizationService: {
    setMemberDepartments: (...args: unknown[]) => setMemberDepartments(...args),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
  },
}));
const toastError = vi.fn<(message: string) => void>();
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (message: string) => toastError(message) },
}));

const { WorkspaceMembershipRow } = await import('@/components/console/WorkspaceMembershipRow');

const BILLING: Dept = { id: 1, name: 'Billing', active: true };
const RETURNS: Dept = { id: 2, name: 'Returns', active: true };
const OLD: Dept = { id: 9, name: 'Old queue', active: false };

const row = (currentDepartmentIds: number[], departments: Dept[]) => {
  useWorkspaceDepartments.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { departments },
    refetch: vi.fn(),
  });
  render(
    <WorkspaceMembershipRow
      orgId={7}
      orgName="Acme"
      currentRole="support"
      currentDepartmentIds={currentDepartmentIds}
      userId={3}
      userEmail="mia@example.com"
      idpManaged={false}
      onChanged={() => undefined}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
};

const toggleFor = (name: string) =>
  screen.getByText(name).closest('li')?.querySelector('button, input') as HTMLElement;

beforeEach(() => {
  useWorkspaceDepartments.mockReset();
  setMemberDepartments.mockReset();
  setMemberDepartments.mockResolvedValue(undefined);
  toastError.mockReset();
});

describe('WorkspaceMembershipRow — a member still on a switched-off team', () => {
  it('a toggle sends the live teams only, never the switched-off one', async () => {
    row([1, 9], [BILLING, RETURNS, OLD]);
    fireEvent.click(toggleFor('Returns'));
    await waitFor(() => expect(setMemberDepartments).toHaveBeenCalledTimes(1));
    expect(setMemberDepartments).toHaveBeenCalledWith(7, 3, [1, 2]);
  });

  it('CONTROL — with no switched-off team the full set (seed + toggled) is still sent', async () => {
    row([1], [BILLING, RETURNS, OLD]);
    fireEvent.click(toggleFor('Returns'));
    await waitFor(() => expect(setMemberDepartments).toHaveBeenCalledTimes(1));
    expect(setMemberDepartments).toHaveBeenCalledWith(7, 3, [1, 2]);
    expect(screen.queryByText(/switched-off team/)).not.toBeInTheDocument();
  });

  it('a switched-off team gets no toggle; the row says the member is still on it', () => {
    row([1, 9], [BILLING, RETURNS, OLD]);
    expect(screen.getByText(/Still on/)).toHaveTextContent('a switched-off team: Old queue');
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('"Take off switched-off team" saves the live teams alone', async () => {
    row([1, 9], [BILLING, RETURNS, OLD]);
    fireEvent.click(screen.getByRole('button', { name: 'Take off switched-off team' }));
    await waitFor(() => expect(setMemberDepartments).toHaveBeenCalledWith(7, 3, [1]));
  });

  it('a refused save shows the server sentence next to the toggles', async () => {
    setMemberDepartments.mockRejectedValue({
      status: 400,
      data: { success: false, error: 'One or more teams do not belong to this workspace' },
    });
    row([1], [BILLING, RETURNS]);
    fireEvent.click(toggleFor('Returns'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not saved: One or more teams do not belong to this workspace'
    );
    expect(toastError).toHaveBeenCalledWith('One or more teams do not belong to this workspace');
  });
});
