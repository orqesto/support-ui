import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { OrgDepartmentPicker } from '@/components/console/OrgDepartmentPicker';
import { useSaveGroup } from '@/hooks/useAllianceGroups';
import type { AllianceGroup, DepartmentIdsByOrg } from '@/services/alliance-groups.service';
import type { AllianceOrg, AllianceMember } from '@/services/alliance-admin.service';
import { PermissionOverridesSection } from '@/components/shared/PermissionOverridesSection';
import { roleDisplayNames, type OrganizationRole, type PermissionOverrides } from '@/types/roles';

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
  const [permissionOverrides, setPermissionOverrides] = useState<PermissionOverrides>({});
  // A backend that predates group overrides omits the field entirely. Sending {} back
  // would be indistinguishable from "the admin cleared it", so an untouched editor on an
  // old backend must not write the key at all.
  const [overridesSupported, setOverridesSupported] = useState(false);

  const save = useSaveGroup(allianceId);

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
    setPermissionOverrides(group?.permissionOverrides ?? {});
    // A NEW group is always authored against this build, so the control is available;
    // for an existing one, only if the API actually returned the field.
    setOverridesSupported(!group || group.permissionOverrides !== undefined);
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

  const toggleOrg = (orgId: number, checked: boolean) => {
    setSelectedOrgIds((current) =>
      checked ? [...current, orgId] : current.filter((existing) => existing !== orgId)
    );
    // Drop a deselected org's dept mapping so it can't be re-sent for an org no longer scoped.
    if (!checked) {
      setDepartmentIdsByOrg((current) => {
        if (!(orgId in current)) return current;
        const next = { ...current };
        delete next[orgId];
        return next;
      });
    }
  };

  const setDeptsForOrg = (orgId: number, deptIds: number[]) => {
    setDepartmentIdsByOrg((current) => ({ ...current, [orgId]: deptIds }));
  };

  const roleLabel = ROLE_OPTIONS.find((option) => option.value === orgRole)?.label ?? orgRole;

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Group name is required');
      return;
    }
    save.mutate(
      {
        original: group,
        draft: {
          name: name.trim(),
          description: description.trim() || null,
          orgRole,
          ...(overridesSupported && { permissionOverrides }),
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
          <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Support Leads" />
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

        {/* Same control the workspace users page uses for one member — a group is just a
            larger blast radius for the same decision, so it should look identical. */}
        {overridesSupported && (
          <PermissionOverridesSection
            role={orgRole}
            value={permissionOverrides}
            onChange={setPermissionOverrides}
          />
        )}

        <div className="space-y-2">
          <Label>Applies to workspaces</Label>
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">This alliance has no workspaces yet.</p>
          ) : (
            <div className="space-y-2.5">
              {orgs.map((org) => (
                <div key={org.id} className="space-y-1.5">
                  <Toggle
                    label={`${org.name} (/${org.slug})`}
                    checked={selectedOrgIds.includes(org.id)}
                    onChange={(checked) => toggleOrg(org.id, checked)}
                  />
                  {selectedOrgIds.includes(org.id) && orgRole !== 'org_admin' && (
                    <OrgDepartmentPicker
                      allianceId={allianceId}
                      orgId={org.id}
                      orgLabel={`${org.name} (/${org.slug})`}
                      selected={departmentIdsByOrg[org.id] ?? []}
                      onChange={(deptIds) => setDeptsForOrg(org.id, deptIds)}
                    />
                  )}
                </div>
              ))}
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
                  {selectedMemberIds.map((userId) => (
                    <Badge key={userId} variant="secondary" className="flex gap-1 items-center">
                      {memberName(userId)}
                      <span className="text-muted-foreground">· {memberSecondary(userId)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${memberName(userId)}`}
                        onClick={() => setSelectedMemberIds((current) => current.filter((existing) => existing !== userId))}
                        className="p-0 ml-1 w-4 h-4"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))}
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
