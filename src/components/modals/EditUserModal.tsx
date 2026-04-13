import { useState, useEffect } from 'react';
import { AlertTriangle, Tag, X } from 'lucide-react';
import { userService } from '@/services/user.service';
import { organizationService, type Organization } from '@/services/organization.service';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/Dialog';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/authStore';
import type { User, DepartmentRole } from '@/types';
import { roleDisplayNames, type OrganizationRole, type GlobalRole } from '@/types/roles';
import { RoleInfoCard } from '../admin/RoleInfoCard';
import { logger } from '@/lib/logger';

type EditUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (
    userId: number,
    data: {
      firstName?: string;
      lastName?: string;
      position?: string;
      telegram?: string;
      slack?: string;
      phone?: string;
      organizationRole?: OrganizationRole;
      role?: GlobalRole;
      departments?: DepartmentRole[];
    }
  ) => Promise<void>;
  user: User | null;
  allUsers: User[];
};

const globalRoles: GlobalRole[] = ['admin', 'user'];
const orgRoles: OrganizationRole[] = ['org_admin', 'moderator', 'support', 'associate'];
const departments: DepartmentRole[] = ['support', 'sales', 'billing', 'general', 'hr'];
const departmentLabels: Record<DepartmentRole, string> = {
  support: 'Support',
  sales: 'Sales',
  billing: 'Billing',
  general: 'General',
  hr: 'HR',
};

