import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { organizationService } from '@/services/organization.service';
import { useAuthStore } from '@/stores/authStore';

export const WORKSPACE_SKILLS_KEY = 'workspace-skill-values';

/** `{ [userId]: { [key]: values[] } }` for the whole workspace. */
export type WorkspaceSkills = Record<string, Record<string, string[]>>;

/**
 * Who holds which routing skill, for the whole workspace in ONE request (owner 2026-11-09: the users
 * list and the routing values page show it instead of one dialog per user). Keyed on the workspace.
 *
 * `skills`: undefined while loading or after a failed read; null on an older backend without the
 * endpoint (callers then show what they showed before); otherwise the map. `refresh` re-reads it
 * after an edit (the skills dialog).
 */
export function useWorkspaceSkills(enabled = true): {
  skills: WorkspaceSkills | null | undefined;
  /** One member's skills: undefined/null as `skills`, `{}` for a member who holds none. */
  skillsOf: (userId: number) => Record<string, string[]> | null | undefined;
  refresh: () => void;
} {
  const orgId = useAuthStore(
    (state) => state.selectedOrganizationId ?? state.user?.organizationId ?? null
  );
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [WORKSPACE_SKILLS_KEY, orgId],
    queryFn: () => organizationService.getWorkspaceSkillValues(),
    staleTime: 30 * 1000,
    retry: false,
    enabled,
  });
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [WORKSPACE_SKILLS_KEY] });
  }, [queryClient]);
  const skills = query.data;
  const skillsOf = (userId: number) =>
    skills === undefined || skills === null ? skills : (skills[String(userId)] ?? {});
  return { skills, skillsOf, refresh };
}

/** Routing compares keys ignoring case, `_` and `-`, and values ignoring case (BE skillCatalog). */
export const sameSkillKey = (left: string, right: string): boolean =>
  left.toLowerCase().replace(/[_-]/g, '') === right.toLowerCase().replace(/[_-]/g, '');
export const sameSkillValue = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();
