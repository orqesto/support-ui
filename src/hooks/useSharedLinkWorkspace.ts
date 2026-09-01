import { useEffect, useRef } from 'react';
import { sharedLinkService } from '@/services/sharedLink.service';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentOrgCode } from '@/hooks/useCurrentOrgCode';
import { toast } from '@/lib/toast';
import { logger } from '@/lib/logger';

/** `ORB-MKT-170` — an id that names its workspace. A bare `MKT-170` does not match. */
const ORG_PREFIXED = /^([A-Z]+\d*)-([A-Z]+-[A-Z]*\d+)$/i;

/**
 * Makes a link somebody sent you LAND in the workspace that owns it.
 *
 * ⛔ What used to happen. `?id=ORB-MKT-170` opened while you were in g-2 hit an org-scoped
 * lookup that strips a leading `{code}-` only when it matches YOUR org — so it 404'd. Safe,
 * and useless: the recipient is often a member of the workspace that owns the link.
 *
 * 🔑 The id already names the workspace. `organizations.code` is globally unique, so `ORB`
 * identifies exactly one. This follows it (`/api/messages/locate/:publicId`) and switches
 * the workspace, rather than putting the workspace in the URL path — which would have
 * redirected every saved URL to cover screens nobody shares.
 *
 * ⛔ A BARE id is left alone on purpose. `MKT-170` exists in every workspace with an MKT
 * department, so there is nothing to follow and guessing is precisely how a link opens the
 * wrong conversation. It keeps resolving in the current workspace, exactly as before.
 */
export const useSharedLinkWorkspace = (idParam: string | null) => {
  const { selectedOrganizationId, setSelectedOrganization } = useAuthStore();
  const orgCode = useCurrentOrgCode();
  // One attempt per id. Without this, the switch re-renders the page, the effect re-runs,
  // and the locate call repeats for the same link.
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!idParam) return;

    const match = idParam.match(ORG_PREFIXED);
    if (!match) return; // bare id or numeric — nothing to follow

    const [, code] = match;
    // Already in the right workspace: the normal org-scoped lookup handles it.
    if (orgCode && code.toUpperCase() === orgCode.toUpperCase()) return;
    if (attemptedRef.current === idParam) return;
    attemptedRef.current = idParam;

    let current = true;

    const land = async () => {
      try {
        const response = await sharedLinkService.locate(idParam);
        const data = response.data;
        if (!current || !data) return;

        if (data.status === 'not-a-member') {
          // Name it. The recipient can ask for access instead of staring at a 404 that
          // looks like the conversation was deleted.
          toast.error(
            `That link belongs to the "${data.organizationSlug}" workspace, which you do not have access to.`
          );
          return;
        }

        if (data.organizationId !== selectedOrganizationId) {
          toast.info(`Opening this in the "${data.organizationSlug}" workspace.`);
          setSelectedOrganization(data.organizationId);
        }
      } catch (error) {
        // A 404 here means the id names no workspace we can see. The page's own org-scoped
        // lookup still runs and reports not-found — no need to say it twice.
        logger.error('Could not locate the workspace for a shared link:', error);
      }
    };

    void land();
    return () => {
      current = false;
    };
  }, [idParam, orgCode, selectedOrganizationId, setSelectedOrganization]);
};
