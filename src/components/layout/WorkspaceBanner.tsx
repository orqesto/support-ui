import { Building2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentWorkspace } from '@/hooks/useCurrentWorkspace';

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
 * Shown only to users who can actually switch workspaces — `OrganizationSwitcher` renders
 * for global admins alone, so for everyone else there is exactly one workspace, no
 * ambiguity to resolve, and a permanent banner would be noise.
 */
export const WorkspaceBanner = () => {
  const isGlobalAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const { name, code } = useCurrentWorkspace();

  if (!isGlobalAdmin) return null;

  return (
    <div
      data-testid="workspace-banner"
      className="flex gap-2 items-center px-3 py-1.5 mb-2 text-xs rounded-md border border-border bg-muted/40 text-muted-foreground"
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
