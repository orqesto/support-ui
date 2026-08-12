import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { useWorkspaceDepartments } from '@/hooks/usePlatformAdmin';
import { organizationService } from '@/services/organization.service';
import { ORGANIZATION_ROLES, roleDisplayNames, type OrganizationRole } from '@/types/roles';

type Props = {
  orgId: number;
  orgName: string;
  /** The member's current workspace role (from useUserOrganizations — a plain string). */
  currentRole: string;
  /** The member's current departments in THIS workspace — seeds the department toggles so a
   *  full-set PATCH preserves existing departments instead of dropping them. */
  currentDepartmentIds: number[];
  userId: number;
  userEmail: string;
  /** Invalidate the platform-users + user-orgs caches after a mutation so the list refreshes. */
  onChanged: () => void;
};

/**
 * One editable workspace-membership row inside the platform user modal: workspace name +
 * a role Select + an expandable department multi-select + a Remove action. Each row owns its
 * own department query (lazy, keyed by orgId) so hooks stay at component scope rather than in
 * a map callback.
 *
 * Departments are seeded from the member's current departmentIds (returned per membership by
 * GET /api/users/:id/organizations), so toggling PATCHes the full set WITH the existing ones
 * preserved. `setMemberDepartments` takes the complete set (not a diff); each toggle saves and
 * the parent refetch re-syncs the seed to the persisted state.
 */
export const WorkspaceMembershipRow = ({
  orgId,
  orgName,
  currentRole,
  currentDepartmentIds,
  userId,
  userEmail,
  onChanged,
}: Props) => {
  const [role, setRole] = useState<string>(currentRole);
  const [savingRole, setSavingRole] = useState(false);
  const [deptOpen, setDeptOpen] = useState(false);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<number>>(
    () => new Set(currentDepartmentIds)
  );

  // Re-sync when the persisted set changes (after a save's refetch). react-query's structural
  // sharing keeps the array reference stable when unchanged, so this doesn't thrash.
  useEffect(() => {
    setSelectedDeptIds(new Set(currentDepartmentIds));
  }, [currentDepartmentIds]);
  const [savingDeptId, setSavingDeptId] = useState<number | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);

  const deptQuery = useWorkspaceDepartments(orgId, deptOpen);

  const handleRoleChange = async (nextRole: string) => {
    const previous = role;
    setRole(nextRole);
    setSavingRole(true);
    try {
      await organizationService.updateMemberRole(orgId, userId, nextRole);
      onChanged();
      toast.success(`Role updated in ${orgName}`);
    } catch (error) {
      setRole(previous);
      toast.error(error instanceof Error ? error.message : 'Could not update role');
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeptToggle = async (departmentId: number, next: boolean) => {
    const nextSet = new Set(selectedDeptIds);
    if (next) {
      nextSet.add(departmentId);
    } else {
      nextSet.delete(departmentId);
    }
    setSavingDeptId(departmentId);
    try {
      await organizationService.setMemberDepartments(orgId, userId, Array.from(nextSet));
      setSelectedDeptIds(nextSet);
      onChanged();
      toast.success(`Departments updated in ${orgName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update departments');
    } finally {
      setSavingDeptId(null);
    }
  };

  const handleRemove = async () => {
    try {
      await organizationService.removeMember(orgId, userId);
      onChanged();
      toast.success(`Removed from ${orgName}`);
      setRemoveOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove from workspace');
    }
  };

  const departments = deptQuery.data?.departments ?? [];

  return (
    <li className="p-3 space-y-3 rounded-md border border-border">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <span className="text-sm font-medium text-foreground">{orgName}</span>
        <div className="flex gap-2 items-center">
          <Select
            value={role}
            disabled={savingRole}
            aria-label={`Role for ${userEmail} in ${orgName}`}
            className="h-9 w-44"
            onChange={(event) => void handleRoleChange(event.target.value)}
          >
            {ORGANIZATION_ROLES.map((orgRole: OrganizationRole) => (
              <option key={orgRole} value={orgRole}>
                {roleDisplayNames[orgRole]}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRemoveOpen(true)}
            aria-label={`Remove ${userEmail} from ${orgName}`}
            className="text-destructive hover:text-destructive hover:border-destructive/40"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeptOpen((open) => !open)}
          aria-expanded={deptOpen}
        >
          <Building2 className="mr-2 w-4 h-4" />
          {deptOpen ? 'Hide departments' : 'Departments'}
        </Button>
        {deptOpen && (
          <div className="pt-2">
            {deptQuery.isLoading ? (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            ) : deptQuery.isError ? (
              <div className="flex gap-3 justify-between items-center text-sm text-destructive">
                <span>Couldn&apos;t load departments.</span>
                <Button variant="secondary" size="sm" onClick={() => void deptQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">This workspace has no departments.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {departments.map((department) => (
                    <li key={department.id} className="flex gap-3 justify-between items-center">
                      <span className="text-sm text-foreground">{department.name}</span>
                      <Toggle
                        checked={selectedDeptIds.has(department.id)}
                        disabled={savingDeptId !== null}
                        onChange={(next) => void handleDeptToggle(department.id, next)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onConfirm={() => void handleRemove()}
        variant="danger"
        confirmText="Remove from workspace"
        title={`Remove ${userEmail} from ${orgName}?`}
        description="They lose access to this workspace. Their account and other workspace memberships are kept."
      />
    </li>
  );
};
