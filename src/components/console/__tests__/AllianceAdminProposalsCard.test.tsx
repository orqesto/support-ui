/**
 * Alliance admin is DERIVED from workspace grants and CONFIRMED by a human (owner's rule,
 * 2026-08-20). The safety property is that nothing is granted by arithmetic: the card proposes,
 * a person decides. These tests pin that, and the skew behaviour that keeps the Provisioning
 * page intact while the backend half is still shipping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AllianceAdminProposalsCard } from '@/components/console/AllianceAdminProposalsCard';
import type { AllianceAdminProposal } from '@/services/alliance-admin.service';

let proposals: AllianceAdminProposal[] = [];
const changeRoleMutate = vi.fn();

vi.mock('@/hooks/useAllianceAdmin', () => ({
  useAllianceAdminProposals: () => ({ data: proposals, isLoading: false, refetch: vi.fn() }),
  useChangeMemberRole: () => ({ mutate: changeRoleMutate, isPending: false }),
}));

const proposal = (overrides: Partial<AllianceAdminProposal> = {}): AllianceAdminProposal => ({
  userId: 7,
  name: 'Mike Taco',
  email: 'mike@tacoteam.info',
  adminOf: [
    { orgId: 1, orgName: 'orbelli' },
    { orgId: 2, orgName: 'CoreSarms' },
  ],
  ...overrides,
});

const renderCard = () =>
  render(
    <ThemeProvider>
      <AllianceAdminProposalsCard allianceId={1} />
    </ThemeProvider>
  );

beforeEach(() => {
  proposals = [];
  changeRoleMutate.mockClear();
  cleanup();
});

describe('AllianceAdminProposalsCard', () => {
  it('names the workspaces that justify the proposal', () => {
    proposals = [proposal()];
    renderCard();
    expect(screen.getByText('Mike Taco')).toBeInTheDocument();
    expect(screen.getByText(/orbelli, CoreSarms/)).toBeInTheDocument();
  });

  it('does NOT grant on render — the whole safety property', () => {
    proposals = [proposal()];
    renderCard();
    expect(changeRoleMutate).not.toHaveBeenCalled();
  });

  it('does not grant on the first click either — it asks first', () => {
    proposals = [proposal()];
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Make alliance admin' }));
    expect(changeRoleMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Make Mike Taco an alliance admin\?/)).toBeInTheDocument();
  });

  it('spells out what the power carries before anyone confirms', () => {
    proposals = [proposal()];
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Make alliance admin' }));
    // The card's standing warning and the dialog both say it — the point is that the dialog
    // does, so the person clicking sees the scope at the moment of deciding.
    expect(screen.getAllByText(/SSO and SCIM configuration/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/including ones attached later/).length).toBeGreaterThanOrEqual(2);
  });

  it('renders nothing at all when there is nothing to propose', () => {
    proposals = [];
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('SKEW: renders nothing when the backend predates the endpoint (service returns [])', () => {
    // alliance-admin.service catches the 404 and yields [] — the page must stay intact.
    proposals = [];
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to the email when a SCIM push carried no name', () => {
    proposals = [proposal({ name: '' })];
    renderCard();
    expect(screen.getAllByText('mike@tacoteam.info').length).toBeGreaterThan(0);
  });
});
