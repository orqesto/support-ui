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
import { Toggle } from '@/components/ui/Toggle';
import { OrgDepartmentPicker } from '@/components/console/OrgDepartmentPicker';
import { PermissionOverridesSection } from '@/components/shared/PermissionOverridesSection';
import { useAllianceGroups } from '@/hooks/useAllianceGroups';
import { useAllianceOrgs } from '@/hooks/useAllianceAdmin';
import type { DepartmentIdsByOrg } from '@/services/alliance-groups.service';
import {
  useAllianceSyncedGroups,
  useDeleteAllianceGroupMap,
  useResyncAllianceProvisioning,
  useWireSyncedGroup,
} from '@/hooks/useAllianceProvisioning';
import type { AllianceOrg } from '@/services/alliance-admin.service';
import type { SyncedGroup, WireTarget } from '@/services/alliance-scim.service';
import {
  ORGANIZATION_ROLES,
  overridesEqual,
  type OrganizationRole,
  type PermissionOverrides,
} from '@/types/roles';

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

const ORG_ROLE_LABELS: Record<OrganizationRole, string> = {
  org_admin: 'Org admin',
  moderator: 'Moderator',
  support: 'Support',
  associate: 'Associate',
};

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

/**
 * What we could establish about the permissions a wire ASKED for, after reading the backing
 * group back. `null` — they landed, or none were asked for.
 *   'dropped'     — the group came back without them: the server predates the field.
 *   'unconfirmed' — the group could not be found from its IdP wiring, so this build cannot
 *                   tell either way. Absent is not empty; saying "dropped" here would be a
 *                   guess dressed as a finding.
 */
type OverridesVerdict = 'dropped' | 'unconfirmed';

/** A grant that needs an explicit confirm before it lands. */
const privilegedKind = (value: string): 'org_admin' | null =>
  value === 'orgrole:org_admin' ? 'org_admin' : null;

/** Backing-group name for an org-role wire — kept within the 120-char API limit. */
const backingGroupName = (displayName: string, role: OrganizationRole): string =>
  `${displayName} — ${ORG_ROLE_LABELS[role]}`.slice(0, 120);

const wiredLabel = (group: SyncedGroup): string => {
  // A pre-existing alliance-role wiring still WORKS and is still shown — new ones just
  // can't be created. Labelled as legacy so an admin knows to move it onto a group.
  if (group.wiredRole) {
    const role = group.wiredRole.mappedRole === 'alliance_admin' ? 'Alliance admin' : 'Alliance agent';
    return `Wired → ${role} (legacy)`;
  }
  if (group.wiredGroup) return `Wired → group ${group.wiredGroup.groupName}`;
  return 'Not wired';
};

