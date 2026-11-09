/**
 * Who is who in the viewer list: userId → display name, initials and avatar colour, from the
 * workspace's member list (one cached request shared by every header; 5 min stale).
 */
import { useQuery } from '@tanstack/react-query';
import { getInitials } from '@/lib/initials';
import { useAuthStore } from '@/stores/authStore';
import { organizationService } from '@/services/organization.service';
import { getAvatarColor } from '../components/inboxCardHelpers';

export interface PresenceAgent {
  name: string;
  initials: string;
  colour: string;
  known: boolean;
}

const MEMBERS_STALE_MS = 5 * 60_000;
export const UNKNOWN_AGENT_NAME = 'Another agent';

const UNKNOWN_AGENT: PresenceAgent = {
  name: UNKNOWN_AGENT_NAME,
  initials: '?',
  colour: getAvatarColor(null),
  known: false,
};

/** Returns a lookup that never fails: a userId missing from the list is "Another agent". */
export const useOrgMemberNames = (): ((userId: number) => PresenceAgent) => {
  // Keyed by the active workspace: after a switch the old workspace's list must never answer.
  const orgId = useAuthStore((state) => state.selectedOrganizationId);
  const { data } = useQuery({
    queryKey: ['organization-members', orgId],
    queryFn: () => organizationService.getMembers(),
    enabled: orgId !== null,
    staleTime: MEMBERS_STALE_MS,
  });
  const byId = new Map<number, PresenceAgent>();
  for (const member of data ?? []) {
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
    if (!name) continue;
    byId.set(member.userId, {
      name,
      initials: getInitials(name),
      colour: getAvatarColor(name),
      known: true,
    });
  }
  return (userId) => byId.get(userId) ?? UNKNOWN_AGENT;
};
