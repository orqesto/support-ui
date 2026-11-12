/**
 * Console → Manage user: a workspace whose own database cannot be read comes back with no teams
 * and `teamsUnavailable` (BE review of #1522, 2026-11-12). Each team toggle saves the FULL set,
 * so one toggle there would have replaced the member's real teams with the one clicked. The
 * editor is off and says why; a readable workspace still edits (CONTROL).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

type DepartmentsQuery = {
  isLoading: boolean;
  isError: boolean;
  data: { departments: { id: number; name: string }[] };
  refetch: () => void;
};
const useWorkspaceDepartments = vi.fn<(orgId: number, enabled: boolean) => DepartmentsQuery>();
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

const { WorkspaceMembershipRow } = await import('@/components/console/WorkspaceMembershipRow');

const row = (teamsUnavailable: boolean) =>
  render(
    <WorkspaceMembershipRow
      orgId={7}
      orgName="Acme"
      currentRole="support"
      currentDepartmentIds={[]}
      userId={3}
      userEmail="mia@example.com"
      idpManaged={false}
      teamsUnavailable={teamsUnavailable}
      onChanged={() => undefined}
    />
  );

beforeEach(() => {
  useWorkspaceDepartments.mockReset();
  useWorkspaceDepartments.mockReturnValue({
    isLoading: false,
    isError: false,
    data: { departments: [{ id: 1, name: 'Billing' }] },
    refetch: vi.fn(),
  });
  setMemberDepartments.mockReset();
});

describe('WorkspaceMembershipRow when the workspace teams cannot be read', () => {
  it('shows why and offers no team toggle (nor fetches the team list)', () => {
    row(true);
    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    expect(screen.getByText(/own database can.t be read right now/i)).toBeInTheDocument();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
    expect(useWorkspaceDepartments).toHaveBeenLastCalledWith(7, false);
  });

  it('CONTROL: a readable workspace lists its teams to toggle', () => {
    row(false);
    fireEvent.click(screen.getByRole('button', { name: 'Teams' }));
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.queryByText(/own database can.t be read/i)).not.toBeInTheDocument();
    expect(useWorkspaceDepartments).toHaveBeenLastCalledWith(7, true);
  });
});
