import { useMemo, useState } from 'react';
import { Users, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { OrgDepartmentPicker } from '@/components/console/OrgDepartmentPicker';
import { useAllianceGroups } from '@/hooks/useAllianceGroups';
import { useAllianceMembers, useAllianceOrgs } from '@/hooks/useAllianceAdmin';
import { GroupEditor } from '@/components/console/GroupEditor';
import { ORG_ROLE_LABELS, backingGroupName } from '@/components/console/backingGroupName';
import type { AllianceGroup, DepartmentIdsByOrg } from '@/services/alliance-groups.service';
import {
  useAllianceSyncedGroups,
  useDeleteAllianceGroupMap,
  useResyncAllianceProvisioning,
  useWireSyncedGroup,
} from '@/hooks/useAllianceProvisioning';
import type { AllianceOrg } from '@/services/alliance-admin.service';
import type { SyncedGroup, WireTarget } from '@/services/alliance-scim.service';
import { ORGANIZATION_ROLES, type OrganizationRole } from '@/types/roles';

/**
 * Synced IdP groups card — the single Approach-1 surface for the alliance Provisioning
 * section. The IdP pushes its groups; this lists them (member preview + current wired
 * state + a name-derived suggestion) and maps each, in place, to one of:
 *   - an alliance role (alliance_admin/alliance_agent — the elevation surface), OR
 *   - a specific ORG ROLE (org_admin/moderator/support/associate) scoped to chosen
 *     WORKSPACES — materialized as a backing alliance group via the `newGroup` wire, OR
 *   - an existing authored alliance group.
 * Wiring applies to the already-synced members immediately (backfill); "Re-sync now"
 * reconciles all synced members on demand — SCIM is push-driven with no reconcile cron.
 *
 * SECURITY: the suggestion only pre-selects the target; granting alliance-admin or
 * org-admin still requires an explicit, confirmed action.
 */


/**
 * The target select encodes each kind as `orgrole:<role>` or `group:<id>`.
 *
 * `role:<alliance role>` — wiring an IdP group straight to an alliance role — is gone
 * (Role-Model v2 §0.2: the two group-mapping layers collapse into one). An IdP group now
 * always maps to a workspace role, via a group.
 */
const parseSimpleTarget = (value: string): WireTarget | null => {
  if (value.startsWith('group:')) {
    const groupId = Number(value.slice('group:'.length));
    return Number.isFinite(groupId) ? { type: 'existingGroup', groupId } : null;
  }
  return null;
};

const orgRoleOf = (value: string): OrganizationRole | null => {
  if (!value.startsWith('orgrole:')) return null;
  const role = value.slice('orgrole:'.length);
  return (ORGANIZATION_ROLES as readonly string[]).includes(role)
    ? (role as OrganizationRole)
    : null;
};

/** A grant that needs an explicit confirm before it lands. */
const privilegedKind = (value: string): 'org_admin' | null =>
  value === 'orgrole:org_admin' ? 'org_admin' : null;

/** Backing-group name for an org-role wire — kept within the 120-char API limit. */
/**
 * ⛔ SYNCED IDP GROUPS ARE READ-ONLY HERE. They are the identity provider's objects; this
 * console MAPS them and nothing else.
 *
 * A "Remove" control used to sit on unwired groups, added so a group pushed by mistake could
 * be cleared. The customer whose IdP feeds this called it exactly backwards — a delete on an
 * object we do not own, which the provider's next push undoes anyway, reads as a broken
 * feature rather than a useful one. Wiring and unwiring stay: those are OUR side of the
 * mapping and are what this screen is for.
 *
 * The backend route still exists (`DELETE /scim/synced-groups/:id`) as an operator escape
 * hatch for a group the provider has genuinely stopped pushing. It is simply not a button.
 */
/**
 * What an authored group GRANTS, in words: "Associate in CoreSarms". The picker used to show
 * only the group's NAME, and a backing group minted by this screen is named after the IdP
 * group it mirrors — so "SSO - Odly - Coresarms - Associate" wired to
 * "SSO - Odly - Coresarms - Associate — Associate" read as a group mapped to itself.
 * A group with no role and no workspace (a fixture, or a bare authored group) keeps its name.
 */
export const describeGrant = (
  group: { name: string; orgRole?: OrganizationRole | null; orgIds?: number[] },
  orgs: { id: number; name: string }[]
): string | null => {
  const role = group.orgRole ? ORG_ROLE_LABELS[group.orgRole] : null;
  const names = (group.orgIds ?? [])
    .map((id) => orgs.find((org) => org.id === id)?.name ?? `workspace #${id}`);
  if (!role && names.length === 0) return null;
  return `${role ?? 'No role'} in ${names.length > 0 ? names.join(', ') : 'no workspace'}`;
};

/** The unwire confirm's body — what happens to the backing group, by how it came to exist. */
export const unwireDescription = (group: SyncedGroup | null): string => {
  const name = group?.wiredGroup?.groupName ? `"${group.wiredGroup.groupName}"` : 'its group';
  switch (group?.wiredGroup?.mintedByWire) {
    case true:
      return `New members will stop arriving from this IdP group, and ${name} — created by this mapping — is retired with it. Its members lose that role immediately.`;
    case false:
      return `New members will stop arriving from this IdP group. ${name} existed before the wire, so it keeps its role, workspaces and any members added by hand — nobody loses access right now.`;
    default:
      return `New members will stop arriving from this IdP group. If ${name} was created by this mapping it is retired with it and its members lose that role; a group you made by hand is kept.`;
  }
};

const wiredLabel = (
  group: SyncedGroup,
  grants: Map<number, string | null> = new Map()
): string => {
  // A pre-existing alliance-role wiring still WORKS and is still shown — new ones just
  // can't be created. Labelled as legacy so an admin knows to move it onto a group.
  if (group.wiredRole) {
    const role =
      group.wiredRole.mappedRole === 'alliance_admin' ? 'Alliance admin' : 'Alliance agent';
    return `Wired → ${role} (legacy)`;
  }
    if (group.wiredGroup) {
    const grant = grants.get(group.wiredGroup.groupId);
    return grant
      ? `Wired → ${grant} (group ${group.wiredGroup.groupName})`
      : `Wired → group ${group.wiredGroup.groupName}`;
  }
  return 'Not wired';
};

/** A single synced-group row: identity, members, and either its wired state or a wire control. */
const SyncedGroupRow = ({
    group,
  allianceId,
  targetOptions,
  grants,
  selectedValue,
  onSelect,
  activeOrgs,
  selectedOrgIds,
  onSelectOrg,
  deptsByOrg,
  onDeptChange,
  onWire,
  onUnwire,
  onEditBacking,
  canEditBacking,
  wiring,
}: {
    group: SyncedGroup;
  allianceId: number;
  targetOptions: { value: string; label: string }[];
  /** groupId → what it grants, for the wired label. */
  grants: Map<number, string | null>;
  selectedValue: string;
  onSelect: (value: string) => void;
  activeOrgs: AllianceOrg[];
  selectedOrgIds: number[];
  onSelectOrg: (orgId: number | null) => void;
  deptsByOrg: DepartmentIdsByOrg;
  onDeptChange: (orgId: number, deptIds: number[]) => void;
  onWire: () => void;
  onUnwire: () => void;
  /** Opens the backing group in the editor (role + workspace). */
  onEditBacking: () => void;
  canEditBacking: boolean;
  wiring: boolean;
}) => {
  const wired = group.wiredRole !== null || group.wiredGroup !== null;
  const selectedOrgRole = orgRoleOf(selectedValue);
  const isOrgRole = selectedOrgRole !== null;
  const noWorkspaceSelected = isOrgRole && selectedOrgIds.length === 0;
  /**
   * The one workspace this group maps to, or null. Named once rather than indexed at each
   * use: the list is a storage shape kept for the day several are allowed again, and the
   * screen only ever speaks about one.
   */
  const selectedOrgId = selectedOrgIds[0] ?? null;
  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex flex-wrap gap-2 justify-between items-start">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{group.displayName}</p>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {group.externalId ?? 'no external id from IdP'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant={wired ? 'success' : 'secondary'}>{wiredLabel(group, grants)}</Badge>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {group.memberCount === 0 ? (
          'No members synced yet'
        ) : (
          <span>
            <strong className="text-foreground">{group.memberCount}</strong> member
            {group.memberCount === 1 ? '' : 's'}:{' '}
            {group.members.map((member) => member.email).join(', ')}
          </span>
        )}
      </div>

      {group.externalId === null ? (
        <Alert variant="warning">
          <span className="text-sm">
            This group carries no external id from the IdP, so it cannot be mapped. Push it from
            your IdP with a stable external id to enable mapping.
          </span>
        </Alert>
      ) : group.wiredGroup !== null ? (
        /* Re-point-only, and deliberately so: this group already has a BACKING GROUP, and
           minting a second one would strand the first (still granting, still holding members).
           A group wired only to a legacy alliance ROLE has no backing group, so it takes the
           full mapping branch below — the backend's 409 checks group mappings, not role maps. */
        <div className="pt-1 space-y-2">
          {/* The wired row's FIRST question is "what does this grant, and how do I change it" —
              role and workspace, on the backing group. The owner mapped a group, saw only a
              picker of OTHER groups, and asked what it was for. Editing opens the same editor
              the Groups page uses for that backing group; re-pointing stays, one fold down. */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Only a group-backed wiring has a backing group to edit; a legacy alliance-role
                wiring is re-pointed below instead. */}
            {group.wiredGroup && (
              <Button type="button" onClick={onEditBacking} disabled={wiring || !canEditBacking}>
                Edit role / workspace
              </Button>
            )}
            {group.wiredGroup && (
              <Button type="button" variant="outline" onClick={onUnwire} disabled={wiring}>
                Unwire
              </Button>
            )}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              Re-point this IdP group at a different existing group
            </summary>
            <div className="flex flex-wrap gap-3 items-end pt-2">
            <div className="flex-1 min-w-[14rem]">
              <Label htmlFor={`rewire-target-${group.id}`} className="mb-1">
                Change mapping
              </Label>
              {/* Existing groups only. Re-pointing at a NEW group would mint a second
                  backing group and leave the current one behind, still holding its grant
                  and members — the backend refuses it (409); the UI shouldn't offer it. */}
              <Select
                id={`rewire-target-${group.id}`}
                value={selectedValue.startsWith('group:') ? selectedValue : ''}
                onChange={(event) => onSelect(event.target.value)}
              >
                              <option value="">Select a group…</option>
                {/* Not the group it is ALREADY wired to: re-pointing at itself is a no-op, and
                    offering it is exactly what read as "mapped to itself". */}
                {targetOptions
                  .filter(
                    (option) =>
                      option.value.startsWith('group:') &&
                      option.value !== `group:${group.wiredGroup?.groupId}`
                  )
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </Select>
            </div>
            <Button
              type="button"
              onClick={onWire}
              isLoading={wiring}
              disabled={wiring || !selectedValue.startsWith('group:')}
            >
              Re-point
            </Button>
            </div>
          </details>
        </div>
      ) : (
        <>
          {group.wiredRole && (
            <Alert variant="info">
              <span className="text-sm">
                This group currently grants{' '}
                <strong>
                  {group.wiredRole.mappedRole === 'alliance_admin'
                    ? 'Alliance admin'
                    : 'Alliance agent'}
                </strong>{' '}
                through a legacy alliance-role wire. Mapping it to a workspace role replaces that
                wire — members keep arriving, but their access comes from the group you choose here.
              </span>
            </Alert>
          )}
          {isOrgRole && (
            <div className="pt-1">
              <Label htmlFor={`wire-workspace-${group.id}`} className="mb-1">
                Workspace
              </Label>
              {activeOrgs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This alliance has no active workspaces yet.
                </p>
              ) : (
                <>
                  {/* One workspace per group. A group spanning two would place people in
                      two workspaces from one alliance-level decision, under admins who
                      cannot see each other's — and inside a workspace, placement and extra
                      permissions are the workspace admin's, per user.
                      ⛔ Presentation only: the state and the API stay a list, and the
                      backend caps it at one. Nothing has to be migrated to allow several
                      again. */}
                  <Select
                    id={`wire-workspace-${group.id}`}
                    value={selectedOrgId === null ? '' : String(selectedOrgId)}
                    onChange={(event) =>
                      onSelectOrg(event.target.value === '' ? null : Number(event.target.value))
                    }
                  >
                    <option value="">Select a workspace…</option>
                    {activeOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </Select>
                  {selectedOrgId !== null && selectedOrgRole !== 'org_admin' && (
                    <div className="pt-2">
                      <OrgDepartmentPicker
                        allianceId={allianceId}
                        orgId={selectedOrgId}
                        orgLabel={activeOrgs.find((org) => org.id === selectedOrgId)?.name ?? ''}
                        selected={deptsByOrg[selectedOrgId] ?? []}
                        onChange={(deptIds) => onDeptChange(selectedOrgId, deptIds)}
                      />
                    </div>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Members get this role in this workspace.
                    {selectedOrgRole === 'org_admin'
                      ? ' Org admins get every department.'
                      : ' Leave departments empty for the role default.'}
                    {noWorkspaceSelected ? ' Choose one to map.' : ''}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-end pt-1">
            <div className="flex-1 min-w-[14rem]">
              <Label htmlFor={`wire-target-${group.id}`} className="mb-1">
                Map to
              </Label>
              <Select
                id={`wire-target-${group.id}`}
                value={selectedValue}
                onChange={(event) => onSelect(event.target.value)}
              >
                {targetOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              onClick={onWire}
              isLoading={wiring}
              disabled={wiring || noWorkspaceSelected}
            >
              <ShieldCheck className="mr-2 w-4 h-4" />
              Map access
            </Button>
          </div>

          {/* Hidden against a backend that still returns the old alliance-role shape —
              showing "Associate" for a suggestion the server never made would be a
              guess dressed as advice. */}
          {group.suggestion?.orgRole && (
            <p className="flex gap-1 items-center text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3 shrink-0" />
              Suggested: <strong>{ORG_ROLE_LABELS[group.suggestion.orgRole]}</strong> —{' '}
              {group.suggestion.rationale}
            </p>
          )}
        </>
      )}
    </Card>
  );
};

export const SyncedGroupsCard = ({ allianceId }: { allianceId: number }) => {
  const groupsQuery = useAllianceSyncedGroups(allianceId);
  const allianceGroupsQuery = useAllianceGroups(allianceId);
  const orgsQuery = useAllianceOrgs(allianceId);
  const wire = useWireSyncedGroup(allianceId);
  const unwire = useDeleteAllianceGroupMap(allianceId);
  const [unwireConfirm, setUnwireConfirm] = useState<SyncedGroup | null>(null);
  const [editingBacking, setEditingBacking] = useState<AllianceGroup | null>(null);
  const membersQuery = useAllianceMembers(allianceId);
  const resync = useResyncAllianceProvisioning(allianceId);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<number, string>>({});
  const [orgIdsByGroup, setOrgIdsByGroup] = useState<Record<number, number[]>>({});
  // Per synced group → per workspace → mapped department ids (org-role wires only).
  const [deptsByGroup, setDeptsByGroup] = useState<Record<number, DepartmentIdsByOrg>>({});
  const [adminConfirm, setAdminConfirm] = useState<{
    group: SyncedGroup;
    target: WireTarget;
    kind: 'org_admin';
  } | null>(null);

  const synced = groupsQuery.data ?? [];
  const activeOrgs = useMemo(
    () => (orgsQuery.data ?? []).filter((org) => org.active),
    [orgsQuery.data]
  );

  // Target options: the four workspace roles (scoped to workspaces below), then every
  // authored alliance group. The two alliance-role entries were removed — an IdP group
  // maps to a workspace role, never to an alliance role.
  const targetOptions = useMemo(
    () => [
      ...ORGANIZATION_ROLES.map((role) => ({
        value: `orgrole:${role}`,
        label: `Org role — ${ORG_ROLE_LABELS[role]}`,
      })),
            ...(allianceGroupsQuery.data ?? []).map((group) => {
        const grant = describeGrant(group, orgsQuery.data ?? []);
        return {
          value: `group:${group.id}`,
          // What it GRANTS first, its name second: the name of a backing group is the IdP
          // group's own name, which is the last thing that helps here.
          label: grant ? `Group — ${grant} · ${group.name}` : `Group — ${group.name}`,
        };
      }),
    ],
    [allianceGroupsQuery.data, orgsQuery.data]
  );
  /** groupId → grant sentence, for the wired badge on each row. */
  const grants = useMemo(
    () =>
      new Map(
        (allianceGroupsQuery.data ?? []).map((group) => [
          group.id,
          describeGrant(group, orgsQuery.data ?? []),
        ])
      ),
    [allianceGroupsQuery.data, orgsQuery.data]
  );

  const defaultValueFor = (group: SyncedGroup): string =>
    `orgrole:${group.suggestion?.orgRole ?? 'associate'}`;

  const selectedValueFor = (group: SyncedGroup): string =>
    selectedByGroup[group.id] ?? defaultValueFor(group);

  // Nothing selected until an admin chooses. This control can hand out ORG ADMIN across every
  // workspace in the alliance — including ones attached later — so defaulting to all-active made
  // the broadest possible grant the thing that happens when you don't look. The wire button
  // already refuses an empty selection, so the failure mode is a visible "select at least one",
  // not a silent sweep. Opt in, not opt out.
  const orgIdsFor = (group: SyncedGroup): number[] => orgIdsByGroup[group.id] ?? [];

  /**
   * A group maps to ONE workspace, so picking one replaces the choice rather than adding
   * to it. The state stays an array — `alliance_group_orgs` is still many-to-many, and the
   * rule is "one for now, plausibly many later", so nothing here has to be migrated when
   * that comes back. The backend enforces the same cap on the write.
   */
  const selectOrgFor = (group: SyncedGroup, orgId: number | null) => {
    setOrgIdsByGroup((prev) => ({ ...prev, [group.id]: orgId === null ? [] : [orgId] }));
    // Department mappings are keyed by workspace; the previous workspace's are now about a
    // workspace this group no longer touches, and wiring them would scope a mapping to an
    // org the grant does not cover.
    setDeptsByGroup((prev) => {
      const forGroup = prev[group.id];
      if (!forGroup) return prev;
      const kept = orgId !== null && orgId in forGroup ? { [orgId]: forGroup[orgId] } : {};
      return { ...prev, [group.id]: kept };
    });
  };

  const deptsFor = (group: SyncedGroup): DepartmentIdsByOrg => deptsByGroup[group.id] ?? {};

  const setDeptsForGroupOrg = (group: SyncedGroup, orgId: number, deptIds: number[]) => {
    setDeptsByGroup((prev) => ({
      ...prev,
      [group.id]: { ...(prev[group.id] ?? {}), [orgId]: deptIds },
    }));
  };

  /**
   * Wire the group. No read-back: this screen no longer ASKS for permissions, so there is
   * nothing whose arrival needs confirming. The backing group is minted with its role's
   * defaults, and any permission a member needs beyond that is a per-user decision made
   * inside the workspace (EditUserPage), which already survives the alliance reconcile.
   */
  const submitWire = async (group: SyncedGroup, target: WireTarget) => {
    if (!group.externalId) return;
    try {
      await wire.mutateAsync({ idpGroupExternalId: group.externalId, target });
    } catch {
      // the mutation already reported it
    }
  };

  const buildTarget = (group: SyncedGroup, value: string): WireTarget | null => {
    const orgRole = orgRoleOf(value);
    if (orgRole) {
      const orgIds = orgIdsFor(group);
      if (orgIds.length === 0) return null;
      // Org admins get every department, so a dept mapping is meaningless for them —
      // only carry it for scoped roles, and only for orgs still selected.
      const groupDepts = deptsFor(group);
      const departmentIdsByOrg =
        orgRole === 'org_admin'
          ? {}
          : Object.fromEntries(
              orgIds
                .map((orgId) => [orgId, groupDepts[orgId] ?? []] as const)
                .filter(([, deptIds]) => deptIds.length > 0)
            );
      // `permissionOverrides` is deliberately NOT sent. The alliance admin picks an access
      // LEVEL here; hand-picking a permission set is not theirs to do. Overrides already
      // stored on a backing group stay stored and keep being applied by the fan-out — this
      // only stops new ones being authored from this screen.
      return {
        type: 'newGroup',
        name: backingGroupName(group.displayName, orgRole),
        orgRole,
        orgIds,
        departmentIdsByOrg,
      };
    }
    return parseSimpleTarget(value);
  };

  const handleWire = (group: SyncedGroup) => {
    const value = selectedValueFor(group);
    const target = buildTarget(group, value);
    if (!target) return;
    const kind = privilegedKind(value);
    if (kind) {
      setAdminConfirm({ group, target, kind });
      return;
    }
    void submitWire(group, target);
  };

  const confirmText = 'Grant org admin';
  const confirmTitle =
    adminConfirm === null ? '' : `Grant org admin to ${adminConfirm.group.displayName}?`;
  const confirmDescription =
    'Every current and future member of this IdP group will gain org-admin rights in the selected workspaces. Already-synced members are updated immediately. Only confirm if you intend to grant workspace administration.';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap gap-2 justify-between items-start">
          <div>
            <CardTitle className="flex gap-2 items-center">
              <Users className="w-5 h-5 text-primary" />
              Synced IdP groups
            </CardTitle>
            <CardDescription>
              Groups your identity provider has pushed. Map one to an alliance role, an org role in
              specific workspaces, or an authored alliance group — its already-synced members update
              immediately, no re-push needed.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => resync.mutate()}
            isLoading={resync.isPending}
            disabled={resync.isPending || synced.length === 0}
          >
            <RefreshCw className="mr-2 w-4 h-4" />
            Re-sync now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {groupsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : synced.length === 0 ? (
          <Alert variant="info">
            <span className="text-sm">
              No IdP groups have synced yet. They appear here after your IdP first pushes a group
              that has members. If your IdP is connected but nothing shows, confirm a group (not
              just users) is assigned to the SCIM app.
            </span>
          </Alert>
        ) : (
          synced.map((group) => (
            <SyncedGroupRow
              key={group.id}
              group={group}
              allianceId={allianceId}
                            targetOptions={targetOptions}
              grants={grants}
              canEditBacking={Boolean(
                (allianceGroupsQuery.data ?? []).find(
                  (candidate) => candidate.id === group.wiredGroup?.groupId
                )
              )}
              onEditBacking={() =>
                setEditingBacking(
                  (allianceGroupsQuery.data ?? []).find(
                    (candidate) => candidate.id === group.wiredGroup?.groupId
                  ) ?? null
                )
              }
              selectedValue={selectedValueFor(group)}
              onSelect={(value) => setSelectedByGroup((prev) => ({ ...prev, [group.id]: value }))}
              activeOrgs={activeOrgs}
              selectedOrgIds={orgIdsFor(group)}
              onSelectOrg={(orgId) => selectOrgFor(group, orgId)}
              deptsByOrg={deptsFor(group)}
              onDeptChange={(orgId, deptIds) => setDeptsForGroupOrg(group, orgId, deptIds)}
              onWire={() => handleWire(group)}
              onUnwire={() => setUnwireConfirm(group)}
              wiring={wire.isPending || unwire.isPending}
            />
          ))
        )}
      </CardContent>

      {/* Mounted only while editing: the editor's own hooks must not run for every row. */}
      {editingBacking !== null && (
        <GroupEditor
          open
          onClose={() => setEditingBacking(null)}
          allianceId={allianceId}
          group={editingBacking}
          orgs={orgsQuery.data ?? []}
          members={membersQuery.data ?? []}
        />
      )}
      <ConfirmDialog
        open={adminConfirm !== null}
        onOpenChange={(open) => !open && setAdminConfirm(null)}
        onConfirm={() => {
          if (adminConfirm) void submitWire(adminConfirm.group, adminConfirm.target);
          setAdminConfirm(null);
        }}
        variant="danger"
        confirmText={confirmText}
        title={confirmTitle}
        description={confirmDescription}
      />

      {/* An unwire is ONE action on one thing: a backing group this screen minted is retired
          with its mapping and the members lose that grant; a group the admin wired by hand
          existed before the wire and is kept. Say which BEFORE the confirm — the earlier copy
          promised "nobody loses access right now" for both, which is now false for the
          common case. An older backend omits `mintedByWire`; then the honest word is "may". */}
      <ConfirmDialog
        open={unwireConfirm !== null}
        onOpenChange={(open) => !open && setUnwireConfirm(null)}
        onConfirm={() => {
          const mappingId = unwireConfirm?.wiredGroup?.mappingId;
          setUnwireConfirm(null);
          if (mappingId !== undefined) unwire.mutate(mappingId);
        }}
        variant={unwireConfirm?.wiredGroup?.mintedByWire === false ? 'warning' : 'danger'}
        confirmText="Unwire"
        cancelText="Keep wired"
        title={unwireConfirm ? `Unwire ${unwireConfirm.displayName}?` : ''}
        description={unwireDescription(unwireConfirm)}
      />
    </Card>
  );
};
