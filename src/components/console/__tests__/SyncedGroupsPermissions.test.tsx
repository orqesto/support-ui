/**
 * Group-level permission authoring is GONE from the alliance console.
 *
 * An alliance admin picks an access LEVEL (a role). Hand-picking a permission set for a
 * whole IdP group is not their decision to make — the per-member exception belongs inside
 * the workspace (`EditUserPage`), where it already survives the alliance reconcile.
 *
 * Two surfaces used to author it and BOTH are covered here, because removing one and
 * leaving the other would have been cosmetic: the wire card (`SyncedGroupsCard`, which sent
 * `permissionOverrides` with the wire) and the group drawer (`GroupEditor`).
 *
 * ⛔ Removing the CONTROL must not remove the stored VALUES. A group that already carries
 * overrides keeps them, and the fan-out keeps applying them. What guarantees that is the
 * key being absent from the request rather than sent as `{}` — `updateGroup` only writes
 * the column when the field is present (`allianceGroupService.ts:325`), while `{}` would be
 * read as "clear". The last test pins exactly that, and it is the one that would catch a
 * well-meaning simplification that "tidies up" the omission into an empty object.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SyncedGroupsCard } from '@/components/console/SyncedGroupsCard';
import { GroupEditor } from '@/components/console/GroupEditor';
import type { SyncedGroup, WireResult, WireTarget } from '@/services/alliance-scim.service';
import type { AllianceGroup } from '@/services/alliance-groups.service';
import type { GroupDraft } from '@/hooks/useAllianceGroups';
import type { AllianceMember } from '@/services/alliance-admin.service';

const syncedGroups: SyncedGroup[] = [];

const wireMutateAsync =
  vi.fn<(input: { idpGroupExternalId: string; target: WireTarget }) => Promise<WireResult>>();
const refetchGroups = vi.fn<() => Promise<{ data: AllianceGroup[] }>>();
const saveMutate = vi.fn<(input: { original: AllianceGroup | null; draft: GroupDraft }) => void>();

vi.mock('@/hooks/useAllianceProvisioning', () => ({
  useAllianceSyncedGroups: () => ({ data: syncedGroups, isLoading: false }),
  useWireSyncedGroup: () => ({ mutateAsync: wireMutateAsync, isPending: false }),
  useResyncAllianceProvisioning: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAllianceGroupMap: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveSyncedGroup: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useAllianceGroups', () => ({
  useAllianceGroups: () => ({ data: [{ id: 9, name: 'Support EU' }], refetch: refetchGroups }),
  useOrgDepartments: () => ({ data: [], isLoading: false }),
  useSaveGroup: () => ({ mutate: saveMutate, isPending: false }),
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

const members: AllianceMember[] = [
  {
    userId: 11,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    allianceRole: 'alliance_agent',
    effectiveRoles: [],
  },
];

const authoredGroup = (overrides: Partial<AllianceGroup> = {}): AllianceGroup =>
  ({
    id: 5,
    name: 'Support EU',
    description: null,
    orgRole: 'support',
    orgIds: [],
    departmentIdsByOrg: {},
    memberIds: [11],
    memberCount: 1,
    ...overrides,
  }) as AllianceGroup;

const renderCard = () =>
  render(
    <ThemeProvider>
      <SyncedGroupsCard allianceId={1} />
    </ThemeProvider>
  );

const renderEditor = (value: AllianceGroup | null) =>
  render(
    <ThemeProvider>
      <GroupEditor open onClose={vi.fn()} allianceId={1} group={value} orgs={[]} members={members} />
    </ThemeProvider>
  );

const sentTarget = (): WireTarget => wireMutateAsync.mock.calls[0][0].target;

beforeEach(() => {
  syncedGroups.length = 0;
  wireMutateAsync
    .mockReset()
    .mockResolvedValue({ externalId: 'ext-1', wired: 'newGroup', usersReconciled: 2 });
  refetchGroups.mockReset().mockResolvedValue({ data: [] });
  saveMutate.mockReset();
  cleanup();
});

describe('the wire card no longer authors permissions', () => {
  it('offers no permissions control once a workspace role is selected', async () => {
    syncedGroups.push(baseGroup());
    renderCard();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Workspace'), 'Acme');

    expect(
      screen.queryByRole('button', { name: /Customize permissions/i })
    ).not.toBeInTheDocument();
  });

  // CONTROL for the test above. An absent button proves nothing if the row never rendered
  // its wire form at all — this pins that the surrounding controls ARE present, so the
  // permissions section is missing because it was removed, not because the card is blank.
  it('still renders the wire form it used to host that control on', async () => {
    syncedGroups.push(baseGroup());
    renderCard();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Workspace'), 'Acme');

    expect(screen.getByLabelText('Workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Map access/i })).toBeInTheDocument();
  });

  // ⚠️ Weaker than it looks, deliberately kept: an untouched form omitted the key on the
  // old code too, so this does NOT by itself prove the control is gone (the first test
  // does that). It pins the payload contract going forward — the key must never appear.
  it('never sends permissionOverrides with the wire', async () => {
    syncedGroups.push(baseGroup());
    renderCard();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Workspace'), 'Acme');
    await user.click(screen.getByRole('button', { name: /Map access/i }));

    await waitFor(() => expect(wireMutateAsync).toHaveBeenCalledTimes(1));
    expect('permissionOverrides' in sentTarget()).toBe(false);
  });

  // The card used to wire, then re-read the backing group to find out whether the
  // permissions it asked for had survived. It asks for none now, so there is nothing whose
  // arrival needs confirming — and a read-back left behind would be a request per wire
  // spent proving a fact about a field this screen no longer sends.
  it('does not read the backing group back after wiring', async () => {
    syncedGroups.push(baseGroup());
    renderCard();
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('Workspace'), 'Acme');
    await user.click(screen.getByRole('button', { name: /Map access/i }));

    await waitFor(() => expect(wireMutateAsync).toHaveBeenCalledTimes(1));
    expect(refetchGroups).not.toHaveBeenCalled();
  });
});

describe('the group drawer no longer authors permissions', () => {
  // The fixture must CARRY overrides: the old editor gated this control on
  // `permissionOverrides !== undefined`, so a group without the field would hide it either
  // way and the test would gate nothing.
  it('offers no permissions control for a group that already carries overrides', () => {
    renderEditor(
      authoredGroup({ permissionOverrides: { added: ['view_audit_logs'], removed: [] } })
    );

    expect(
      screen.queryByRole('button', { name: /Customize permissions/i })
    ).not.toBeInTheDocument();
  });

  // CONTROL: the drawer did render, so the absence above is the removal and not an
  // editor that failed to mount.
  it('still renders the rest of the editor', () => {
    renderEditor(authoredGroup());

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  /**
   * THE ONE THAT MATTERS. Saving a group that already carries overrides must leave them
   * alone. The key has to be ABSENT — `undefined` is dropped from the request by
   * `useSaveGroup`, whereas `{}` would reach the BE and clear the column.
   */
  it('omits permissionOverrides from the draft, leaving stored values intact', () => {
    renderEditor(
      authoredGroup({ permissionOverrides: { added: ['view_audit_logs'], removed: [] } })
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Support EMEA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(saveMutate).toHaveBeenCalledTimes(1);
    const { draft } = saveMutate.mock.calls[0][0];
    expect(draft.name).toBe('Support EMEA');
    expect('permissionOverrides' in draft).toBe(false);
    expect(draft.permissionOverrides).toBeUndefined();
  });
});
