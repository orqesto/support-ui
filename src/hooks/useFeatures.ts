import { useEffect, useState } from 'react';
import { subscriptionService } from '@/services/subscription.service';
import { peekSharedFetch, sharedFetch } from '@/lib/sharedFetch';
import { useAuthStore } from '@/stores/authStore';

/** Plan features and UI flags change on a plan or flag change, not per click; see sharedFetch. */
const SHARED_TTL_MS = 60_000;

type FeatureState = {
  features: Record<string, boolean>;
  loading: boolean;
};

export const useFeatures = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const user = useAuthStore((state) => state.user);

  const cacheKey = `features:${selectedOrganizationId ?? ''}:${user?.organizationId ?? ''}`;
  const [state, setState] = useState<FeatureState>(() => {
    const held = peekSharedFetch<FeatureState['features']>(cacheKey, SHARED_TTL_MS);
    return held ? { features: held, loading: false } : { features: {}, loading: true };
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ features: {}, loading: false });
      return;
    }

    let cancelled = false;
    const held = peekSharedFetch<FeatureState['features']>(cacheKey, SHARED_TTL_MS);
    if (held) {
      setState({ features: held, loading: false });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));

    sharedFetch(
      cacheKey,
      () => subscriptionService.getFeatures(),
      SHARED_TTL_MS
    )
      .then((features) => {
        if (!cancelled) {
          setState({ features, loading: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ features: {}, loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, cacheKey]);

  return {
    hasFeature: (key: string) => state.features[key] === true,
    loading: state.loading,
  };
};
