import { useState, useEffect } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService, type Organization } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { roleDisplayNames, type OrganizationRole, type GlobalRole } from '@/types/roles';
import { AlertDialog } from './ui/AlertDialog';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogContent,
  DialogFooter,
} from './ui/Dialog';

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
    }
  ) => Promise<void>;
  user: User | null;
  allUsers: User[];
};

const globalRoles: GlobalRole[] = ['admin', 'user'];
const orgRoles: OrganizationRole[] = ['org_admin', 'moderator', 'support', 'associate'];

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

  // Check if user is editing their own profile
  const isEditingSelf = currentUser && user && currentUser.id === user.id;
  const canEditRoles = isAdmin || (canManageUsers && !isEditingSelf);
  const canEditPosition = isAdmin || canManageUsers; // Org admin can edit own position

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
          console.error('Failed to load organizations:', error);
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
      setGlobalRole((user.role as GlobalRole) ?? 'user');
      setOrganizationRole((user.organizationRole as OrganizationRole) ?? 'associate');
      setSelectedOrgId(user.organizationId);
    }
  }, [user]);

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
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        position: canEditPosition ? position.trim() || undefined : undefined,
        telegram: telegram.trim() || undefined,
        slack: slack.trim() || undefined,
        phone: phone.trim() || undefined,
        role: canEditRoles && isAdmin ? globalRole : undefined,
        organizationRole: canEditRoles ? organizationRole : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to update user:', error);
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
      console.error('Failed to change organization:', error);
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
                <div>
                  <label htmlFor="globalRole" className="block mb-2 text-sm font-medium">
                    Global Role
                  </label>
                  <select
                    id="globalRole"
                    value={globalRole}
                    onChange={(e) => setGlobalRole(e.target.value as GlobalRole)}
                    disabled={isLastGlobalAdmin}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
                  >
                    {globalRoles.map((role) => (
                      <option key={role} value={role}>
                        {role === 'admin' ? 'System Administrator' : 'User'}
                      </option>
                    ))}
                  </select>
                  {isLastGlobalAdmin ? (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      ⚠️ Cannot change role - you are the last System Administrator
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      System-wide role (admin has full access)
                    </p>
                  )}
                </div>
              )}

              {canEditRoles && (
                <div>
                  <label htmlFor="organizationRole" className="block mb-2 text-sm font-medium">
                    Organization Role
                  </label>
                  <select
                    id="organizationRole"
                    value={organizationRole}
                    onChange={(e) => setOrganizationRole(e.target.value as OrganizationRole)}
                    disabled={!isAdmin && isLastOrgAdmin}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
                  >
                    {orgRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleDisplayNames[role]}
                      </option>
                    ))}
                  </select>
                  {!isAdmin && isLastOrgAdmin ? (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      ⚠️ Cannot change role - you are the last Organization Administrator
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Permissions within the organization
                    </p>
                  )}
                </div>
              )}

              {isAdmin && organizations.length > 0 && (
                <div>
                  <label htmlFor="organization" className="block mb-2 text-sm font-medium">
                    Organization
                  </label>
                  <select
                    id="organization"
                    value={selectedOrgId ?? ''}
                    onChange={(e) => setSelectedOrgId(parseInt(e.target.value))}
                    className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Change user&apos;s organization membership
                  </p>
                </div>
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
                  <div className="px-3 py-2 text-sm rounded-md bg-muted">{position || '—'}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Position can only be changed by administrators
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
              disabled={isSubmitting || isGlobalRoleChangeDisabled || isOrgRoleChangeDisabled}
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
