import { Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace';
import { canSwitchWorkspace } from './canSwitchWorkspace';

/**
 * Names the workspace you are about to write to, above every screen.
 *
 * 2026-08-16: a `reply_style` activation intended for `odly` was applied to
 * **framehouse — the client** and was live ~90 seconds. Not a slip: the Prompts screen
 * contains no reference to a workspace at all, and the only tenant control is a small
 * switcher at the far bottom-left of the sidebar, nowhere near the toggle you click.
 *
 * Rendered by the Layout rather than by each screen, because the screens that write
 * per-org rows are **52** by count (6 via useMutation, 46 calling a write method or
 * apiClient directly) and an allowlist of 52 is a list someone will forget to extend.
 * One banner above `main` covers every one of them, including the next one written.
 *
 * Shown to exactly the users who can switch workspaces — the same predicate the
 * `OrganizationSwitcher` renders on (`canSwitchWorkspace`). It used to check global-admin
 * only, while the switcher also rendered for anyone with two memberships: a multi-workspace
 * org_admin could switch and then write with no banner. For a user with one workspace there
 * is no ambiguity to resolve, and a permanent banner would be noise.
 *
 * Kept to one slim line: it sits above the kanban, where every pixel of height is
 * working area, so it has the padding of a caption, not of a card.
 */
export const WorkspaceBanner = () => {
  const user = useAuthStore((state) => state.user);
  const { name, code } = useCurrentWorkspace();

  // A global admin can always switch — no list needed. Anyone else can switch only if
  // they belong to two or more workspaces, which is the switcher's own data source.
  const isGlobalAdmin = user?.role === 'admin';
  const { data: memberships } = useQuery({
    queryKey: ['my-organizations', user?.id ?? null],
    queryFn: () => authService.myOrganizations(),
    enabled: !isGlobalAdmin && user !== null,
    staleTime: 5 * 60 * 1000,
  });

  if (!canSwitchWorkspace(user, memberships ?? [])) return null;

  return (
    <div
      data-testid="workspace-banner"
      className="flex gap-2 items-center px-2.5 py-0.5 mb-1.5 text-[11.5px] rounded-md border border-border bg-muted/40 text-muted-foreground"
    >
      <Building2 className="w-3.5 h-3.5 shrink-0" />
      <span>
        You are editing{' '}
        {name ? (
          <span className="font-medium text-foreground">{name}</span>
        ) : (
          // Never guess the tenant. An unresolved workspace says so, because a wrong
          // name here is worse than no name.
          <span className="font-medium text-foreground">an unidentified workspace</span>
        )}
        {code && <span className="ml-1 opacity-70">({code})</span>}
      </span>
    </div>
  );
};
