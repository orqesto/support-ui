import { useEffect, useState } from 'react';
import { subscriptionService } from '@/services/subscription.service';
import { useAuthStore } from '@/stores/authStore';

type FeatureState = {
  features: Record<string, boolean>;
  loading: boolean;
};

export const useFeatures = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const user = useAuthStore((state) => state.user);

  const [state, setState] = useState<FeatureState>({ features: {}, loading: true });

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ features: {}, loading: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    subscriptionService
      .getFeatures()
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
  }, [isAuthenticated, selectedOrganizationId, user?.organizationId]);

  return {
    hasFeature: (key: string) => state.features[key] === true,
    loading: state.loading,
  };
};
