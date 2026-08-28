/**
 * Wiring an IdP group can set the backing group's PERMISSIONS, not just its role and
 * workspaces (BE #469).
 *
 * The hazard this pins is not the happy path — it is the skew. The wire endpoint's
 * `permissionOverrides` ships separately from this app, and a backend without it does not
 * fail: zod strips the unknown key and answers 200. The mapping lands, the customization
 * vanishes, and it vanishes in the PERMISSIVE direction — a permission the admin removed
 * stays granted. So the card reads the backing group back and says what actually happened,
 * and these tests hold that reading to three distinct answers: it landed, it was dropped,
 * or this build cannot tell.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SyncedGroupsCard } from '@/components/console/SyncedGroupsCard';
import type { SyncedGroup, WireResult, WireTarget } from '@/services/alliance-scim.service';
import type { AllianceGroup } from '@/services/alliance-groups.service';

const syncedGroups: SyncedGroup[] = [];
/** What the alliance-groups query answers when the card re-reads it after a wire. */
let groupsAfterWire: AllianceGroup[] = [];

const wireMutateAsync =
  vi.fn<(input: { idpGroupExternalId: string; target: WireTarget }) => Promise<WireResult>>();
const refetchGroups = vi.fn<() => Promise<{ data: AllianceGroup[] }>>();

vi.mock('@/hooks/useAllianceProvisioning', () => ({
  useAllianceSyncedGroups: () => ({ data: syncedGroups, isLoading: false }),
  useWireSyncedGroup: () => ({ mutateAsync: wireMutateAsync, isPending: false }),
  useResyncAllianceProvisioning: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAllianceGroupMap: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAllianceGroups', () => ({
  useAllianceGroups: () => ({ data: [{ id: 9, name: 'Support EU' }], refetch: refetchGroups }),
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

/** The backing group the wire mints, seen from the groups API. */
const backingGroup = (permissionOverrides?: AllianceGroup['permissionOverrides']): AllianceGroup => ({
  id: 21,
  name: 'SSO - Odly - Support — Associate',
  description: null,
  orgRole: 'associate',
  ...(permissionOverrides !== undefined && { permissionOverrides }),
  idpGroup: { mappingId: 5, externalId: 'ext-1', displayName: 'SSO - Odly - Support' },
  orgIds: [3],
  departmentIdsByOrg: {},
  memberIds: [],
  memberCount: 2,
});

const renderCard = () =>
  render(
    <ThemeProvider>
      <SyncedGroupsCard allianceId={1} />
    </ThemeProvider>
  );

/** Select a workspace and customize one permission, then map. */
const wireWithCustomPermission = async () => {
  const user = userEvent.setup();
  // One workspace per group: chosen from a select now, not toggled on.
  await user.selectOptions(screen.getByLabelText('Workspace'), 'Acme');
  await user.click(screen.getByRole('button', { name: /Customize permissions/i }));
  await user.click(screen.getByLabelText('View Audit Logs'));
  await user.click(screen.getByRole('button', { name: /Map access/i }));
  return user;
};

const sentTarget = (): WireTarget => wireMutateAsync.mock.calls[0][0].target;

/** The same target, narrowed — the overrides only exist on the newGroup variant. */
const sentNewGroupTarget = () => {
  const target = sentTarget();
  if (target.type !== 'newGroup') throw new Error(`expected a newGroup target, got ${target.type}`);
  return target;
};

beforeEach(() => {
  syncedGroups.length = 0;
  groupsAfterWire = [];
  wireMutateAsync.mockReset().mockResolvedValue({ externalId: 'ext-1', wired: 'newGroup', usersReconciled: 2 });
  refetchGroups.mockReset().mockImplementation(() => Promise.resolve({ data: groupsAfterWire }));
  cleanup();
});

describe('SyncedGroupsCard permission overrides', () => {
  it('sends the customized permissions with the wire', async () => {
    syncedGroups.push(baseGroup());
    groupsAfterWire = [backingGroup({ added: ['view_audit_logs'], removed: [] })];
    renderCard();

    await wireWithCustomPermission();

    await waitFor(() => expect(wireMutateAsync).toHaveBeenCalledTimes(1));
    const target = sentNewGroupTarget();
    expect([
      ...(target.permissionOverrides?.added ?? []),
      ...(target.permissionOverrides?.removed ?? []),
    ]).toContain('view_audit_logs');
  });

  // An untouched form must be indistinguishable from an older client: sending an empty
  // object would be a customization of "nothing", not the absence of one.
  it('omits the key entirely when nothing was customized', async () => {
    syncedGroups.push(baseGroup());
    renderCard();
    const user = userEvent.setup();

    // One workspace per group: chosen from a select now, not toggled on.
  await user.selectOptions(screen.getByLabelText('Workspace'), 'Acme');
    await user.click(screen.getByRole('button', { name: /Map access/i }));

    await waitFor(() => expect(wireMutateAsync).toHaveBeenCalledTimes(1));
    expect('permissionOverrides' in sentTarget()).toBe(false);
    // ...and nothing was read back, because there was nothing to verify.
    expect(refetchGroups).not.toHaveBeenCalled();
  });

  it('warns that the server dropped them when the backing group comes back without them', async () => {
    syncedGroups.push(baseGroup());
    groupsAfterWire = [backingGroup({ added: [], removed: [] })];
    renderCard();

    await wireWithCustomPermission();

    expect(await screen.findByText(/did not save the custom permissions/i)).toBeInTheDocument();
  });

  // Absent is not empty. A build that cannot report a group's IdP wiring tells us nothing
  // about the permissions, and the copy must not claim it does.
  it('says it cannot confirm when the backing group cannot be found', async () => {
    syncedGroups.push(baseGroup());
    groupsAfterWire = [];
    renderCard();

    await wireWithCustomPermission();

    expect(await screen.findByText(/cannot confirm the custom permissions/i)).toBeInTheDocument();
    expect(screen.queryByText(/did not save the custom permissions/i)).not.toBeInTheDocument();
  });

  // CONTROL: the warning must be able to STAY AWAY, or the two tests above would pass
  // simply because the card warns after every wire.
  it('stays silent when the permissions come back applied', async () => {
    syncedGroups.push(baseGroup());
    groupsAfterWire = [backingGroup({ added: ['view_audit_logs'], removed: [] })];
    renderCard();

    await wireWithCustomPermission();

    await waitFor(() => expect(refetchGroups).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/custom permissions/i)).not.toBeInTheDocument();
  });

  // Re-pointing at an EXISTING group must not offer the control: that group already carries
  // its own overrides, authored on the group screen, and the wire endpoint has no field to
  // change them. Offering the section would promise an edit that cannot be sent.
  it('offers no permissions control when re-pointing at an existing group', () => {
    syncedGroups.push(
      baseGroup({ wiredGroup: { mappingId: 5, groupId: 9, groupName: 'Support EU' } })
    );
    renderCard();

    expect(screen.queryByRole('button', { name: /Customize permissions/i })).not.toBeInTheDocument();
  });
});
