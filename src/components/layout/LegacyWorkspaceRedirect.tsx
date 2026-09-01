import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '@/services/auth.service';
import { organizationService } from '@/services/organization.service';
import { Spinner } from '@/components/ui/Spinner';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

/** The only fields either workspace endpoint is read for here. */
type WorkspaceRef = { id: number; name: string; slug: string };
import NotFoundPage from '@/pages/NotFoundPage';

/**
 * Sends a pre-workspace URL to its workspace-scoped equivalent.
 *
 * Every authenticated route now lives under `/w/:slug`, but `/messages?id=MKT-170` is in
 * bookmarks, in email, and in every link this app has ever generated. Those must keep
 * working, so an unmatched path is rewritten onto the CURRENT workspace rather than 404ing.
 *
 * ⚠️ This preserves the old ambiguity for old links, and it cannot do otherwise: a URL that
 * never carried a workspace has no workspace to recover. It resolves where it always did —
 * wherever the recipient happens to be. What changes is that the redirect makes that choice
 * VISIBLE in the address bar, so a link opened in the wrong workspace can now be seen to be
 * in the wrong workspace. Newly copied links carry the slug and are unambiguous.
 */
export const LegacyWorkspaceRedirect = () => {
  const location = useLocation();
  const { user, selectedOrganizationId } = useAuthStore();
  const [slug, setSlug] = useState<string | null | undefined>(undefined);

  // Same derivation the workspace switcher uses — one source of truth for which
  // endpoint may be called.
  const isGlobalAdmin = user?.role === 'admin';

  useEffect(() => {
    let current = true;

    const resolve = async () => {
      if (!user) {
        setSlug(null);
        return;
      }
      try {
        const list: WorkspaceRef[] = isGlobalAdmin
          ? (await organizationService.getAll('', 1, 100)).data
          : await authService.myOrganizations();
        if (!current) return;
        const match =
          list.find((org) => org.id === selectedOrganizationId) ?? (list.length ? list[0] : null);
        setSlug(match?.slug ?? null);
      } catch (error) {
        if (!current) return;
        logger.error('Could not resolve a workspace for a legacy URL:', error);
        setSlug(null);
      }
    };

    void resolve();
    return () => {
      current = false;
    };
  }, [user, isGlobalAdmin, selectedOrganizationId]);

  if (slug === undefined) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size={28} />
      </div>
    );
  }

  // No workspace to send them to — an anonymous visitor, or a genuinely unknown path.
  // NotFound rather than a redirect loop.
  if (!slug) return <NotFoundPage />;

  return <Navigate to={`/w/${slug}${location.pathname}${location.search}`} replace />;
};
