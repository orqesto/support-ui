import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { OrgDepartmentPicker } from '@/components/console/OrgDepartmentPicker';
import { useSaveGroup } from '@/hooks/useAllianceGroups';
import { backingGroupName } from '@/components/console/backingGroupName';
import type { AllianceGroup, DepartmentIdsByOrg } from '@/services/alliance-groups.service';
import type { AllianceOrg, AllianceMember } from '@/services/alliance-admin.service';
import { roleDisplayNames, type OrganizationRole } from '@/types/roles';

const ROLE_OPTIONS: { value: OrganizationRole; label: string }[] = [
  { value: 'associate', label: roleDisplayNames.associate },
  { value: 'support', label: roleDisplayNames.support },
  { value: 'moderator', label: roleDisplayNames.moderator },
  { value: 'org_admin', label: roleDisplayNames.org_admin },
];

type GroupEditorProps = {
  open: boolean;
  onClose: () => void;
  allianceId: number | null;
  group: AllianceGroup | null;
  orgs: AllianceOrg[];
  members: AllianceMember[];
};

/**
 * Group editor drawer (SPEC §8.3): name → scoped-org subset → single role →
 * members, with a live effective-access preview. The org subset only offers the
 * alliance's own orgs, so a group can never grant into an outside org. Preview is
 * a floor — actual effective role is highest-wins, so a member may end up higher.
 */
