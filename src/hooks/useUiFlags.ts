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

  return {
    isSurfaceEnabled: (key: string) => state.flags[key] === true,
    loading: state.loading,
  };
};
