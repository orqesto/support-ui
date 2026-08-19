import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Lock } from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { RoleInfoCard } from '@/components/admin/RoleInfoCard';
import { PermissionOverridesSection } from '@/components/shared/PermissionOverridesSection';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { departmentService, type Department } from '@/services/department.service';
import { organizationService, type Organization } from '@/services/organization.service';
import { listScimGroupMappings } from '@/services/scim.service';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import {
  ORGANIZATION_ROLES,
  roleDisplayNames,
  type GlobalRole,
  type OrganizationRole,
  type PermissionOverrides,
} from '@/types/roles';
import { UserDepartmentsField } from '@/components/users/UserDepartmentsField';
import { UserRoutingSkillsCard } from '@/components/users/UserRoutingSkillsCard';

/**
 * Editing a member is a page, not a dialog.
 *
 * It had grown to cover identity, workspace role, department access, permission
 * overrides, workspace membership and routing skills — with two confirmation dialogs
 * nested inside a third. That is a screen's worth of decisions, and a dialog gave it
 * no room, no deep link and no browser history.
 *
 * The fields, permission gates and IdP read-only rules are carried over unchanged; what
 * is new is that related fields are grouped into sections and the work is addressable at
 * /users/:id/edit.
 */

const orgRoles: OrganizationRole[] = [...ORGANIZATION_ROLES];

const inputClasses =
  'px-3 py-2 w-full rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary';

