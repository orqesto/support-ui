import { useEffect, useState } from 'react';
import { featureFlagsService, type UiFeatureFlags } from '@/services/featureFlags.service';
import { useAuthStore } from '@/stores/authStore';

type UiFlagState = {
  flags: UiFeatureFlags;
  loading: boolean;
};

/**
 * Whether each user-facing surface is available (built and switched on).
 *
 * Mirrors `useFeatures`, and is deliberately a SEPARATE hook rather than more keys on it:
 * plan entitlement and build-completeness are different questions with different answers
 * when they disagree — a surface can be included in your plan and still not exist yet.
 *
 * `isSurfaceEnabled` is false while loading and false on failure, so an unfinished page is
 * never shown during the request. That means callers should gate NAVIGATION on it freely,
 * but should not use it to decide whether to redirect a user away from a URL they are
 * already on until `loading` is false — see `FeatureGate`, which waits.
 *
 * ## Global-admin preview
 *
 * A switched-off surface stays reachable for global admins, so staff can watch a feature
 * come together against real data while customers see nothing. That makes the two
 * questions distinct, and the distinction lives HERE rather than at each call site so the
 * nav and the route gate cannot drift apart:
 *
 *   - `isSurfaceEnabled(key)` — is it actually on? (what the flag says)
 *   - `isSurfaceVisibleToMe(key)` — should *this* viewer see it? (flag OR global admin)
 *   - `isPreviewing(key)` — am I seeing it only because I am staff? (drives the marker)
 *
 * The preview is a VISIBILITY concession only. It never implies the feature works, and it
 * must never be mistaken for the flag being on — anything deciding whether a surface is
 * launched has to ask `isSurfaceEnabled`.
 */
export const useUiFlags = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const user = useAuthStore((state) => state.user);

  const [state, setState] = useState<UiFlagState>({ flags: {}, loading: true });

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ flags: {}, loading: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    featureFlagsService
      .getUiFlags()
      .then((flags) => {
        if (!cancelled) setState({ flags, loading: false });
      })
      .catch(() => {
        // getUiFlags already fails closed; this is belt-and-braces so a throw can never
        // leave `loading` stuck true and the app spinning.
        if (!cancelled) setState({ flags: {}, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedOrganizationId, user?.organizationId]);

  const isSurfaceEnabled = (key: string) => state.flags[key] === true;
  // Staff preview. Global admin is the same signal the rest of the app uses for
  // Odly-staff-only surfaces (see Layout's `adminOnly`).
  const canPreviewUnfinished = user?.role === 'admin';

  return {
    isSurfaceEnabled,
    canPreviewUnfinished,
    isSurfaceVisibleToMe: (key: string) => isSurfaceEnabled(key) || canPreviewUnfinished,
    isPreviewing: (key: string) => !isSurfaceEnabled(key) && canPreviewUnfinished,
    loading: state.loading,
  };
};
