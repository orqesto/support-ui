/**
 * Retiring the IdP-group → alliance-role wiring (Role-Model v2 §0.2).
 *
 * An IdP group now always maps to a WORKSPACE role, through a group. The two things
 * worth pinning are the two halves of a lazy retirement:
 *
 *   1. The alliance-role options are GONE from the picker — nobody can create another.
 *   2. A pre-existing role wiring is still SHOWN, because it still works. Hiding it
 *      would leave live access wired to something invisible in the console.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SyncedGroupsCard } from '@/components/console/SyncedGroupsCard';
import type { SyncedGroup } from '@/services/alliance-scim.service';

const syncedGroups: SyncedGroup[] = [];

const unwireMutate = vi.fn();
vi.mock('@/hooks/useAllianceProvisioning', () => ({
  useAllianceSyncedGroups: () => ({ data: syncedGroups, isLoading: false }),
  useWireSyncedGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useResyncAllianceProvisioning: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAllianceGroupMap: () => ({ mutate: unwireMutate, isPending: false }),
}));

vi.mock('@/hooks/useAllianceGroups', () => ({
  useAllianceGroups: () => ({ data: [{ id: 9, name: 'Support EU' }] }),
  useOrgDepartments: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useAllianceAdmin', () => ({
  useAllianceOrgs: () => ({
    data: [{ id: 3, name: 'Acme', slug: 'acme', active: true }],
    isLoading: false,
  }),
}));

const baseGroup = (overrides: Partial<SyncedGroup> = {}): SyncedGroup => ({
  id: 1,
  externalId: 'ext-1',
  displayName: 'SSO - Odly - Support',
  memberCount: 2,
  members: [],
  wiredGroup: null,
  wiredRole: null,
  suggestion: null,
  createdAt: null,
  updatedAt: null,
  ...overrides,
});

const renderCard = () =>
  render(
    <ThemeProvider>
      <SyncedGroupsCard allianceId={1} />
    </ThemeProvider>
  );

beforeEach(() => {
  syncedGroups.length = 0;
  cleanup();
});

describe('SyncedGroupsCard wire targets', () => {
  it('offers no alliance-role target', () => {
    syncedGroups.push(baseGroup());
    renderCard();

    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options.some((label) => /Alliance admin|Alliance agent/.test(label))).toBe(false);
  });

  // CONTROL: the picker must still offer something, or the assertion above would pass
  // simply because the control failed to render.
  it('still offers workspace roles and authored groups', () => {
    syncedGroups.push(baseGroup());
    renderCard();

    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options.some((label) => label.includes('Org admin'))).toBe(true);
    expect(options.some((label) => label.includes('Support EU'))).toBe(true);
  });

  // The other half of a LAZY retirement: an existing mapping still grants access, so it
  // has to stay visible — flagged as legacy so an admin knows to move it onto a group.
  it('still shows a pre-existing alliance-role wiring, marked legacy', () => {
    syncedGroups.push(
      baseGroup({ wiredRole: { mappingId: 4, mappedRole: 'alliance_admin' } })
    );
    renderCard();

    expect(screen.getByText(/Wired → Alliance admin \(legacy\)/)).toBeInTheDocument();
  });

  // A wired group used to render nothing at all, so the mapping was one-shot: the only
  // way to change it was through the API. Both edits have to be reachable.
  it('offers re-point and unwire once wired', () => {
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 7, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();

    expect(screen.getByRole('button', { name: 'Re-point' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unwire' })).toBeInTheDocument();
  });

  // Re-pointing at a NEW group would mint a second backing group and orphan the current
  // one; the backend 409s on it, so the picker must not offer it either.
  it('offers only existing groups when re-pointing', () => {
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 7, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();

    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options.some((label) => label.includes('Support EU'))).toBe(true);
    expect(options.some((label) => label.startsWith('Org role'))).toBe(false);
  });

  // A legacy alliance-role wiring has no group mapping to delete, so Unwire would have
  // nothing to act on — offering it would be a button that silently does nothing.
  it('does not offer unwire for a legacy alliance-role wiring', () => {
    syncedGroups.push(baseGroup({ wiredRole: { mappingId: 4, mappedRole: 'alliance_agent' } }));
    renderCard();

    expect(screen.queryByRole('button', { name: 'Unwire' })).not.toBeInTheDocument();
  });

  it('shows a group wiring without the legacy marker', () => {
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 7, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();

    expect(screen.getByText(/Wired → group Support EU/)).toBeInTheDocument();
    expect(screen.queryByText(/legacy/)).not.toBeInTheDocument();
  });

  it('pre-selects the suggested workspace role', () => {
    syncedGroups.push(
      baseGroup({ suggestion: { orgRole: 'org_admin', rationale: 'Group name contains "Admin"' } })
    );
    renderCard();

    expect(screen.getByRole('combobox')).toHaveValue('orgrole:org_admin');
  });

  // CONTROL for the skew: an old backend still sends { mappedRole }. The pill must stay
  // hidden rather than render a suggestion the server never made.
  it('hides the suggestion when the backend sends the old shape', () => {
    syncedGroups.push(
      baseGroup({
        suggestion: { rationale: 'Default alliance role for a synced group' } as never,
      })
    );
    renderCard();

    expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('orgrole:associate');
  });
});
