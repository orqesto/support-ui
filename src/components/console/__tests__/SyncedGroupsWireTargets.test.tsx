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
  useWireSyncedGroup: () => ({ mutateAsync: vi.fn().mockResolvedValue({ usersReconciled: 0 }), isPending: false }),
  useResyncAllianceProvisioning: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAllianceGroupMap: () => ({ mutate: unwireMutate, isPending: false }),
  useRemoveSyncedGroup: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAllianceGroups', () => ({
  useAllianceGroups: () => ({
    data: [
      { id: 9, name: 'Support EU' },
      { id: 10, name: 'Support US', orgRole: 'support', orgIds: [3] },
    ],
    refetch: vi.fn(),
  }),
  useOrgDepartments: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useAllianceAdmin', () => ({
  useAllianceMembers: () => ({ data: [] }),
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

    expect(screen.getByRole('button', { name: 'Re-point', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unwire' })).toBeInTheDocument();
  });

  // Re-pointing at a NEW group would mint a second backing group and orphan the current
  // one; the backend 409s on it, so the picker must not offer it either.
    it('offers only OTHER existing groups when re-pointing — never the one it is wired to', () => {
    // Offering the group's own backing group is what read as "mapped to itself" on taco:
    // the backing group is named after the IdP group, so the row's current wiring showed
    // up in its own picker under the same name.
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 7, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();
    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options.some((label) => label.includes('Support EU'))).toBe(false);
    expect(options.some((label) => label.includes('Support US'))).toBe(true);
    expect(options.some((label) => label.startsWith('Org role'))).toBe(false);
  });

  it('labels a group by what it GRANTS, with its name second', () => {
    syncedGroups.push(baseGroup({}));
    renderCard();
    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options).toContain('Group — Support in Acme · Support US');
    // A group with no role and no workspace keeps its bare name.
    expect(options).toContain('Group — Support EU');
  });

  // A legacy alliance-role wiring has no group mapping to delete, so Unwire would have
  // nothing to act on — offering it would be a button that silently does nothing.
  it('does not offer unwire for a legacy alliance-role wiring', () => {
    syncedGroups.push(baseGroup({ wiredRole: { mappingId: 4, mappedRole: 'alliance_agent' } }));
    renderCard();

    expect(screen.queryByRole('button', { name: 'Unwire' })).not.toBeInTheDocument();
  });

  it('a wired row leads with editing the role and workspace, and keeps re-point one fold down', () => {
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 7, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();
    expect(screen.getByRole('button', { name: 'Edit role / workspace' })).toBeEnabled();
    expect(screen.getByText(/Re-point this IdP group at a different existing group/)).toBeInTheDocument();
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

    expect(screen.getByLabelText('Map to')).toHaveValue('orgrole:org_admin');
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
    expect(screen.getByLabelText('Map to')).toHaveValue('orgrole:associate');
  });
});

/**
 * A group wired ONLY to a legacy alliance role was locked out of workspace mapping: the card
 * branched on `wiredRole || wiredGroup`, so it rendered the re-point-only control — whose picker
 * lists existing alliance groups. On an alliance with none authored (taco, 2026-08-20) that select
 * is empty and Re-point never enables, leaving five real groups with members and no way to map
 * them to a workspace at all.
 *
 * The 409 that branch avoids is checked against GROUP mappings (`listGroupMappings`), so it never
 * fires for a role wire — the backend would have accepted the mapping the whole time.
 */
describe('a group wired only to a legacy alliance role', () => {
  it('offers the full workspace mapping UI, not just Re-point', () => {
    syncedGroups.push(
      baseGroup({ wiredRole: { mappingId: 4, mappedRole: 'alliance_agent' }, wiredGroup: null })
    );
    renderCard();

    expect(screen.getByLabelText('Map to')).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace')).toBeInTheDocument();
    expect(screen.queryByText('Re-point')).not.toBeInTheDocument();
  });

  it('warns that mapping replaces the legacy wire', () => {
    syncedGroups.push(
      baseGroup({ wiredRole: { mappingId: 4, mappedRole: 'alliance_agent' }, wiredGroup: null })
    );
    renderCard();

    expect(screen.getByText(/legacy alliance-role wire/)).toBeInTheDocument();
  });

  it('CONTROL: a group wired to a real group keeps the re-point-only branch', () => {
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 7, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();

    expect(screen.getByText('Re-point', { ignore: false })).toBeInTheDocument();
    expect(screen.queryByLabelText('Map to')).not.toBeInTheDocument();
  });
});

/**
 * The workspace picker is opt-IN.
 *
 * It defaulted to every active workspace, so an admin who mapped a group and never touched the
 * list granted that role across the whole alliance — including workspaces attached later. For a
 * control that can hand out ORG ADMIN, the broadest possible grant should not be what happens
 * when you don't look. The wire button already refuses an empty selection, so the failure mode
 * is a visible "select at least one" rather than a silent sweep.
 */
describe('workspace selection defaults', () => {
  // The control changed from a toggle list to a single select — a group maps to ONE
  // workspace — but the invariant is the same one, and for the same reason: a picker that
  // can hand out ORG ADMIN must not grant anything when you don't look at it.
  it('selects NO workspace until the admin picks one', () => {
    syncedGroups.push(baseGroup());
    renderCard();
    expect(screen.getByLabelText('Workspace')).toHaveValue('');
  });

  it('refuses to wire while nothing is selected, and says so', () => {
    syncedGroups.push(baseGroup());
    renderCard();
    expect(screen.getByRole('button', { name: /Map access/ })).toBeDisabled();
    expect(screen.getByText(/Choose one to map/)).toBeInTheDocument();
  });

  it('offers each workspace once, and no way to pick two', () => {
    // The cap is a product rule, not a schema one: the backend rejects a second id and the
    // control simply cannot express it.
    syncedGroups.push(baseGroup());
    renderCard();
    expect(screen.getByLabelText<HTMLSelectElement>('Workspace').multiple).toBe(false);
    expect(screen.getByRole('option', { name: 'Acme' })).toBeInTheDocument();
  });
});
