import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

type BackendVersion = {
  version: string;
  gitSha: string;
  buildTime: string;
  selfHosted: boolean;
};

/**
 * Public BE version + git SHA + build time, surfaced in the sidebar footer
 * next to the FE version so FE/BE drift is visible at a glance. Public
 * endpoint, no auth — safe to call before login.
 *
 * Also exposes `selfHosted` so Layout can hide customer-facing billing UI
 * (Subscription, Pricing, Billing Intelligence) on self-hosted deployments.
 * Defaults to false on missing field so existing SaaS clients are unaffected.
 */
export const useBackendVersion = () =>
  useQuery<BackendVersion>({
    queryKey: ['backend-version'],
    queryFn: async () => {
      const res = await apiClient.get<{
        success: boolean;
        version: string;
        gitSha?: string;
        buildTime?: string;
        deployment?: { selfHosted?: boolean };
      }>('/api/health/version');
      return {
        version: res.data.version ?? 'unknown',
        gitSha: res.data.gitSha ?? 'dev',
        buildTime: res.data.buildTime ?? 'unknown',
        selfHosted: res.data.deployment?.selfHosted ?? false,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
