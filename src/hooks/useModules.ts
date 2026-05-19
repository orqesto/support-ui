import { useEffect, useState } from 'react';
import { subscriptionService } from '@/services/subscription.service';
import { useAuthStore } from '@/stores/authStore';

type ModuleState = {
  activeModules: Set<string>;
  loading: boolean;
};

export const useModules = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const selectedOrganizationId = useAuthStore((state) => state.selectedOrganizationId);
  const user = useAuthStore((state) => state.user);

  const [state, setState] = useState<ModuleState>({ activeModules: new Set(), loading: true });

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ activeModules: new Set(), loading: false });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    subscriptionService
      .getActiveModules()
      .then((modules) => {
        if (!cancelled) {
          setState({ activeModules: new Set(modules.map((mod) => mod.name)), loading: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ activeModules: new Set(), loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, selectedOrganizationId, user?.organizationId]);

  return {
    hasModule: (name: string) => state.activeModules.has(name),
    loading: state.loading,
  };
};
