import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Lock, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Toggle } from '@/components/ui/Toggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { Badge } from '@/components/ui/Badge';
import { useWorkspaceDepartments } from '@/hooks/usePlatformAdmin';
import { formatError, getApiErrorMessage } from '@/lib/errorMessages';
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
  /**
   * The identity provider owns this membership. Until the API started enforcing that, this
   * row offered a role Select and a Remove for a membership the workspace's own Users page
   * had been refusing for months — the same row, two answers, depending on which screen was
   * open. Both controls are now disabled here and say why.
   */
  idpManaged: boolean;
  /**
   * The workspace's own database could not be read, so `currentDepartmentIds` is empty for that
   * reason alone. Every toggle saves the FULL set: one save from this row would replace the
   * member's real teams with the one toggled. The editor is off and says why.
   */
  teamsUnavailable?: boolean;
  /** A mentor in this workspace (1.1.330): marked here, set in the workspace's Members page. */
  isMentor?: boolean;
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
  idpManaged,
  teamsUnavailable = false,
  isMentor = false,
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
  // A refused team save, in the server's words, under the toggles (a toast alone is missed).
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const deptQuery = useWorkspaceDepartments(orgId, deptOpen && !teamsUnavailable);
  const allDepartments = deptQuery.data?.departments;
  const departments = useMemo(
    () => (allDepartments ?? []).filter((department) => department.active !== false),
    [allDepartments]
  );
  /*
   * Switched-off (archived) teams. PATCH .../members/:userId/departments REFUSES (400 "Archived
   * team(s) cannot be assigned") any set that names one, and REPLACES the member's manual teams
   * with what is sent (rows the identity provider assigned are left alone). A member still on a
   * switched-off team seeded every toggle with its id, so every toggle failed. The set sent never
   * names one; keeping it is impossible once teams are saved, and the row says so.
   */
  const archivedIds = useMemo(
    () =>
      new Set(
        (allDepartments ?? [])
          .filter((department) => department.active === false)
          .map((department) => department.id)
      ),
    [allDepartments]
  );
  const heldArchived = (allDepartments ?? []).filter(
    (department) => archivedIds.has(department.id) && selectedDeptIds.has(department.id)
  );

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

  const saveTeams = async (nextSet: Set<number>, savingId: number) => {
    setSavingDeptId(savingId);
    setTeamsError(null);
    try {
      await organizationService.setMemberDepartments(orgId, userId, Array.from(nextSet));
      setSelectedDeptIds(nextSet);
      onChanged();
      toast.success(`Teams updated in ${orgName}`);
    } catch (error) {
      const message = getApiErrorMessage(error) ?? formatError('update teams', error);
      setTeamsError(message);
      toast.error(message);
    } finally {
      setSavingDeptId(null);
    }
  };

  const handleDeptToggle = (departmentId: number, next: boolean) => {
    // Never resend a switched-off team: the server refuses the whole set if one is named.
    const nextSet = new Set([...selectedDeptIds].filter((id) => !archivedIds.has(id)));
    if (next) {
      nextSet.add(departmentId);
    } else {
      nextSet.delete(departmentId);
    }
    return saveTeams(nextSet, departmentId);
  };

  const handleDropArchived = () =>
    saveTeams(new Set([...selectedDeptIds].filter((id) => !archivedIds.has(id))), -1);

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

  return (
    <li className="p-3 space-y-3 rounded-md border border-border">
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <span className="flex flex-wrap gap-2 items-center text-sm font-medium text-foreground">
          {orgName}
          {isMentor && <Badge variant="secondary">Mentor</Badge>}
          {idpManaged && (
            <Tooltip content="Your identity provider owns this membership. Change the role, or remove the person, in the identity provider — this workspace will not accept the change.">
              <Badge className="flex gap-1 items-center text-xs text-warning bg-warning-muted">
                <Lock className="w-3 h-3" />
                IdP-managed
              </Badge>
            </Tooltip>
          )}
        </span>
        <div className="flex gap-2 items-center">
          <Select
            value={role}
            disabled={savingRole || idpManaged}
            aria-label={`Role for ${userEmail} in ${orgName}`}
            size="sm"
            className="w-44"
            options={ORGANIZATION_ROLES.map((orgRole: OrganizationRole) => ({
              value: orgRole,
              label: roleDisplayNames[orgRole],
            }))}
            onChange={(value) => void handleRoleChange(value)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={idpManaged}
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
          {deptOpen ? 'Hide teams' : 'Teams'}
        </Button>
        {deptOpen && (
          <div className="pt-2">
            {teamsUnavailable ? (
              <p className="text-sm text-muted-foreground">
                This workspace&apos;s own database can&apos;t be read right now, so its teams
                can&apos;t be shown or changed here. Try again once it is back.
              </p>
            ) : deptQuery.isLoading ? (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            ) : deptQuery.isError ? (
              <div className="flex gap-3 justify-between items-center text-sm text-destructive">
                <span>Couldn&apos;t load teams.</span>
                <Button variant="secondary" size="sm" onClick={() => void deptQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : departments.length === 0 && heldArchived.length === 0 ? (
              <p className="text-sm text-muted-foreground">This workspace has no teams.</p>
            ) : (
              <div className="space-y-3">
                {heldArchived.length > 0 && (
                  <Alert variant="warning" role="status" label="Switched-off teams">
                    <p>
                      Still on{' '}
                      {heldArchived.length === 1 ? 'a switched-off team' : 'switched-off teams'}:{' '}
                      <strong>
                        {heldArchived.map((department) => department.name).join(', ')}
                      </strong>
                      . A switched-off team cannot be kept when teams are saved, so changing this
                      member&apos;s teams here takes them off it.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={savingDeptId !== null}
                      onClick={() => void handleDropArchived()}
                    >
                      Take off switched-off {heldArchived.length === 1 ? 'team' : 'teams'}
                    </Button>
                  </Alert>
                )}
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
                {teamsError && (
                  <Alert variant="danger" role="alert">
                    Not saved: {teamsError}
                  </Alert>
                )}
              </div>
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
