import { useState, useEffect, type FormEvent } from 'react';
import { X, Mail, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService, type Organization } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

type InviteUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (
    email: string,
    role: string,
    departmentRole: string,
    organizationId: number
  ) => Promise<void>;
};

export const InviteUserModal = ({ isOpen, onClose, onInvite }: InviteUserModalProps) => {
  const { isAdmin } = usePermissions();
  const user = useAuthStore((state) => state.user);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('associate');
  const [departmentRole, setDepartmentRole] = useState<string>('support');
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        if (isAdmin) {
          // Global admin can select from all organizations
          const result = await organizationService.getAll();
          const orgs = result.data || [];
          setOrganizations(orgs);
          if (orgs.length > 0 && !organizationId) {
            setOrganizationId(orgs[0].id);
          }
        } else {
          // Org admin can only invite to their own organization
          if (user?.organizationId) {
            const currentOrg = await organizationService.getCurrent();
            setOrganizations([currentOrg]);
            setOrganizationId(currentOrg.id);
          }
        }
      } catch (err) {
        console.error('Failed to load organizations:', err);
      }
    };

    if (isOpen) {
      loadOrganizations().catch((error) => {
        console.error('Failed to load organizations:', error);
      });
    }
  }, [isOpen, isAdmin, user?.organizationId, organizationId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!organizationId) {
      setError('Please select an organization');
      return;
    }

    setIsLoading(true);

    try {
      await onInvite(email, role, departmentRole, organizationId);
      setEmail('');
      setRole('associate');
      setDepartmentRole('support');
      // Keep organization selected (for org_admin it's their org, for admin keep first)
      if (!isAdmin) {
        // For org_admin, keep their organization
      } else {
        // For global admin, reset to first org
        setOrganizationId(organizations[0]?.id || null);
      }
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to send invitation');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="flex fixed inset-0 z-50 justify-center items-center p-4 bg-black/50"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg shadow-xl bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/10">
              <UserPlus className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold">Invite User</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-2 h-auto transition-colors text-muted-foreground hover:text-foreground hover:bg-transparent"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Input
              label="Email Address"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll send an invitation link to this email
            </p>
          </div>

          <Select
            label="Organization"
            value={organizationId ?? ''}
            onChange={(e) => setOrganizationId(Number(e.target.value))}
            disabled={!isAdmin}
            required
          >
            {organizations.length === 0 && <option value="">Loading organizations...</option>}
            {isAdmin && organizations.length > 0 && (
              <option value="">Select organization...</option>
            )}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </Select>
          <p className="-mt-2 text-sm text-muted-foreground">
            {isAdmin
              ? 'Select the organization to invite this user to'
              : 'User will be added to your organization'}
          </p>

          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} required>
            <option value="associate">Associate - Read-only with request permissions</option>
            <option value="support">Support - Manage tickets and messages</option>
            <option value="moderator">Moderator - Manage integrations, categories, AI</option>
            {isAdmin && <option value="org_admin">Organization Admin - Full control</option>}
          </Select>
          <p className="-mt-2 text-sm text-muted-foreground">
            {isAdmin
              ? 'Select the role for this user in the organization'
              : 'Org admins cannot invite other org admins'}
          </p>

          <Select
            label="Department"
            value={departmentRole}
            onChange={(e) => setDepartmentRole(e.target.value)}
            required
          >
            <option value="support">Support - Customer support team</option>
            <option value="sales">Sales - Sales team</option>
            <option value="billing">Billing - Billing/finance team</option>
            <option value="general">General - General/shared/admin</option>
          </Select>
          <p className="-mt-2 text-sm text-muted-foreground">
            Department determines which message sources, categories, and docs the user sees
          </p>

          {error && (
            <div className="p-3 text-sm rounded-md text-destructive bg-destructive/10">{error}</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={isLoading}>
              <Mail className="mr-2 w-4 h-4" />
              Send Invitation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
