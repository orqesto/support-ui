/**
 * A deactivated member can be REMOVED, not only reactivated.
 *
 * The owner, on the deployed console with five deactivated rows and nowhere to go: "why
 * deactivated users can't be removed? as they can be added again if activated from idp".
 * Remove is offered on deactivated rows only — an active member is deactivated first, so the
 * hold's guards (last admin, ticket handover) are never skipped — and the confirm says the one
 * thing that matters: this is not a ban, the IdP can bring them back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';

const removeMutate = vi.fn();
const reactivateMutate = vi.fn();
const deactivateMutate = vi.fn();

const members = [
  {
    userId: 15,
    name: 'Jack',
    email: 'jack@example.test',
    allianceRole: null,
    effectiveRoles: [],
    revokedRoles: [{ orgId: 3, orgName: 'Orbelli', role: 'associate' }],
    active: false,
    heldByAdmin: true,
  },
  {
    userId: 21,
    name: 'Jaime',
    email: 'jaime@example.test',
    allianceRole: null,
    effectiveRoles: [{ orgId: 4, orgName: 'CoreSarms', role: 'associate' }],
    revokedRoles: [],
    active: true,
    heldByAdmin: false,
  },
];

vi.mock('react-router-dom', () => ({ useParams: () => ({ allianceId: '1' }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useAllianceAdmin', () => ({
  useAllianceMembers: () => ({ data: members, isLoading: false, isError: false, refetch: vi.fn() }),
  useAllianceMemberCandidates: () => ({ data: [], isLoading: false }),
  useAddMember: () => ({ mutate: vi.fn(), isPending: false }),
  useChangeMemberRole: () => ({ mutate: vi.fn(), isPending: false }),
  useDeactivateMember: () => ({ mutate: deactivateMutate, isPending: false }),
  useReactivateMember: () => ({ mutate: reactivateMutate, isPending: false }),
  useRemoveMember: () => ({ mutate: removeMutate, isPending: false }),
}));

import { ConsoleMembers } from '@/pages/console/ConsoleMembers';

const renderPage = () =>
  render(
    <ThemeProvider>
      <ConsoleMembers />
    </ThemeProvider>
  );

describe('ConsoleMembers — removing a deactivated member', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('offers Remove on a deactivated row, next to Reactivate', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Remove Jack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate Jack' })).toBeInTheDocument();
  });

  it('CONTROL: an active member gets Deactivate only — never a direct Remove', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Deactivate Jaime' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Jaime' })).not.toBeInTheDocument();
  });

  it('confirms, says it is not a ban, then removes exactly that member', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Jack' }));

    expect(screen.getByText('Remove Jack from the alliance?')).toBeInTheDocument();
    expect(screen.getByText(/if your identity provider activates them again, they come back/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));
    expect(removeMutate).toHaveBeenCalledTimes(1);
    expect(removeMutate.mock.calls[0][0]).toBe(15);
    expect(reactivateMutate).not.toHaveBeenCalled();
  });
});