export const EditUserPage = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { id, orgId } = useParams<{ id: string; orgId: string }>();
  const navigate = useNavigate();
  // Inside the per-workspace console shell the chrome is supplied by WorkspaceShell,
  // which also owns the org context this form's calls run against.
  const Wrap = embedded ? Fragment : Layout;
  const { isAdmin, canManageUsers } = usePermissions();
  const currentUser = useAuthStore((state) => state.user);

  const userId = Number(id);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [telegram, setTelegram] = useState('');
  const [slack, setSlack] = useState('');
  const [phone, setPhone] = useState('');
  const [globalRole, setGlobalRole] = useState<GlobalRole>('user');
  const [organizationRole, setOrganizationRole] = useState<OrganizationRole>('associate');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<number[]>([]);
  const [permissionOverrides, setPermissionOverrides] = useState<PermissionOverrides>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<Department[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | undefined>(undefined);
  const [orgChangeDialog, setOrgChangeDialog] = useState({ open: false, newOrgId: 0 });
  const [generalDeptUnlinkConfirm, setGeneralDeptUnlinkConfirm] = useState({ open: false, deptId: 0 });
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const [orgAdminCount, setOrgAdminCount] = useState<number | null>(null);
  const [orgHasDeptMapping, setOrgHasDeptMapping] = useState(false);

  // D2-01: a SCIM-managed member's role/dept is owned by the IdP. The ROLE control is
  // always read-only; the DEPARTMENT control only when the org has ≥1 group→department
  // mapping (D2-01a). Non-SCIM members are unaffected (D2-01b).
  const isScimManaged = user?.scimManaged === true;
  const roleReadOnly = isScimManaged;
  const deptReadOnly = isScimManaged && orgHasDeptMapping;

  const isEditingSelf = Boolean(currentUser && user && currentUser.id === user.id);
  const canEditRoles = isAdmin || (canManageUsers && !isEditingSelf);
  const canEditPosition = isAdmin ?? canManageUsers; // Org admin can edit own position

  // UX hint only — the server is authoritative and rejects the change with a 403
  // (organizationService: "Cannot change role: this is the last Organization
  // Administrator"). Counted from a fetched page of members rather than whichever page
  // the list happened to be showing, which is what the dialog used to do.
  const isLastOrgAdmin = user?.organizationRole === 'org_admin' && orgAdminCount === 1;
  const isOrgRoleChangeDisabled = !isAdmin && isLastOrgAdmin && organizationRole !== 'org_admin';

  const loadUser = useCallback(async () => {
    if (!Number.isFinite(userId)) {
      setLoadError('That user id is not valid.');
      setLoading(false);
      return;
    }
    try {
      const fetched = await userService.getById(userId);
      setUser(fetched);
    } catch (error) {
      logger.error('Failed to load user:', error);
      setLoadError('This member could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  // Seed the form once the member arrives.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setPosition(user.position ?? '');
    setTelegram(user.telegram ?? '');
    setSlack(user.slack ?? '');
    setPhone(user.phone ?? '');
    setGlobalRole(user.role);
    setOrganizationRole(user.organizationRole ?? 'associate');
    setSelectedDepartmentIds(user.departmentIds ?? []);
    setSelectedOrgId(user.organizationId);
    setPermissionOverrides(user.permissionOverrides ?? {});
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    organizationService
      .getAll('', 1, 100)
      .then((result) => setOrganizations(result.data))
      .catch((error) => logger.error('Failed to load organizations:', error));
  }, [isAdmin]);

  useEffect(() => {
    departmentService.getAll().then(setAvailableDepartments).catch(() => setAvailableDepartments([]));
  }, []);

  // Count org admins for the last-admin hint. A failure leaves the hint off rather than
  // blocking the form — the server still refuses the change.
  useEffect(() => {
    userService
      .getAll('', 1, 100)
      .then((result) =>
        setOrgAdminCount(result.data.filter((member) => member.organizationRole === 'org_admin').length)
      )
      .catch(() => setOrgAdminCount(null));
  }, []);

  // For a SCIM-managed member, learn whether the org maps any group→department (D2-01a).
  // Only org_admin/global-admin can read the mapping endpoint; any failure leaves
  // departments editable (fail-open for editability).
  useEffect(() => {
    if (!isScimManaged) {
      setOrgHasDeptMapping(false);
      return;
    }
    let active = true;
    listScimGroupMappings()
      .then((groups) => {
        if (active) setOrgHasDeptMapping(groups.some((grp) => grp.mappedDepartmentIds.length > 0));
      })
      .catch(() => {
        if (active) setOrgHasDeptMapping(false);
      });
    return () => {
      active = false;
    };
  }, [isScimManaged]);

  const isDirty = useMemo(() => {
    if (!user) return false;
    return (
      firstName !== (user.firstName ?? '') ||
      lastName !== (user.lastName ?? '') ||
      position !== (user.position ?? '') ||
      telegram !== (user.telegram ?? '') ||
      slack !== (user.slack ?? '') ||
      phone !== (user.phone ?? '') ||
      organizationRole !== (user.organizationRole ?? 'associate') ||
      selectedOrgId !== user.organizationId ||
      JSON.stringify([...selectedDepartmentIds].sort()) !==
        JSON.stringify([...(user.departmentIds ?? [])].sort()) ||
      JSON.stringify(permissionOverrides) !== JSON.stringify(user.permissionOverrides ?? {})
    );
  }, [
    user,
    firstName,
    lastName,
    position,
    telegram,
    slack,
    phone,
    organizationRole,
    selectedOrgId,
    selectedDepartmentIds,
    permissionOverrides,
  ]);

  const goBack = () => navigate(embedded && orgId ? `/console/workspace/${orgId}` : '/users');

  const handleLeave = () => {
    if (isDirty) {
      setLeaveConfirmOpen(true);
      return;
    }
    goBack();
  };

  const buildUpdatePayload = () => ({
    firstName: firstName.trim() ?? undefined,
    lastName: lastName.trim() ?? undefined,
    position: canEditPosition ? (position.trim() ?? undefined) : undefined,
    telegram: telegram.trim() ?? undefined,
    slack: slack.trim() ?? undefined,
    phone: phone.trim() ?? undefined,
    // Global role is managed in the platform console (Platform › Users), not here.
    // IdP-owned fields are skipped for SCIM-managed members (D2-01) so an in-app save
    // can never fight the IdP's derivation.
    organizationRole: canEditRoles && !roleReadOnly ? organizationRole : undefined,
    departmentIds: canEditRoles && !deptReadOnly ? selectedDepartmentIds : undefined,
    permissionOverrides: canEditRoles ? permissionOverrides : undefined,
  });

  const performUpdate = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await userService.update(user.id, buildUpdatePayload());
      toast.success('Member updated');
      goBack();
    } catch (error) {
      logger.error('Failed to update user:', error);
      toast.failure('update user', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    // Workspace change (admin only) is destructive — confirm before touching membership.
    if (isAdmin && selectedOrgId && selectedOrgId !== user.organizationId) {
      setOrgChangeDialog({ open: true, newOrgId: selectedOrgId });
      return;
    }
    await performUpdate();
  };

  const handleOrgChangeConfirm = async (newOrgId: number) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      if (user.organizationId) {
        await organizationService.removeMember(user.organizationId, user.id);
      }
      await organizationService.addMember(newOrgId, user.id, organizationRole);
      // Inline profile update rather than delegating to performUpdate, so isSubmitting is
      // owned by a single finally block and the spinner cannot get stuck.
      await userService.update(user.id, buildUpdatePayload());
      toast.success('Member moved');
      goBack();
    } catch (error) {
      logger.error('Failed to change organization:', error);
      toast.failure('change workspace', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Wrap>
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 rounded-full border-4 animate-spin border-primary border-t-transparent" />
        </div>
      </Wrap>
    );
  }

  if (loadError || !user) {
    return (
      <Wrap>
        <div className="px-4 pb-6 mx-auto space-y-4 w-full">
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-1 -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to members
          </Button>
          <p className="text-muted-foreground">{loadError ?? 'This member could not be loaded.'}</p>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <form onSubmit={handleSubmit}>
        <div className="px-4 pb-24 mx-auto space-y-4 w-full">
          <div>
            <Button variant="ghost" size="sm" onClick={handleLeave} type="button" className="gap-1 -ml-2">
              <ArrowLeft className="w-4 h-4" />
              Back to members
            </Button>
            <h1 className="mt-2 text-3xl font-bold">{isEditingSelf ? 'Edit Profile' : 'Edit User'}</h1>
            <p className="mt-2 text-muted-foreground">
              {user.firstName} {user.lastName} · {user.email}
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block mb-2 text-sm font-medium">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="First Name"
                    className={inputClasses}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block mb-2 text-sm font-medium">
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Last Name"
                    className={inputClasses}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block mb-2 text-sm font-medium">
                  Email
                </label>
                <div className="px-3 py-2 text-sm rounded-md bg-muted">{user.email}</div>
                <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="telegram" className="block mb-2 text-sm font-medium">
                    Telegram
                  </label>
                  <input
                    id="telegram"
                    type="text"
                    value={telegram}
                    onChange={(event) => setTelegram(event.target.value)}
                    placeholder="@username"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label htmlFor="slack" className="block mb-2 text-sm font-medium">
                    Slack
                  </label>
                  <input
                    id="slack"
                    type="text"
                    value={slack}
                    onChange={(event) => setSlack(event.target.value)}
                    placeholder="@username"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block mb-2 text-sm font-medium">
                    Phone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+1234567890"
                    className={inputClasses}
                  />
                </div>
              </div>

              {canEditPosition ? (
                <div>
                  <label htmlFor="position" className="block mb-2 text-sm font-medium">
                    Position
                  </label>
                  <input
                    id="position"
                    type="text"
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                    placeholder="e.g., Senior Developer, Support Manager"
                    className={inputClasses}
                  />
                </div>
              ) : (
                position && (
                  <div>
                    <div className="block mb-2 text-sm font-medium">Position</div>
                    <div className="px-3 py-2 text-sm rounded-md bg-muted">{position}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Position can only be changed by administrators
                    </p>
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {canEditRoles && (
            <Card>
              <CardHeader>
                <CardTitle>Workspace access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <ReactSelect
                    label="Workspace Role"
                    id="organizationRole"
                    value={organizationRole}
                    onChange={(value) => setOrganizationRole(value as OrganizationRole)}
                    options={orgRoles.map((role) => ({ value: role, label: roleDisplayNames[role] }))}
                    isDisabled={roleReadOnly || (!isAdmin && isLastOrgAdmin)}
                  />
                  {roleReadOnly ? (
                    <p className="flex gap-1 items-center mt-1 text-xs font-medium text-amber-600">
                      <Lock className="w-3 h-3" />
                      Managed by IdP (SCIM) — change this member&apos;s role in your identity provider.
                    </p>
                  ) : !isAdmin && isLastOrgAdmin ? (
                    <p className="flex gap-1 items-center mt-1 text-xs font-medium text-red-600">
                      <AlertTriangle className="w-3 h-3" />
                      Cannot change role - you are the last Workspace Administrator
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Permissions within the workspace</p>
                  )}
                </div>

                <RoleInfoCard role={organizationRole} compact />

                <UserDepartmentsField
                  departments={availableDepartments}
                  selectedIds={selectedDepartmentIds}
                  onChange={setSelectedDepartmentIds}
                  onConfirmRemoveCatchAll={(deptId) =>
                    setGeneralDeptUnlinkConfirm({ open: true, deptId })
                  }
                  readOnly={deptReadOnly}
                  isGlobalAdmin={globalRole === 'admin'}
                />

                {/* Wave 5 B: per-user permission overrides */}
                {globalRole !== 'admin' && (
                  <PermissionOverridesSection
                    role={organizationRole}
                    value={permissionOverrides}
                    onChange={setPermissionOverrides}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {isAdmin && organizations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Workspace membership</CardTitle>
              </CardHeader>
              <CardContent>
                <ReactSelect
                  label="Workspace"
                  id="organization"
                  value={String(selectedOrgId ?? '')}
                  onChange={(value) => setSelectedOrgId(Number(value))}
                  options={organizations.map((org) => ({ value: String(org.id), label: org.name }))}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Moving a member removes them from their current workspace. This cannot be undone.
                </p>
              </CardContent>
            </Card>
          )}

          {canManageUsers && <UserRoutingSkillsCard userId={user.id} />}
        </div>

        {/* Actions stay reachable without scrolling back up — the form is long by nature. */}
        <div className="sticky bottom-0 px-4 py-3 border-t bg-background/95 backdrop-blur border-border">
          <div className="flex gap-2 justify-end mx-auto w-full">
            <Button type="button" variant="outline" onClick={handleLeave} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isOrgRoleChangeDisabled}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={generalDeptUnlinkConfirm.open}
        onOpenChange={(open) => setGeneralDeptUnlinkConfirm({ open, deptId: 0 })}
        onConfirm={() => {
          const { deptId } = generalDeptUnlinkConfirm;
          setGeneralDeptUnlinkConfirm({ open: false, deptId: 0 });
          setSelectedDepartmentIds(selectedDepartmentIds.filter((deptItemId) => deptItemId !== deptId));
        }}
        title="Remove catch-all department?"
        description="The Info department handles general information requests. Removing it means this user won't see Info messages. Are you sure?"
        confirmText="Remove"
        cancelText="Keep"
        variant="warning"
      />

      <ConfirmDialog
        open={orgChangeDialog.open}
        onOpenChange={(open) => setOrgChangeDialog({ open, newOrgId: 0 })}
        onConfirm={async () => {
          const { newOrgId } = orgChangeDialog;
          setOrgChangeDialog({ open: false, newOrgId: 0 });
          await handleOrgChangeConfirm(newOrgId);
        }}
        title="Change Workspace"
        description={`This will move ${user.firstName} ${user.lastName} from their current workspace to the selected workspace. This action cannot be undone.`}
        confirmText="Move User"
        cancelText="Cancel"
        variant="warning"
      />

      {/* A dialog could be dismissed by accident and lose nothing; a page can lose a
          screen's worth of edits, so leaving with unsaved changes is confirmed. */}
      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        onConfirm={() => {
          setLeaveConfirmOpen(false);
          goBack();
        }}
        title="Discard changes?"
        description="You have unsaved changes to this member. Leaving now discards them."
        confirmText="Discard"
        cancelText="Keep editing"
        variant="warning"
      />
    </Wrap>
  );
};
