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
import { useAllianceGroups } from '@/hooks/useAllianceGroups';
import {
  useAllianceSyncedGroups,
  useResyncAllianceProvisioning,
  useWireSyncedGroup,
} from '@/hooks/useAllianceProvisioning';
import type { SyncedGroup, WireTarget } from '@/services/alliance-scim.service';

/**
 * Synced IdP groups card — the single Approach-1 surface for the alliance Provisioning
 * section. The IdP pushes its groups; this lists them (member preview + current wired
 * state + a name-derived suggestion) and maps each, in place, to EITHER an alliance role
 * OR an alliance group (the groups authored on the Groups page). Wiring applies to the
 * already-synced members immediately (backfill), and "Re-sync now" reconciles all synced
 * members on demand — SCIM is push-driven with no reconcile cron.
 *
 * SECURITY: the suggestion only pre-selects the target; granting alliance-admin still
 * requires an explicit, confirmed action.
 */

/** The target select encodes both kinds as `role:<role>` or `group:<groupId>` strings. */
const parseTargetValue = (value: string): WireTarget | null => {
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

const isAdminTarget = (value: string): boolean => value === 'role:alliance_admin';

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
  targetOptions,
  selectedValue,
  onSelect,
  onWire,
  wiring,
}: {
  group: SyncedGroup;
  targetOptions: { value: string; label: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onWire: () => void;
  wiring: boolean;
}) => {
  const wired = group.wiredRole !== null || group.wiredGroup !== null;
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
            <Button type="button" onClick={onWire} isLoading={wiring} disabled={wiring}>
              <ShieldCheck className="mr-2 w-4 h-4" />
              Map access
            </Button>
          </div>
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
  const wire = useWireSyncedGroup(allianceId);
  const resync = useResyncAllianceProvisioning(allianceId);

  const [selectedByGroup, setSelectedByGroup] = useState<Record<number, string>>({});
  const [adminConfirm, setAdminConfirm] = useState<{ group: SyncedGroup; target: WireTarget } | null>(
    null
  );

  const synced = groupsQuery.data ?? [];

  // Unified target options: the two alliance roles + every authored alliance group.
  const targetOptions = useMemo(
    () => [
      { value: 'role:alliance_admin', label: 'Role — Alliance admin (elevated)' },
      { value: 'role:alliance_agent', label: 'Role — Alliance agent' },
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

  const submitWire = (group: SyncedGroup, target: WireTarget) => {
    if (!group.externalId) return;
    wire.mutate({ idpGroupExternalId: group.externalId, target });
  };

  const handleWire = (group: SyncedGroup) => {
    const value = selectedValueFor(group);
    const target = parseTargetValue(value);
    if (!target) return;
    // Elevating to alliance-admin is a deliberate, confirmed action.
    if (isAdminTarget(value)) {
      setAdminConfirm({ group, target });
      return;
    }
    submitWire(group, target);
  };

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
              Groups your identity provider has pushed. Map one to an alliance role or group and its
              already-synced members update immediately — no re-push needed. Create the alliance groups
              you map to on the Groups page.
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
              targetOptions={targetOptions}
              selectedValue={selectedValueFor(group)}
              onSelect={(value) => setSelectedByGroup((prev) => ({ ...prev, [group.id]: value }))}
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
        confirmText="Grant alliance admin"
        title={`Grant alliance admin to ${adminConfirm?.group.displayName ?? ''}?`}
        description="Every current and future member of this IdP group will gain alliance-admin rights across all workspaces in this alliance. Already-synced members are updated immediately. Only confirm if you intend to elevate them."
      />
    </Card>
  );
};
