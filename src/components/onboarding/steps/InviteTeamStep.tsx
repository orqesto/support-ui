import { useState } from 'react';
import { CheckCircle, UserPlus } from 'lucide-react';
import { InviteUserModal } from '@/components/modals/InviteUserModal';
import { Button } from '@/components/ui/Button';
import { invitationService } from '@/services/invitation.service';
import { useAuthStore } from '@/stores/authStore';
import type { OrganizationRole } from '@/types/roles';

/**
 * Step 6 — invite teammates (optional). Reuses InviteUserModal + the same
 * invitationService call as UsersPage. Invited members skip the wizard — it's
 * org-level state and this admin is completing it. This is the last step: the
 * footer shows "Finish setup".
 */
export const InviteTeamStep = () => {
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const [modalOpen, setModalOpen] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);

  const handleInvite = async (
    email: string,
    role: OrganizationRole,
    departmentIds: number[],
    organizationId: number,
    senderIntegrationId?: number
  ) => {
    await invitationService.invite(email, role, departmentIds, organizationId, senderIntegrationId);
    setInvited((prev) => (prev.includes(email) ? prev : [...prev, email]));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Invite the people who&apos;ll handle conversations. Each gets an email with a signup link;
        they land straight in the shared inbox — no setup needed on their side. You can always
        invite more from the Users page.
      </p>

      <Button variant="outline" onClick={() => setModalOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        Invite a teammate
      </Button>

      {invited.length > 0 && (
        <ul className="space-y-1">
          {invited.map((email) => (
            <li key={email} className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle className="h-4 w-4 text-primary" />
              {email} invited
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        This is the last step. Click <span className="font-medium text-foreground">Finish setup</span>{' '}
        below when you&apos;re ready — you can invite more teammates anytime from the Users page.
      </p>

      <InviteUserModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onInvite={handleInvite}
        prefilledOrganizationId={selectedOrganizationId ?? undefined}
      />
    </div>
  );
};
