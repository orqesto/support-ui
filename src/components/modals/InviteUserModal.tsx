import { useState, useEffect, useRef, type FormEvent } from 'react';
import { X, Mail, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ReactSelect } from '@/components/ui/ReactSelect';
import { usePermissions } from '@/hooks/usePermissions';
import type { OrganizationRole } from '@/types/roles';
import { organizationService } from '@/services/organization.service';
import { departmentService, type Department } from '@/services/department.service';
import { integrationsService } from '@/services/integrations.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import { isDepartmentServed } from '@/utils/departmentReachability';

type EmailIntegrationOption = { id: number; name: string };

type InviteUserModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (
    email: string,
    role: OrganizationRole,
    departmentIds: number[],
    organizationId: number,
    senderIntegrationId?: number
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
  const [departmentIds, setDepartmentIds] = useState<number[]>([]);
  // The invite goes to the workspace the requests carry (`X-Organization-Context`): the backend
  // invites into that one and refuses a body naming another (FE audit C-H3 — a picker here used
  // to offer every workspace and silently invite into the current one).
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  // A global admin with no workspace selected has none: the backend gives them no default (it
  // answers 400), so naming their own workspace here would promise an invite that cannot happen.
  const organizationId = selectedOrganizationId ?? (isAdmin ? null : (user?.organizationId ?? null));
  // The workspace the department / sender picks were made in: a pick from another one is invalid.
  const picksFor = useRef<number | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  // Asked to invite into a workspace other than the one the requests go to: refuse up front.
  const wrongWorkspace =
    prefilledOrganizationId !== undefined &&
    organizationId !== null &&
    prefilledOrganizationId !== organizationId;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [emailIntegrations, setEmailIntegrations] = useState<EmailIntegrationOption[]>([]);
  const [senderIntegrationId, setSenderIntegrationId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Answers for a workspace this dialog has since left (a switch, another tab) are dropped.
    let stale = false;
    const loadWorkspaceName = async () => {
      try {
        // The current workspace — the same one the departments and mailboxes below come from.
        const current = await organizationService.getCurrent();
        if (!stale) setWorkspaceName(current.id === organizationId ? current.name : null);
      } catch (err) {
        logger.error('Failed to load the workspace:', err);
        if (!stale) setWorkspaceName(null);
      }
    };

    if (isOpen && organizationId === null) setWorkspaceName(null);
    if (isOpen && organizationId !== null) {
      // Picks made in another workspace (the dialog stays mounted between openings) would be
      // refused by the backend: start this workspace's picks afresh.
      const sameWorkspace = picksFor.current === organizationId;
      picksFor.current = organizationId;
      if (!sameWorkspace) {
        setDepartmentIds([]);
        setSenderIntegrationId(null);
        setWorkspaceName(null);
      }
      if (prefilledEmail) {
        setEmail(prefilledEmail);
      }
      loadWorkspaceName().catch((err) => logger.error('Failed to load the workspace:', err));

      departmentService
        .getAll()
        .then((depts) => {
          if (stale) return;
          setDepartments(depts);
          // Preselect the first SERVED department so the form is valid by default — never
          // an unserved one (it's disabled and can't be handled).
          const firstServed = depts.find(isDepartmentServed);
          if (firstServed) {
            setDepartmentIds((prev) => (prev.length > 0 ? prev : [firstServed.id]));
          }
        })
        .catch(() => {
          if (!stale) setDepartments([]);
        });

      // Email integrations the invite can be sent from (Gmail / IMAP).
      integrationsService
        .getAll()
        .then((res) => {
          if (stale) return;
          const emailish = (res.data ?? []).filter(
            (integration) =>
              integration.enabled &&
              (integration.type === 'email' || integration.type === 'gmail')
          );
          setEmailIntegrations(
            emailish.map((integration) => ({ id: integration.id, name: integration.name }))
          );
          setSenderIntegrationId((prev) => prev ?? emailish[0]?.id ?? null);
        })
        .catch(() => {
          if (!stale) setEmailIntegrations([]);
        });
    }
    return () => {
      stale = true;
    };
  }, [isOpen, organizationId, prefilledEmail]);

  const toggleDepartment = (id: number) => {
    setDepartmentIds((prev) =>
      prev.includes(id) ? prev.filter((deptId) => deptId !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!organizationId) {
      setError('No workspace is selected. Choose a workspace first.');
      return;
    }
    if (wrongWorkspace) {
      setError('This invitation is for a different workspace. Switch to that workspace first.');
      return;
    }
    // org_admin sees every department regardless (the BE fans them out); mirror
    // CreateUser — auto-send all active depts and skip the "pick one" requirement.
    const effectiveDepartmentIds =
      role === 'org_admin' ? departments.map((dept) => dept.id) : departmentIds;
    if (role !== 'org_admin' && departmentIds.length === 0) {
      setError('Please select at least one department');
      return;
    }

    setIsLoading(true);
    try {
      await onInvite(
        email,
        role,
        effectiveDepartmentIds,
        organizationId,
        // Only meaningful when there's a choice; BE defaults to the org's first otherwise.
        emailIntegrations.length > 1 ? senderIntegrationId ?? undefined : undefined
      );
      setEmail('');
      setRole('associate');
      setDepartmentIds(departments[0] ? [departments[0].id] : []);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
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
        className="w-full max-w-md rounded-lg shadow-xl bg-card max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border">
          <div className="flex gap-2 items-center">
            <div className="flex justify-center items-center w-10 h-10 rounded-lg bg-muted">
              <UserPlus className="w-5 h-5 text-muted-foreground" />
            </div>
            <h2 className="font-display text-xl font-semibold">Invite User</h2>
          </div>
          <Button
            aria-label="Close"
            title="Close"
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

          <Input
            label="Workspace"
            value={workspaceName ?? (organizationId ? `Workspace #${organizationId}` : '')}
            disabled
            readOnly
          />
          <p className="-mt-2 text-sm text-muted-foreground" data-testid="invite-workspace-hint">
            {organizationId === null
              ? 'No workspace is selected. Choose a workspace first.'
              : wrongWorkspace
                ? 'This invitation is for a different workspace than the one you are working in. Switch to that workspace first.'
                : isAdmin
                  ? 'Invitations go to the workspace you are working in. To invite into another workspace, switch to it first.'
                  : 'User will be added to this workspace'}
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
                ? [{ value: 'org_admin', label: 'Workspace Admin - Full control' }]
                : []),
            ]}
            required
          />
          <p className="-mt-2 text-sm text-muted-foreground">
            {isAdmin
              ? 'Select the role for this user in the workspace'
              : 'Org admins cannot invite other org admins'}
          </p>

          {/* Departments. org_admin is auto-linked to every department (BE fans out),
              so — like CreateUser — we hide the picker and show an "all departments" note. */}
          {role === 'org_admin' ? (
            <div>
              <span className="block mb-2 text-sm font-medium text-foreground">Departments</span>
              <div className="px-3 py-2 text-sm rounded-md border bg-muted/30 text-muted-foreground">
                <strong>All active departments</strong> — org admins are auto-linked to every
                department for cross-department visibility.
              </div>
            </div>
          ) : (
            <div>
              <span className="block mb-2 text-sm font-medium text-foreground">
                Departments <span className="text-destructive">*</span>
              </span>
              {departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading departments…</p>
              ) : departments.filter(isDepartmentServed).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No departments have a connected message source yet.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {departments.filter(isDepartmentServed).map((dept) => (
                    <label
                      key={dept.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={departmentIds.includes(dept.id)}
                        onChange={() => toggleDepartment(dept.id)}
                      />
                      <span>{dept.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                Select one or more. Determines which message sources, categories, and docs the
                user sees.
              </p>
            </div>
          )}

          {/* Send-from picker — only when the org has more than one email integration. */}
          {emailIntegrations.length > 1 && (
            <div>
              <ReactSelect
                label="Send invitation from"
                value={String(senderIntegrationId ?? '')}
                onChange={(value) => setSenderIntegrationId(value ? Number(value) : null)}
                options={emailIntegrations.map((integration) => ({
                  value: String(integration.id),
                  label: integration.name,
                }))}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                The mailbox the invitation email is sent from
              </p>
            </div>
          )}

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
            <Button
              type="submit"
              className="flex-1"
              isLoading={isLoading}
              disabled={isLoading || wrongWorkspace || organizationId === null}
            >
              <Mail className="mr-2 w-4 h-4" />
              Send Invitation
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
