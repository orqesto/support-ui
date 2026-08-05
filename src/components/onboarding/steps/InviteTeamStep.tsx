import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, UserPlus, UserRoundPlus } from 'lucide-react';
import { CreateUserModal } from '@/components/modals/CreateUserModal';
import { InviteUserModal } from '@/components/modals/InviteUserModal';
import { Button } from '@/components/ui/Button';
import { invitationService } from '@/services/invitation.service';
import { subscriptionService } from '@/services/subscription.service';
import { userService } from '@/services/user.service';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';
import type { OrganizationRole } from '@/types/roles';

// The seed plans use 999999 as a sentinel for "unlimited"; treat anything at or
// above it as no cap rather than showing "N of 999999 seats used".
const UNLIMITED_SEATS = 999999;

type AddedMember = { email: string; kind: 'invited' | 'created' };

/**
 * Step 6 (last) — grow the team (optional). Two ways to add people, both capped
 * by the plan's user limit (enforced on the backend for invites and direct
 * creation alike): invite by email, or create an account directly with a
 * password. Remaining seats are surfaced so the admin knows the plan ceiling
 * before they hit it. The footer shows "Finish setup".
 */
export const InviteTeamStep = () => {
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [added, setAdded] = useState<AddedMember[]>([]);
  const [seats, setSeats] = useState<{ used: number; limit: number } | null>(null);

  const loadSeats = () => {
    subscriptionService
      .getUsage()
      .then((usage) => setSeats({ used: usage.current.users, limit: usage.limits.users }))
      .catch((error: unknown) => {
        // Non-fatal: the backend still enforces the cap on invite/create, so a
        // failed usage read just hides the seat hint rather than blocking.
        logger.error('Failed to load seat usage for onboarding:', error);
      });
  };

  useEffect(() => {
    loadSeats();
  }, []);

  const unlimited = seats !== null && seats.limit >= UNLIMITED_SEATS;
  const remaining = seats === null ? null : Math.max(0, seats.limit - seats.used);
  const atLimit = !unlimited && remaining !== null && remaining <= 0;

  const recordAdded = (email: string, kind: AddedMember['kind']) =>
    setAdded((prev) =>
      prev.some((existing) => existing.email === email) ? prev : [...prev, { email, kind }]
    );

  const handleInvite = async (
    email: string,
    role: OrganizationRole,
    departmentIds: number[],
    organizationId: number,
    senderIntegrationId?: number
  ) => {
    await invitationService.invite(email, role, departmentIds, organizationId, senderIntegrationId);
    recordAdded(email, 'invited');
    loadSeats();
  };

  const handleCreate = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName?: string;
    position?: string;
    role?: 'admin' | 'user';
    organizationRole: OrganizationRole;
    departmentIds: number[];
  }) => {
    const user = await userService.create(data);
    recordAdded(user.email, 'created');
    loadSeats();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add the people who&apos;ll handle conversations. Invite them by email (they get a signup
        link) or create an account directly with a password. You can add more anytime from the Users
        page.
      </p>

      {seats !== null && (
        <p className="text-sm text-muted-foreground">
          {unlimited
            ? `${seats.used} teammate${seats.used === 1 ? '' : 's'} · unlimited seats on your plan`
            : `${seats.used} of ${seats.limit} seats used${
                remaining !== null && remaining > 0 ? ` · ${remaining} left` : ''
              }`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={atLimit} onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite a teammate
        </Button>
        <Button variant="outline" disabled={atLimit} onClick={() => setCreateOpen(true)}>
          <UserRoundPlus className="mr-2 h-4 w-4" />
          Create a user
        </Button>
      </div>

      {atLimit && (
        <p className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-amber-600 dark:text-amber-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          You&apos;ve reached your plan&apos;s user limit. Upgrade your plan to add more seats.
        </p>
      )}

      {added.length > 0 && (
        <ul className="space-y-1">
          {added.map((member) => (
            <li
              key={member.email}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <CheckCircle className="h-4 w-4 text-primary" />
              {member.email} {member.kind === 'created' ? 'created' : 'invited'}
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        This is the last step. Click <span className="font-medium text-foreground">Finish setup</span>{' '}
        below when you&apos;re ready — you can add more teammates anytime from the Users page.
      </p>

      <InviteUserModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={handleInvite}
        prefilledOrganizationId={selectedOrganizationId ?? undefined}
      />
      <CreateUserModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </div>
  );
};
