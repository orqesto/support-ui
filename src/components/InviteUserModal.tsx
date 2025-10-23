import { useState, useEffect, type FormEvent } from 'react';
import { X, Mail, UserPlus } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { organizationService, type Organization } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

type InviteUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (email: string, role: string, organizationId: number) => Promise<void>;
};

export const InviteUserModal = ({ isOpen, onClose, onInvite }: InviteUserModalProps) => {
  const { isAdmin } = usePermissions();
  const user = useAuthStore((state) => state.user);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('associate');
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
      await onInvite(email, role, organizationId);
      setEmail('');
      setRole('associate');
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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="flex fixed inset-0 z-50 justify-center items-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-lg shadow-xl bg-card">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-10 h-10 rounded-lg bg-blue-500/10 dark:bg-blue-500/10">
              <UserPlus className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold">Invite User</h2>
          </div>
          <Button
            onClick={onClose}
            className="transition-colors text-muted-foreground hover:text-foreground"
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

          <div>
            <label htmlFor="organization" className="block mb-1 text-sm font-medium">
              Organization
            </label>
            <select
              value={organizationId ?? ''}
              onChange={(e) => setOrganizationId(Number(e.target.value))}
              className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
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
            </select>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? 'Select the organization to invite this user to'
                : 'User will be added to your organization'}
            </p>
          </div>

          <div>
            <label htmlFor="role" className="block mb-1 text-sm font-medium">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-3 py-2 w-full rounded-md border bg-input text-foreground border-border focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="associate">Associate - Read-only with request permissions</option>
              <option value="support">Support - Manage tickets and messages</option>
              <option value="moderator">Moderator - Manage integrations, categories, AI</option>
              {isAdmin && <option value="org_admin">Organization Admin - Full control</option>}
            </select>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAdmin
                ? 'Select the role for this user in the organization'
                : 'Org admins cannot invite other org admins'}
            </p>
          </div>

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
