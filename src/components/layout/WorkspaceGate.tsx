import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { authService } from '@/services/auth.service';
import { organizationService } from '@/services/organization.service';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/lib/logger';

/** The only fields either workspace endpoint is read for here. */
type WorkspaceRef = { id: number; name: string; slug: string };

/**
 * Makes the URL authoritative for which workspace you are looking at.
 *
 * ⛔ THE BUG THIS EXISTS FOR. A deep link carried no workspace, so `?id=MKT-170` resolved
 * against `selectedOrganizationId` — a value persisted in the RECIPIENT's browser. Send a
 * link from orbelli-test to somebody whose last-used workspace was g-2 and it silently
 * resolved there instead.
 *
 * 🔑 That is not a 404. Public ids are unique per ORG (`conversations_public_id_org_idx` is
 * on `(organization_id, public_id)`) and the counter is per department, so two workspaces
 * with an `MKT` department both mint `MKT-1`, `MKT-2`, … On prod today `INF` and `SUP` each
 * exist in SIX workspaces and 54 public ids already resolve in more than one — so the wrong
 * workspace does not fail, it opens a DIFFERENT REAL CONVERSATION that looks correct.
 *
 * The same silent-context failure put a `reply_style` activation intended for `odly` onto
 * framehouse — a client — for about ninety seconds (.planning/BACKLOG.md, 2026-08-16). That
 * capture proposed showing the workspace name on screen; this puts it in the URL instead, so
 * the link itself carries the answer and a reload cannot drop it.
 *
 * ⚠️ Membership is checked HERE for the message, not for the security. The backend scopes
 * every org route by the session's own organization (`requireOrganizationContext`) and
 * `switch-organization` 403s for a non-member — this gate exists so a non-member is TOLD
 * which workspace the link belongs to instead of being silently shown their own.
 */

type GateState =
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'not-a-member'; slug: string }
  | { status: 'unknown-workspace'; slug: string };

export const WorkspaceGate = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user, selectedOrganizationId, setSelectedOrganization } = useAuthStore();
  const [state, setState] = useState<GateState>({ status: 'checking' });

  // Same derivation the workspace switcher uses — one source of truth for which
  // endpoint may be called.
  const isGlobalAdmin = user?.role === 'admin';

  useEffect(() => {
    let current = true;

    const resolve = async () => {
      if (!slug) return;
      setState({ status: 'checking' });
      try {
        // Same two sources the workspace switcher uses: a global admin may browse every
        // workspace, a member may only see their own memberships (`getAll` 403s for them).
        const list: WorkspaceRef[] = isGlobalAdmin
          ? (await organizationService.getAll('', 1, 100)).data
          : await authService.myOrganizations();
        if (!current) return;

        const match = list.find((org) => org.slug === slug);
        if (!match) {
          // A global admin sees every workspace, so an unmatched slug really does not
          // exist; for anybody else it may exist and simply not be theirs. Saying
          // "not found" to a member would be a small lie about another tenant.
          setState(
            isGlobalAdmin
              ? { status: 'unknown-workspace', slug }
              : { status: 'not-a-member', slug }
          );
          return;
        }

        // The URL wins. Anything already rendered under this gate reads the store, so the
        // switch must happen BEFORE children mount — otherwise the first request goes out
        // with the previous workspace's context, which is the whole defect again.
        if (selectedOrganizationId !== match.id) setSelectedOrganization(match.id);
        setState({ status: 'ok' });
      } catch (error) {
        if (!current) return;
        logger.error('Failed to resolve the workspace in the URL:', error);
        // Fail CLOSED. Falling through to the app would resolve the link in whatever
        // workspace happened to be selected — exactly what this gate prevents.
        setState({ status: 'unknown-workspace', slug });
      }
    };

    void resolve();
    return () => {
      current = false;
    };
    // `selectedOrganizationId` is deliberately absent: this effect SETS it, and depending on
    // it would re-run the resolve on its own write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, isGlobalAdmin]);

  if (state.status === 'checking') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size={28} />
      </div>
    );
  }

  if (state.status !== 'ok') {
    return (
      <div className="flex justify-center items-center px-6 min-h-screen">
        <Alert variant="warning" className="max-w-md">
          <div className="flex gap-3 items-start">
            <Building2 className="flex-shrink-0 mt-0.5 w-5 h-5" />
            <div>
              <AlertTitle>
                {state.status === 'not-a-member'
                  ? 'This link belongs to another workspace'
                  : 'Workspace not found'}
              </AlertTitle>
              <AlertDescription>
                {state.status === 'not-a-member' ? (
                  <>
                    The link points at <span className="font-medium">{state.slug}</span>, which
                    you do not have access to. Ask someone in that workspace to share it with
                    you, or switch workspaces if you believe this is a mistake.
                  </>
                ) : (
                  <>
                    No workspace called <span className="font-medium">{state.slug}</span> exists.
                  </>
                )}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  return <Outlet />;
};
