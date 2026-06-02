import { useState, useEffect, type FormEvent } from 'react';
import { X, Mail, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import type { OrganizationRole } from '@/types/roles';
import { organizationService, type Organization } from '@/services/organization.service';
import { departmentService, type Department } from '@/services/department.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

type InviteUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (
    email: string,
    role: OrganizationRole,
    departmentId: number,
    organizationId: number
  ) => Promise<void>;
  prefilledEmail?: string;
  prefilledOrganizationId?: number;
};

export const InviteUserModal = ({
  isOpen,
  onClose,
  onInvite,
  prefilledEmail,
  prefilledOrganizationId,
}: InviteUserModalProps) => {
  const { isAdmin } = usePermissions();
  const user = useAuthStore((state) => state.user);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('associate');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
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
          // Preselect organization: prefilled > current organizationId > first org
          if (prefilledOrganizationId) {
            setOrganizationId(prefilledOrganizationId);
          } else if (orgs.length > 0 && !organizationId) {
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
        logger.error('Failed to load organizations:', err);
      }
    };

    if (isOpen) {
      if (prefilledEmail) {
        setEmail(prefilledEmail);
      }
      loadOrganizations().catch((error) => {
        logger.error('Failed to load organizations:', error);
      });
      departmentService
        .getAll()
        .then((depts) => {
          setDepartments(depts);
          // Default to first active department if none selected yet
          if (depts.length > 0) {
            setDepartmentId((prev) => prev ?? depts[0].id);
          }
        })
        .catch(() => setDepartments([]));
    }
  }, [
    isOpen,
    isAdmin,
    user?.organizationId,
    organizationId,
    prefilledEmail,
    prefilledOrganizationId,
  ]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!organizationId) {
      setError('Please select an organization');
      return;
    }
    if (!departmentId) {
      setError('Please select a department');
      return;
    }

    setIsLoading(true);

    try {
      await onInvite(email, role, departmentId, organizationId);
      setEmail('');
      setRole('associate');
      setDepartmentId(departments[0]?.id ?? null);
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
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
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
        onClick={(event) => event.stopPropagation()}
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
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll send an invitation link to this email
            </p>
          </div>

          <ReactSelect
            label="Organization"
            value={String(organizationId ?? '')}
            onChange={(value) => setOrganizationId(Number(value))}
            options={[
              ...(organizations.length === 0
                ? [{ value: '', label: 'Loading organizations...' }]
                : []),
              ...organizations.map((org) => ({ value: String(org.id), label: org.name })),
            ]}
            isDisabled={!isAdmin}
            required
          />
          <p className="-mt-2 text-sm text-muted-foreground">
            {isAdmin
              ? 'Select the organization to invite this user to'
              : 'User will be added to your organization'}
          </p>

          <ReactSelect
            label="Role"
            value={role}
            onChange={(value) => setRole(value as OrganizationRole)}
            options={[
              { value: 'associate', label: 'Associate - Read-only with request permissions' },
              { value: 'support', label: 'Support - Manage tickets and messages' },
              { value: 'moderator', label: 'Moderator - Manage integrations, categories, AI' },
              ...(isAdmin
                ? [{ value: 'org_admin', label: 'Organization Admin - Full control' }]
                : []),
            ]}
            required
          />
          <p className="-mt-2 text-sm text-muted-foreground">
            {isAdmin
              ? 'Select the role for this user in the organization'
              : 'Org admins cannot invite other org admins'}
          </p>

          <ReactSelect
            label="Department"
            value={String(departmentId ?? '')}
            onChange={(value) => setDepartmentId(value ? Number(value) : null)}
            options={departments.map((dept) => ({ value: String(dept.id), label: dept.name }))}
            placeholder={departments.length === 0 ? 'Loading...' : 'Select department'}
            required
          />
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
