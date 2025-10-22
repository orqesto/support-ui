import { useState, useEffect } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogClose, DialogContent, DialogFooter } from './ui/Dialog';
import { Button } from './ui/Button';
import { roleDisplayNames, type OrganizationRole, type GlobalRole } from '@/types/roles';
import type { User } from '@/types';

type EditUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (userId: number, data: { position?: string; organizationRole?: OrganizationRole; role?: GlobalRole }) => Promise<void>;
  user: User | null;
  allUsers: User[];
};

const globalRoles: GlobalRole[] = ['admin', 'user'];
const orgRoles: OrganizationRole[] = ['org_admin', 'moderator', 'support', 'associate', 'member'];

export const EditUserModal = ({ isOpen, onClose, onUpdate, user, allUsers }: EditUserModalProps) => {
  const [position, setPosition] = useState('');
  const [globalRole, setGlobalRole] = useState<GlobalRole>('user');
  const [organizationRole, setOrganizationRole] = useState<OrganizationRole>('member');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if this is the last admin
  const adminCount = allUsers.filter(u => u.role === 'admin').length;
  const isLastAdmin = user?.role === 'admin' && adminCount === 1;
  const isRoleChangeDisabled = isLastAdmin && globalRole !== 'admin';

  useEffect(() => {
    if (user) {
      setPosition(user.position || '');
      setGlobalRole((user.role as GlobalRole) || 'user');
      setOrganizationRole((user.organizationRole as OrganizationRole) || 'member');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      await onUpdate(user.id, {
        position: position.trim() || undefined,
        role: globalRole,
        organizationRole,
      });
      onClose();
    } catch (error) {
      console.error('Failed to update user:', error);
      alert('Failed to update user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">
                User
              </label>
              <div className="flex gap-3 items-center p-3 rounded-lg bg-gray-50">
                <div className="flex justify-center items-center w-10 h-10 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                  {user.firstName?.charAt(0).toUpperCase()}
                  {user.lastName?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="globalRole" className="block mb-2 text-sm font-medium text-gray-700">
                Global Role
              </label>
              <select
                id="globalRole"
                value={globalRole}
                onChange={(e) => setGlobalRole(e.target.value as GlobalRole)}
                disabled={isLastAdmin}
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {globalRoles.map((role) => (
                  <option key={role} value={role}>
                    {role === 'admin' ? 'System Administrator' : 'User'}
                  </option>
                ))}
              </select>
              {isLastAdmin ? (
                <p className="mt-1 text-xs text-red-600 font-medium">
                  ⚠️ Cannot change role - you are the last System Administrator
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  System-wide role (admin has full access)
                </p>
              )}
            </div>

            <div>
              <label htmlFor="organizationRole" className="block mb-2 text-sm font-medium text-gray-700">
                Organization Role
              </label>
              <select
                id="organizationRole"
                value={organizationRole}
                onChange={(e) => setOrganizationRole(e.target.value as OrganizationRole)}
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {orgRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleDisplayNames[role]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Permissions within the organization
              </p>
            </div>

            <div>
              <label htmlFor="position" className="block mb-2 text-sm font-medium text-gray-700">
                Position
              </label>
              <input
                id="position"
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g., Senior Developer, Support Manager"
                className="w-full px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isRoleChangeDisabled}>
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
};