/** A single synced-group row: identity, members, and either its wired state or a wire control. */
const SyncedGroupRow = ({
  group,
  allianceId,
  targetOptions,
  selectedValue,
  onSelect,
  activeOrgs,
  selectedOrgIds,
  onToggleOrg,
  deptsByOrg,
  onDeptChange,
  permissionOverrides,
  onOverridesChange,
  overridesVerdict,
  onWire,
  onUnwire,
  wiring,
}: {
  group: SyncedGroup;
  allianceId: number;
  targetOptions: { value: string; label: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  activeOrgs: AllianceOrg[];
  selectedOrgIds: number[];
  onToggleOrg: (orgId: number) => void;
  deptsByOrg: DepartmentIdsByOrg;
  onDeptChange: (orgId: number, deptIds: number[]) => void;
  permissionOverrides: PermissionOverrides;
  onOverridesChange: (next: PermissionOverrides) => void;
  overridesVerdict: OverridesVerdict | null;
  onWire: () => void;
  onUnwire: () => void;
  wiring: boolean;
}) => {
  const wired = group.wiredRole !== null || group.wiredGroup !== null;
  const selectedOrgRole = orgRoleOf(selectedValue);
  const isOrgRole = selectedOrgRole !== null;
  const noWorkspaceSelected = isOrgRole && selectedOrgIds.length === 0;
  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex flex-wrap gap-2 justify-between items-start">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{group.displayName}</p>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {group.externalId ?? 'no external id from IdP'}
          </p>
        </div>
        <Badge variant={wired ? 'success' : 'secondary'}>{wiredLabel(group)}</Badge>
      </div>

      <div className="text-sm text-muted-foreground">
        {group.memberCount === 0 ? (
          'No members synced yet'
        ) : (
          <span>
            <strong className="text-foreground">{group.memberCount}</strong>{' '}
            member{group.memberCount === 1 ? '' : 's'}: {group.members.map((member) => member.email).join(', ')}
          </span>
        )}
      </div>

      {overridesVerdict !== null && (
        <Alert variant="warning">
          <span className="text-sm">
            {overridesVerdict === 'dropped'
              ? 'Access was mapped, but this server did not save the custom permissions — it predates them. Members get the role’s defaults, which may be MORE than you selected. Re-apply them by editing the group once the server is updated.'
              : 'Access was mapped, but this build cannot confirm the custom permissions were saved. Open the backing group and check its permissions.'}
          </span>
        </Alert>
      )}

      {group.externalId === null ? (
        <Alert variant="warning">
          <span className="text-sm">
            This group carries no external id from the IdP, so it cannot be mapped. Push it from your
            IdP with a stable external id to enable mapping.
          </span>
        </Alert>
      ) : group.wiredGroup !== null ? (
        /* Re-point-only, and deliberately so: this group already has a BACKING GROUP, and
           minting a second one would strand the first (still granting, still holding members).
           A group wired only to a legacy alliance ROLE has no backing group, so it takes the
           full mapping branch below — the backend's 409 checks group mappings, not role maps. */
        <div className="flex flex-wrap gap-3 items-end pt-1">
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
              {targetOptions
                .filter((option) => option.value.startsWith('group:'))
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
          {group.wiredGroup && (
            <Button type="button" variant="outline" onClick={onUnwire} disabled={wiring}>
              Unwire
            </Button>
          )}
        </div>
      ) : (
        <>
          {group.wiredRole && (
            <Alert variant="info">
              <span className="text-sm">
                This group currently grants{' '}
                <strong>
                  {group.wiredRole.mappedRole === 'alliance_admin' ? 'Alliance admin' : 'Alliance agent'}
                </strong>{' '}
                through a legacy alliance-role wire. Mapping it to a workspace role replaces that
                wire — members keep arriving, but their access comes from the group you choose here.
              </span>
            </Alert>
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

          {isOrgRole && (
            <div className="pt-1">
              <Label className="mb-1">Workspaces</Label>
              {activeOrgs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This alliance has no active workspaces yet.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {activeOrgs.map((org) => (
                      <div key={org.id} className="space-y-1.5">
                        <Toggle
                          checked={selectedOrgIds.includes(org.id)}
                          onChange={() => onToggleOrg(org.id)}
                          label={org.name}
                        />
                        {selectedOrgIds.includes(org.id) && selectedOrgRole !== 'org_admin' && (
                          <OrgDepartmentPicker
                            allianceId={allianceId}
                            orgId={org.id}
                            orgLabel={org.name}
                            selected={deptsByOrg[org.id] ?? []}
                            onChange={(deptIds) => onDeptChange(org.id, deptIds)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Members get this role in the selected workspaces ({selectedOrgIds.length}{' '}
                    selected).
                    {selectedOrgRole === 'org_admin'
                      ? ' Org admins get every department.'
                      : ' Leave a workspace’s departments empty for the role default.'}
                    {noWorkspaceSelected ? ' Select at least one to map.' : ''}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Same control the group editor uses, on the same grant: the backing group this
              wire mints is authored here and nowhere else, so without it an IdP-wired group
              could only be finished by opening a second screen. Existing-group targets get
              no section — that group already carries its own overrides, and re-pointing
              must not silently rewrite them. */}
          {selectedOrgRole !== null && (
            <div className="pt-1">
              <PermissionOverridesSection
                role={selectedOrgRole}
                value={permissionOverrides}
                onChange={onOverridesChange}
              />
            </div>
          )}

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
  const resync = useResyncAllianceProvisioning(allianceId);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<number, string>>({});
  const [orgIdsByGroup, setOrgIdsByGroup] = useState<Record<number, number[]>>({});
  // Per synced group → per workspace → mapped department ids (org-role wires only).
  const [deptsByGroup, setDeptsByGroup] = useState<Record<number, DepartmentIdsByOrg>>({});
  // Per synced group → permissions the backing group should grant on top of its role.
  const [overridesByGroup, setOverridesByGroup] = useState<Record<number, PermissionOverrides>>({});
  const [verdictByGroup, setVerdictByGroup] = useState<Record<number, OverridesVerdict>>({});
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
      ...(allianceGroupsQuery.data ?? []).map((group) => ({
        value: `group:${group.id}`,
        label: `Group — ${group.name}`,
      })),
    ],
    [allianceGroupsQuery.data]
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

  const toggleOrgFor = (group: SyncedGroup, orgId: number) => {
    setOrgIdsByGroup((prev) => {
      const current = prev[group.id] ?? [];
      const next = current.includes(orgId)
        ? current.filter((id) => id !== orgId)
        : [...current, orgId];
      return { ...prev, [group.id]: next };
    });
    // Drop a deselected workspace's dept mapping so it can't be wired for an unscoped org.
    setDeptsByGroup((prev) => {
      const forGroup = prev[group.id];
      if (!forGroup || !(orgId in forGroup)) return prev;
      const nextForGroup = { ...forGroup };
      delete nextForGroup[orgId];
      return { ...prev, [group.id]: nextForGroup };
    });
  };

  const deptsFor = (group: SyncedGroup): DepartmentIdsByOrg => deptsByGroup[group.id] ?? {};

  const clearVerdict = (groupId: number) =>
    setVerdictByGroup((prev) => {
      if (!(groupId in prev)) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });

  const overridesFor = (group: SyncedGroup): PermissionOverrides => overridesByGroup[group.id] ?? {};

  const setOverridesForGroup = (group: SyncedGroup, next: PermissionOverrides) => {
    setOverridesByGroup((prev) => ({ ...prev, [group.id]: next }));
    // The warning describes the LAST wire. Editing the selection makes it stale, so clear it
    // rather than leave a red flag hanging over a choice it was never about.
    clearVerdict(group.id);
  };


  const setDeptsForGroupOrg = (group: SyncedGroup, orgId: number, deptIds: number[]) => {
    setDeptsByGroup((prev) => ({
      ...prev,
      [group.id]: { ...(prev[group.id] ?? {}), [orgId]: deptIds },
    }));
  };

  /**
   * Wire, then READ BACK the permissions it asked for.
   *
   * `permissionOverrides` on the wire endpoint ships separately from this app. A backend
   * without it does not fail — zod strips the unknown key and answers 200 — so the mapping
   * succeeds while the customization disappears, and it disappears in the PERMISSIVE
   * direction: a permission the admin removed stays granted. There is no capability flag to
   * ask for, so the backing group (matched on its own IdP wiring, not on a name we guessed)
   * is the only honest confirmation available.
   */
  const submitWire = async (group: SyncedGroup, target: WireTarget) => {
    if (!group.externalId) return;
    const requested = target.type === 'newGroup' ? target.permissionOverrides : undefined;
    try {
      await wire.mutateAsync({ idpGroupExternalId: group.externalId, target });
    } catch {
      return; // the mutation already reported it; nothing was wired, so there is nothing to verify
    }
    if (!requested) {
      clearVerdict(group.id);
      return;
    }
    const fresh = await allianceGroupsQuery.refetch();
    const backing = (fresh.data ?? []).find(
      (candidate) => candidate.idpGroup?.externalId === group.externalId
    );
    const verdict: OverridesVerdict | null =
      backing === undefined
        ? 'unconfirmed'
        : overridesEqual(backing.permissionOverrides, requested)
          ? null
          : 'dropped';
    if (verdict === null) {
      clearVerdict(group.id);
      return;
    }
    setVerdictByGroup((prev) => ({ ...prev, [group.id]: verdict }));
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
      // Only write the key when the admin actually customized something: an untouched form
      // must be indistinguishable from an old client, so an empty object never overwrites.
      const overrides = overridesFor(group);
      const customized =
        (overrides.added?.length ?? 0) + (overrides.removed?.length ?? 0) > 0;
      return {
        type: 'newGroup',
        name: backingGroupName(group.displayName, orgRole),
        orgRole,
        orgIds,
        departmentIdsByOrg,
        ...(customized && { permissionOverrides: overrides }),
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
              No IdP groups have synced yet. They appear here after your IdP first pushes a group that
              has members. If your IdP is connected but nothing shows, confirm a group (not just users)
              is assigned to the SCIM app.
            </span>
          </Alert>
        ) : (
          synced.map((group) => (
            <SyncedGroupRow
              key={group.id}
              group={group}
              allianceId={allianceId}
              targetOptions={targetOptions}
              selectedValue={selectedValueFor(group)}
              onSelect={(value) => {
                setSelectedByGroup((prev) => ({ ...prev, [group.id]: value }));
                clearVerdict(group.id);
              }}
              activeOrgs={activeOrgs}
              selectedOrgIds={orgIdsFor(group)}
              onToggleOrg={(orgId) => toggleOrgFor(group, orgId)}
              deptsByOrg={deptsFor(group)}
              onDeptChange={(orgId, deptIds) => setDeptsForGroupOrg(group, orgId, deptIds)}
              permissionOverrides={overridesFor(group)}
              onOverridesChange={(next) => setOverridesForGroup(group, next)}
              overridesVerdict={verdictByGroup[group.id] ?? null}
              onWire={() => handleWire(group)}
              onUnwire={() => setUnwireConfirm(group)}
              wiring={wire.isPending || unwire.isPending}
            />
          ))
        )}
      </CardContent>

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

      {/* Unwiring removes only the MAPPING. The backing group keeps its role, workspaces
          and any hand-added members — so nobody loses access at the moment you unwire. */}
      <ConfirmDialog
        open={unwireConfirm !== null}
        onOpenChange={(open) => !open && setUnwireConfirm(null)}
        onConfirm={() => {
          const mappingId = unwireConfirm?.wiredGroup?.mappingId;
          setUnwireConfirm(null);
          if (mappingId !== undefined) unwire.mutate(mappingId);
        }}
        variant="warning"
        confirmText="Unwire"
        cancelText="Keep wired"
        title={unwireConfirm ? `Unwire ${unwireConfirm.displayName}?` : ''}
        description="New members will stop arriving from this IdP group. The group it was wired to keeps its role, workspaces and any members added by hand — nobody loses access right now."
      />
    </Card>
  );
};
