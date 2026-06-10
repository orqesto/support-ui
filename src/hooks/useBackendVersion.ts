import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

type BackendVersion = {
  version: string;
  gitSha: string;
  buildTime: string;
};

/**
 * Public BE version + git SHA + build time, surfaced in the sidebar footer
 * next to the FE version so FE/BE drift is visible at a glance. Public
 * endpoint, no auth — safe to call before login.
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
      }>('/api/health/version');
      return {
        version: res.data.version ?? 'unknown',
        gitSha: res.data.gitSha ?? 'dev',
        buildTime: res.data.buildTime ?? 'unknown',
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