export const EditUserModal = ({
  isOpen,
  onClose,
  onUpdate,
  user,
  allUsers,
}: EditUserModalProps) => {
  const { isAdmin, canManageUsers } = usePermissions();
  const currentUser = useAuthStore((state) => state.user);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [telegram, setTelegram] = useState('');
  const [slack, setSlack] = useState('');
  const [phone, setPhone] = useState('');
  const [globalRole, setGlobalRole] = useState<GlobalRole>('user');
  const [organizationRole, setOrganizationRole] = useState<OrganizationRole>('associate');
  const [selectedDepartments, setSelectedDepartments] = useState<DepartmentRole[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<number | undefined>(undefined);
  const [orgChangeDialog, setOrgChangeDialog] = useState({ open: false, newOrgId: 0 });

  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'success' | 'error' | 'warning' | 'info';
  }>({ open: false, title: '', description: '', variant: 'info' });

  // Skill values state
  const [skillValues, setSkillValues] = useState<Record<string, string[]>>({});
  const [routingKeys, setRoutingKeys] = useState<Array<{ id: number; key: string; description: string | null }>>([]);
  const [canEditSkills, setCanEditSkillsState] = useState(false);
  const [skillInputs, setSkillInputs] = useState<Record<string, string>>({});

  // Check if user is editing their own profile
  const isEditingSelf = currentUser && user && currentUser.id === user.id;
  const canEditRoles = isAdmin ?? (canManageUsers && !isEditingSelf);
  const canEditPosition = isAdmin ?? canManageUsers; // Org admin can edit own position

  // Safety check: ensure allUsers is always an array
  const safeAllUsers = Array.isArray(allUsers) ? allUsers : [];

  // Check if this is the last global admin
  const adminCount = safeAllUsers.filter((u) => u.role === 'admin').length;
  const isLastGlobalAdmin = user?.role === 'admin' && adminCount === 1;
  const isGlobalRoleChangeDisabled = isLastGlobalAdmin && globalRole !== 'admin';

  // Check if this is the last org_admin in the organization
  const orgAdminCount = safeAllUsers.filter(
    (u) => u.organizationRole === 'org_admin' && u.organizationId === user?.organizationId
  ).length;
  const isLastOrgAdmin = user?.organizationRole === 'org_admin' && orgAdminCount === 1;
  // Only prevent if not a global admin and trying to change the last org_admin
  const isOrgRoleChangeDisabled = !isAdmin && isLastOrgAdmin && organizationRole !== 'org_admin';

  // Fetch organizations for admin
  useEffect(() => {
    if (isAdmin && isOpen) {
      organizationService
        .getAll('', 1, 100)
        .then((result) => {
          setOrganizations(result.data);
        })
        .catch((error) => {
          logger.error('Failed to load organizations:', error);
        });
    }
  }, [isAdmin, isOpen]);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setPosition(user.position ?? '');
      setTelegram(user.telegram ?? '');
      setSlack(user.slack ?? '');
      setPhone(user.phone ?? '');
      setGlobalRole(user.role);
      setOrganizationRole(user.organizationRole ?? 'associate');
      setSelectedDepartments(user.departmentRoles ?? ['support']);
      setSelectedOrgId(user.organizationId);
      void userService.getSkillValues(user.id).then(setSkillValues).catch(() => setSkillValues({}));
      void userService.getCanEditSkills(user.id).then(setCanEditSkillsState).catch(() => setCanEditSkillsState(false));
    }
  }, [user]);

  useEffect(() => {
    void organizationService.getRoutingKeys().then(setRoutingKeys).catch(() => setRoutingKeys([]));
  }, []);

  const handleAddValue = (key: string) => {
    const raw = skillInputs[key]?.trim() ?? '';
    if (!raw || !user) return;
    const newVals = raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
    const merged = [...new Set([...(skillValues[key] ?? []), ...newVals])];
    setSkillValues((prev) => ({ ...prev, [key]: merged }));
    setSkillInputs((prev) => ({ ...prev, [key]: '' }));
    void userService.setSkillValues(user.id, key, merged);
  };

  const handleRemoveValue = (key: string, value: string) => {
    if (!user) return;
    const next = (skillValues[key] ?? []).filter((v) => v !== value);
    setSkillValues((prev) => ({ ...prev, [key]: next }));
    void userService.setSkillValues(user.id, key, next);
  };

  const handleToggleCanEditSkills = (checked: boolean) => {
    if (!user) return;
    setCanEditSkillsState(checked);
    void userService.setCanEditSkills(user.id, checked);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      return;
    }

    // Handle organization change (admin only) - show confirmation first
    if (isAdmin && selectedOrgId && selectedOrgId !== user.organizationId) {
      setOrgChangeDialog({ open: true, newOrgId: selectedOrgId });
      return; // Wait for user confirmation
    }

    // Continue with regular update
    await performUpdate();
  };

  const performUpdate = async () => {
    if (!user) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Update user details
      await onUpdate(user.id, {
        firstName: firstName.trim() ?? undefined,
        lastName: lastName.trim() ?? undefined,
        position: canEditPosition ? (position.trim() ?? undefined) : undefined,
        telegram: telegram.trim() ?? undefined,
        slack: slack.trim() ?? undefined,
        phone: phone.trim() ?? undefined,
        role: canEditRoles && isAdmin ? globalRole : undefined,
        organizationRole: canEditRoles ? organizationRole : undefined,
        departments: canEditRoles ? selectedDepartments : undefined,
      });
      onClose();
    } catch (error) {
      logger.error('Failed to update user:', error);
      setAlertDialog({
        open: true,
        title: 'Update Failed',
        description: 'Failed to update user. Please try again.',
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOrgChangeConfirm = async () => {
    if (!user) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Remove from current organization
      if (user.organizationId) {
        await organizationService.removeMember(user.organizationId, user.id);
      }

      // Add to new organization with selected role
      await organizationService.addMember(orgChangeDialog.newOrgId, user.id, organizationRole);

      // Update user details
      await performUpdate();
    } catch (error) {
      logger.error('Failed to change organization:', error);
      setAlertDialog({
        open: true,
        title: 'Organization Change Failed',
        description: 'Failed to change organization. Please try again.',
        variant: 'error',
      });
      setIsSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditingSelf ? 'Edit Profile' : 'Edit User'}</DialogTitle>
            <DialogClose onClose={onClose} />
          </DialogHeader>
          <DialogContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="firstName" className="block mb-2 text-sm font-medium">
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First Name"
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
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
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last Name"
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
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

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label htmlFor="telegram" className="block mb-2 text-sm font-medium">
                    Telegram
                  </label>
                  <input
                    id="telegram"
                    type="text"
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="@username"
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                    onChange={(e) => setSlack(e.target.value)}
                    placeholder="@username"
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1234567890"
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {canEditRoles && isAdmin && (
                <>
                  <ReactSelect
                    label="Global Role"
                    id="globalRole"
                    value={globalRole}
                    onChange={(value) => {
                      setGlobalRole(value as GlobalRole);
                    }}
                    options={globalRoles.map((role) => ({
                      value: role,
                      label: role === 'admin' ? 'System Administrator' : 'User',
                    }))}
                    isDisabled={isLastGlobalAdmin}
                  />
                  {isLastGlobalAdmin ? (
                    <p className="flex gap-1 items-center -mt-2 text-xs font-medium text-red-600">
                      <AlertTriangle className="w-3 h-3" />
                      Cannot change role - you are the last System Administrator
                    </p>
                  ) : (
                    <p className="-mt-2 text-xs text-muted-foreground">
                      System-wide role (admin has full access)
                    </p>
                  )}
                </>
              )}

              {canEditRoles && (
                <>
                  <ReactSelect
                    label="Organization Role"
                    id="organizationRole"
                    value={organizationRole}
                    onChange={(value) => {
                      setOrganizationRole(value as OrganizationRole);
                    }}
                    options={orgRoles.map((role) => ({
                      value: role,
                      label: roleDisplayNames[role],
                    }))}
                    isDisabled={!isAdmin && isLastOrgAdmin}
                  />
                  {!isAdmin && isLastOrgAdmin ? (
                    <p className="flex gap-1 items-center -mt-2 text-xs font-medium text-red-600">
                      <AlertTriangle className="w-3 h-3" />
                      Cannot change role - you are the last Organization Administrator
                    </p>
                  ) : (
                    <p className="-mt-2 text-xs text-muted-foreground">
                      Permissions within the organization
                    </p>
                  )}
                  {/* Show role permissions info */}
                  <div className="-mt-2">
                    <RoleInfoCard role={organizationRole} compact />
                  </div>

                  {/* Department Selection */}
                  <div>
                    <div className="block mb-2 text-sm font-medium">Departments</div>
                    <div className="p-4 space-y-2 rounded-md border border-border bg-muted/30">
                      {departments.map((dept) => (
                        <label key={dept} className="flex gap-2 items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedDepartments.includes(dept)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDepartments([...selectedDepartments, dept]);
                              } else {
                                // Prevent deselecting all departments
                                if (selectedDepartments.length > 1) {
                                  setSelectedDepartments(
                                    selectedDepartments.filter((d) => d !== dept)
                                  );
                                }
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm">{departmentLabels[dept]}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      User can access tickets and messages from selected departments
                    </p>
                  </div>
                </>
              )}

              {isAdmin && organizations.length > 0 && (
                <>
                  <ReactSelect
                    label="Organization"
                    id="organization"
                    value={String(selectedOrgId ?? '')}
                    onChange={(value) => setSelectedOrgId(Number(value))}
                    options={organizations.map((org) => ({
                      value: String(org.id),
                      label: org.name,
                    }))}
                  />
                  <p className="-mt-2 text-xs text-muted-foreground">
                    Change user&apos;s organization membership
                  </p>
                </>
              )}

              {canEditPosition && (
                <div>
                  <label htmlFor="position" className="block mb-2 text-sm font-medium">
                    Position
                  </label>
                  <input
                    id="position"
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g., Senior Developer, Support Manager"
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}
              {!canEditPosition && position && (
                <div>
                  <label htmlFor="position" className="block mb-2 text-sm font-medium">
                    Position
                  </label>
                  <div className="px-3 py-2 text-sm rounded-md bg-muted">{position ?? '—'}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Position can only be changed by administrators
                  </p>
                </div>
              )}
              {/* Routing skill values for auto-routing */}
              {canManageUsers && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="flex gap-1 items-center text-sm font-medium">
                      <Tag className="w-3.5 h-3.5" />
                      Routing Skills
                    </label>
                    <label className="flex gap-2 items-center cursor-pointer">
                      <span className="text-xs text-muted-foreground">Allow self-edit</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={canEditSkills}
                        onClick={() => handleToggleCanEditSkills(!canEditSkills)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ${
                          canEditSkills ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            canEditSkills ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                  {routingKeys.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No routing keys defined. Add routing keys in Organization Settings.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {routingKeys.map(({ key, description }) => (
                        <div key={key} className="p-3 rounded-md border border-border bg-muted/20">
                          <div className="flex justify-between items-baseline mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {key}
                            </span>
                            {description && (
                              <span className="text-xs text-muted-foreground">{description}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(skillValues[key] ?? []).map((val) => (
                              <span
                                key={val}
                                className="flex gap-1 items-center px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary"
                              >
                                {val}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveValue(key, val)}
                                  className="hover:text-red-500"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                            {(skillValues[key] ?? []).length === 0 && (
                              <span className="text-xs text-muted-foreground italic">None set</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={skillInputs[key] ?? ''}
                              onChange={(e) =>
                                setSkillInputs((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddValue(key);
                                }
                              }}
                              placeholder="e.g. de, en (comma-separated)"
                              className="flex-1 px-2 py-1 text-xs rounded border bg-input text-foreground border-border placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddValue(key)}
                              className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Skill values are matched against incoming message attributes for auto-assignment.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting ?? isGlobalRoleChangeDisabled ?? isOrgRoleChangeDisabled}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={orgChangeDialog.open}
        onOpenChange={(open) => setOrgChangeDialog({ open, newOrgId: 0 })}
        onConfirm={async () => {
          setOrgChangeDialog({ open: false, newOrgId: 0 });
          await handleOrgChangeConfirm();
        }}
        title="Change Organization"
        description={
          user
            ? `This will move ${user.firstName} ${user.lastName} from their current organization to the selected organization. This action cannot be undone.`
            : ''
        }
        confirmText="Move User"
        cancelText="Cancel"
        variant="warning"
      />

      <AlertDialog
        open={alertDialog.open}
        onOpenChange={(open) => setAlertDialog({ ...alertDialog, open })}
        title={alertDialog.title}
        description={alertDialog.description}
        variant={alertDialog.variant}
      />
    </>
  );
};
