/**
 * Who is who in the viewer list: userId → display name, initials and avatar colour, from
 * GET /api/presence/members (any member may read it, associates included; one cached request
 * shared by every header; 5 min stale). An older backend without the route answers "Another
 * agent" for everyone, asked once — never a 403 per eye, banner or tooltip.
 */
import { useQuery } from '@tanstack/react-query';
import { getInitials } from '@/lib/initials';
import { useAuthStore } from '@/stores/authStore';
import { getAvatarColor } from '../components/inboxCardHelpers';
import { presenceMembersService } from '../services/presenceMembers.service';

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

/**
 * Returns a lookup that never fails: a userId missing from the list is "Another agent".
 * `fetch: false` only reads what other screens already loaded (a list row must not start the
 * request just to draw a badge); the names then fill in when the list arrives.
 */
export const useOrgMemberNames = (
  options: { fetch?: boolean } = {}
): ((userId: number) => PresenceAgent) => {
  // Keyed by the active workspace: after a switch the old workspace's list must never answer.
  const orgId = useAuthStore((state) => state.selectedOrganizationId);
  const { data } = useQuery({
    queryKey: ['presence-members', orgId],
    queryFn: () => presenceMembersService.list(),
    enabled: orgId !== null && options.fetch !== false,
    staleTime: MEMBERS_STALE_MS,
    // Names are a nicety: a failure shows "Another agent" and is not asked again at once.
    retry: false,
  });
  const byId = new Map<number, PresenceAgent>();
  for (const member of data ?? []) {
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
    if (!name) continue;
    byId.set(member.id, {
      name,
      initials: getInitials(name),
      colour: getAvatarColor(name),
      known: true,
    });
  }
  return (userId) => byId.get(userId) ?? UNKNOWN_AGENT;
};
