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
import { useAllianceGroups } from '@/hooks/useAllianceGroups';
import { useAllianceOrgs } from '@/hooks/useAllianceAdmin';
import type { DepartmentIdsByOrg } from '@/services/alliance-groups.service';
import {
  useAllianceSyncedGroups,
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

const ORG_ROLE_LABELS: Record<OrganizationRole, string> = {
  org_admin: 'Org admin',
  moderator: 'Moderator',
  support: 'Support',
  associate: 'Associate',
};

/** The target select encodes each kind as `role:<role>`, `orgrole:<role>` or `group:<id>`. */
const parseSimpleTarget = (value: string): WireTarget | null => {
  if (value.startsWith('role:')) {
    const role = value.slice('role:'.length);
    if (role === 'alliance_admin' || role === 'alliance_agent') {
      return { type: 'role', mappedRole: role };
    }
    return null;
  }
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
const privilegedKind = (value: string): 'alliance_admin' | 'org_admin' | null => {
  if (value === 'role:alliance_admin') return 'alliance_admin';
  if (value === 'orgrole:org_admin') return 'org_admin';
  return null;
};

/** Backing-group name for an org-role wire — kept within the 120-char API limit. */
const backingGroupName = (displayName: string, role: OrganizationRole): string =>
  `${displayName} — ${ORG_ROLE_LABELS[role]}`.slice(0, 120);

const wiredLabel = (group: SyncedGroup): string => {
  if (group.wiredRole) {
    return `Wired → ${group.wiredRole.mappedRole === 'alliance_admin' ? 'Alliance admin' : 'Alliance agent'}`;
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
  onWire,
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
  onWire: () => void;
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

      {group.externalId === null ? (
        <Alert variant="warning">
          <span className="text-sm">
            This group carries no external id from the IdP, so it cannot be mapped. Push it from your
            IdP with a stable external id to enable mapping.
          </span>
        </Alert>
      ) : wired ? null : (
        <>
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

          {group.suggestion && (
            <p className="flex gap-1 items-center text-xs text-muted-foreground">
              <Sparkles className="w-3 h-3 shrink-0" />
              Suggested:{' '}
              <strong>
                {group.suggestion.mappedRole === 'alliance_admin' ? 'Alliance admin' : 'Alliance agent'}
              </strong>{' '}
              — {group.suggestion.rationale}
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
  const resync = useResyncAllianceProvisioning(allianceId);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<number, string>>({});
  const [orgIdsByGroup, setOrgIdsByGroup] = useState<Record<number, number[]>>({});
  // Per synced group → per workspace → mapped department ids (org-role wires only).
  const [deptsByGroup, setDeptsByGroup] = useState<Record<number, DepartmentIdsByOrg>>({});
  const [adminConfirm, setAdminConfirm] = useState<{
    group: SyncedGroup;
    target: WireTarget;
    kind: 'alliance_admin' | 'org_admin';
  } | null>(null);

  const synced = groupsQuery.data ?? [];
  const activeOrgs = useMemo(
    () => (orgsQuery.data ?? []).filter((org) => org.active),
    [orgsQuery.data]
  );
  const activeOrgIds = useMemo(() => activeOrgs.map((org) => org.id), [activeOrgs]);

  // Target options: the two alliance roles, the four org roles (scoped to workspaces
  // below), then every authored alliance group.
  const targetOptions = useMemo(
    () => [
      { value: 'role:alliance_admin', label: 'Role — Alliance admin (elevated)' },
      { value: 'role:alliance_agent', label: 'Role — Alliance agent' },
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
    `role:${group.suggestion?.mappedRole ?? 'alliance_agent'}`;

  const selectedValueFor = (group: SyncedGroup): string =>
    selectedByGroup[group.id] ?? defaultValueFor(group);

  // Default an org-role wire to every active workspace until the admin narrows it.
  const orgIdsFor = (group: SyncedGroup): number[] => orgIdsByGroup[group.id] ?? activeOrgIds;

  const toggleOrgFor = (group: SyncedGroup, orgId: number) => {
    setOrgIdsByGroup((prev) => {
      const current = prev[group.id] ?? activeOrgIds;
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

  const setDeptsForGroupOrg = (group: SyncedGroup, orgId: number, deptIds: number[]) => {
    setDeptsByGroup((prev) => ({
      ...prev,
      [group.id]: { ...(prev[group.id] ?? {}), [orgId]: deptIds },
    }));
  };

  const submitWire = (group: SyncedGroup, target: WireTarget) => {
    if (!group.externalId) return;
    wire.mutate({ idpGroupExternalId: group.externalId, target });
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
    submitWire(group, target);
  };

  const confirmText =
    adminConfirm?.kind === 'alliance_admin' ? 'Grant alliance admin' : 'Grant org admin';
  const confirmTitle =
    adminConfirm === null
      ? ''
      : adminConfirm.kind === 'alliance_admin'
        ? `Grant alliance admin to ${adminConfirm.group.displayName}?`
        : `Grant org admin to ${adminConfirm.group.displayName}?`;
  const confirmDescription =
    adminConfirm?.kind === 'alliance_admin'
      ? 'Every current and future member of this IdP group will gain alliance-admin rights across all workspaces in this alliance. Already-synced members are updated immediately. Only confirm if you intend to elevate them.'
      : 'Every current and future member of this IdP group will gain org-admin rights in the selected workspaces. Already-synced members are updated immediately. Only confirm if you intend to grant workspace administration.';

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
              onSelect={(value) => setSelectedByGroup((prev) => ({ ...prev, [group.id]: value }))}
              activeOrgs={activeOrgs}
              selectedOrgIds={orgIdsFor(group)}
              onToggleOrg={(orgId) => toggleOrgFor(group, orgId)}
              deptsByOrg={deptsFor(group)}
              onDeptChange={(orgId, deptIds) => setDeptsForGroupOrg(group, orgId, deptIds)}
              onWire={() => handleWire(group)}
              wiring={wire.isPending}
            />
          ))
        )}
      </CardContent>

      <ConfirmDialog
        open={adminConfirm !== null}
        onOpenChange={(open) => !open && setAdminConfirm(null)}
        onConfirm={() => {
          if (adminConfirm) submitWire(adminConfirm.group, adminConfirm.target);
          setAdminConfirm(null);
        }}
        variant="danger"
        confirmText={confirmText}
        title={confirmTitle}
        description={confirmDescription}
      />
    </Card>
  );
};