export const GroupEditor = ({ open, onClose, allianceId, group, orgs, members }: GroupEditorProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [orgRole, setOrgRole] = useState<OrganizationRole>('support');
  const [selectedOrgIds, setSelectedOrgIds] = useState<number[]>([]);
  const [departmentIdsByOrg, setDepartmentIdsByOrg] = useState<DepartmentIdsByOrg>({});
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);

  const save = useSaveGroup(allianceId);
  // A group the wire MINTED is named "<IdP group> — <Role>" and that name is the whole
  // reason it exists: the Groups list and the Provisioning row both read it as "the mapping
  // for that IdP group". So the name is derived, not typed — it follows the role picked here
  // (a role edit that left "— Associate" on a group granting Support would lie). A
  // hand-authored group that was wired later is the admin's: their name, editable. An older
  // backend omits the flag; then nothing is derived (never overwrite a name we can't classify).
  const minted = group?.idpGroup?.mintedByWire === true;
  const idpName = group?.idpGroup ? (group.idpGroup.displayName ?? group.idpGroup.externalId) : null;
  const derivedName = minted && idpName ? backingGroupName(idpName, orgRole) : null;
  // Absent (old backend) is not the same as empty: with no field we simply can't tell who
  // is IdP-managed, and marking nobody is the honest answer — never marking everybody.
  const idpManagedMemberIds = group?.idpManagedMemberIds ?? [];

  // (Re)initialise the form whenever the drawer opens or the edited group changes.
  useEffect(() => {
    if (!open) {
      return;
    }
    setName(group?.name ?? '');
    setDescription(group?.description ?? '');
    setOrgRole(group?.orgRole ?? 'support');
    setSelectedOrgIds(group?.orgIds ?? []);
    setDepartmentIdsByOrg(group?.departmentIdsByOrg ?? {});
    setSelectedMemberIds(group?.memberIds ?? []);
  }, [open, group]);

  const memberName = useMemo(() => {
    const byId = new Map(members.map((member) => [member.userId, member.name || `User #${member.userId}`]));
    return (userId: number) => byId.get(userId) ?? `User #${userId}`;
  }, [members]);

  // Secondary identifier for a member — email when known, else the numeric id —
  // so two members with the same display name are still distinguishable.
  const memberSecondary = useMemo(() => {
    const byId = new Map(members.map((member) => [member.userId, member.email ?? `#${member.userId}`]));
    return (userId: number) => byId.get(userId) ?? `#${userId}`;
  }, [members]);

  // Workspaces can share a display name, so qualify them with their unique slug.
  const orgLabel = useMemo(() => {
    const byId = new Map(orgs.map((org) => [org.id, `${org.name} (/${org.slug})`]));
    return (orgId: number) => byId.get(orgId) ?? `Workspace #${orgId}`;
  }, [orgs]);

  const addableMemberOptions = useMemo(
    () =>
      members
        .filter((member) => !selectedMemberIds.includes(member.userId))
        .map((member) => ({
          value: String(member.userId),
          label: `${member.name || `User #${member.userId}`} · ${member.email ?? `#${member.userId}`}`,
        })),
    [members, selectedMemberIds]
  );

  /**
   * A group applies to ONE workspace, so choosing one replaces the choice. Kept as a list
   * because `alliance_group_orgs` is still many-to-many and the rule is "one for now,
   * plausibly many later" — the backend caps the write at one, and neither side needs a
   * migration to allow several again.
   */
  const selectOrg = (orgId: number | null) => {
    setSelectedOrgIds(orgId === null ? [] : [orgId]);
    // Department mappings are keyed by workspace, so anything for the previous one is now
    // about a workspace this group does not touch.
    setDepartmentIdsByOrg((current) => {
      const kept = orgId !== null && orgId in current ? { [orgId]: current[orgId] } : {};
      return kept;
    });
  };

  /** The one workspace this group applies to, or null — see `selectOrg`. */
  const selectedOrgId = selectedOrgIds[0] ?? null;

  const setDeptsForOrg = (orgId: number, deptIds: number[]) => {
    setDepartmentIdsByOrg((current) => ({ ...current, [orgId]: deptIds }));
  };

  const roleLabel = ROLE_OPTIONS.find((option) => option.value === orgRole)?.label ?? orgRole;

  const handleSave = () => {
    const finalName = derivedName ?? name.trim();
    if (!finalName) {
      toast.error('Group name is required');
      return;
    }
    save.mutate(
      {
        original: group,
        draft: {
          name: finalName,
          description: description.trim() || null,
          orgRole,
          // `permissionOverrides` is deliberately omitted. An alliance admin chooses an
          // access LEVEL; hand-picking a permission set for a whole group is not theirs to
          // make — the per-member exception belongs in the workspace (EditUserPage), which
          // already survives the reconcile. Omitting the key is what preserves whatever a
          // group already carries: `updateGroup` only writes the field when it is present
          // (allianceGroupService.ts:325), and the save hook keeps `undefined` out of the
          // request rather than sending `{}`, which the BE WOULD read as "clear".
          orgIds: selectedOrgIds,
          // Only carry dept mappings for orgs still selected.
          departmentIdsByOrg: Object.fromEntries(
            selectedOrgIds
              .map((orgId) => [orgId, departmentIdsByOrg[orgId] ?? []] as const)
              .filter(([, deptIds]) => deptIds.length > 0)
          ),
          memberIds: selectedMemberIds,
        },
      },
      {
        onSuccess: () => {
          toast.success(group ? 'Group updated' : 'Group created');
          onClose();
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : 'Could not save group'),
      }
    );
  };

  return (
    <Drawer open={open} onClose={onClose} title={group ? 'Edit group' : 'New group'}>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            value={derivedName ?? name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Support Leads"
            readOnly={derivedName !== null}
            aria-readonly={derivedName !== null || undefined}
          />
          {derivedName !== null && (
            <p className="text-xs text-muted-foreground">
              Named after the IdP group that feeds it and the role it grants — the name follows
              the mapping.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="group-desc">Description</Label>
          <Input id="group-desc" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="group-role">Grants role</Label>
          <Select id="group-role" value={orgRole} onChange={(event) => setOrgRole(event.target.value as OrganizationRole)}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {group?.idpGroup && (
          <Alert variant="info">
            {/* No Unwire here: the Provisioning row is the ONE place a wire is undone, and
                its confirm knows whether this group is retired with it. A second control
                with its own (older, softer) copy is how two screens end up disagreeing. */}
            <span className="text-sm">
              Members are synced from IdP group{' '}
              <strong>{group.idpGroup.displayName ?? group.idpGroup.externalId}</strong>
              {group.idpGroup.displayName && (
                <span className="font-mono text-xs text-muted-foreground">
                  {' '}
                  ({group.idpGroup.externalId})
                </span>
              )}
              . To stop syncing, unwire it on the Provisioning screen.
            </span>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="group-workspace">Applies to workspace</Label>
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">This alliance has no workspaces yet.</p>
          ) : (
            <div className="space-y-2.5">
              {/* One workspace per group — see `selectOrg`. Presentation only: the payload
                  is still `orgIds`, and the backend caps it rather than the schema. */}
              <Select
                id="group-workspace"
                value={selectedOrgId === null ? '' : String(selectedOrgId)}
                onChange={(event) =>
                  selectOrg(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">Select a workspace…</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {`${org.name} (/${org.slug})`}
                  </option>
                ))}
              </Select>
              {selectedOrgId !== null && orgRole !== 'org_admin' && (
                <OrgDepartmentPicker
                  allianceId={allianceId}
                  orgId={selectedOrgId}
                  orgLabel={orgLabel(selectedOrgId)}
                  selected={departmentIdsByOrg[selectedOrgId] ?? []}
                  onChange={(deptIds) => setDeptsForOrg(selectedOrgId, deptIds)}
                />
              )}
            </div>
          )}
          {orgRole === 'org_admin' && selectedOrgIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Org admins get every department — department mapping doesn&apos;t apply.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Members {members.length === 0 && <span className="font-normal text-muted-foreground">(optional)</span>}</Label>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No alliance members yet — add them in the Members tab or let SCIM provision
              them. You can still create this group now (name + role) and map an identity-provider
              group to it; members are filled in automatically as they&apos;re provisioned.
            </p>
          ) : (
            <>
              {selectedMemberIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedMemberIds.map((userId) => {
                    // An IdP-managed member has no remove control: the identity provider
                    // owns that membership and the next sync would restore them, so the
                    // button would be a lie about what the admin can decide here.
                    const managedByIdp = idpManagedMemberIds.includes(userId);
                    return (
                      <Badge key={userId} variant="secondary" className="flex gap-1 items-center">
                        {memberName(userId)}
                        <span className="text-muted-foreground">· {memberSecondary(userId)}</span>
                        {managedByIdp ? (
                          <span
                            className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground"
                            title="Membership comes from the wired IdP group — change it in your identity provider."
                          >
                            IdP
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${memberName(userId)}`}
                            onClick={() =>
                              setSelectedMemberIds((current) =>
                                current.filter((existing) => existing !== userId)
                              )
                            }
                            className="p-0 ml-1 w-4 h-4"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              )}
              <ReactSelect
                options={addableMemberOptions}
                value=""
                onChange={(value) => {
                  if (value) {
                    setSelectedMemberIds((current) => [...current, Number(value)]);
                  }
                }}
              />
            </>
          )}
        </div>

        <Card>
          <CardContent>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Effective access preview</h3>
            {selectedMemberIds.length === 0 || selectedOrgIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select at least one member and one workspace to preview.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {selectedMemberIds.map((userId) => (
                  <li key={userId} className="text-foreground">
                    <span className="font-medium">{memberName(userId)}</span>{' '}
                    <span className="text-muted-foreground">({memberSecondary(userId)})</span> →{' '}
                    {roleLabel} in {selectedOrgIds.map(orgLabel).join(', ')}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Highest-wins: a member with a higher role elsewhere keeps it.
            </p>
          </CardContent>
        </Card>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} isLoading={save.isPending}>
            {group ? 'Save changes' : 'Create group'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
};
