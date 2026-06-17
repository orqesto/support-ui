import { useQuery } from '@tanstack/react-query';
import { licenseService, type LicenseStatus } from '@/services/license.service';
import { useAuthStore } from '@/stores/authStore';

/**
 * Polls the server license status for the admin banner.
 *
 * Gated on global-admin role: regular admins / org admins never call the
 * endpoint (BE would return 403, but we save the request too). On hosted
 * SaaS the license is the vendor's self-license — tenant admins must not
 * see this signal.
 *
 * Polling: every hour. The underlying value only changes when validate()
 * runs (every 24h on the BE), so faster polling buys nothing.
 */
export const useLicenseStatus = () => {
  const user = useAuthStore((state) => state.user);
  const isGlobalAdmin = user?.role === 'admin';

  return useQuery<LicenseStatus | null>({
    queryKey: ['license-status'],
    queryFn: licenseService.getLicenseStatus,
    enabled: isGlobalAdmin,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    // Don't refetch on focus — banner state is operator-noise tier, not data
    refetchOnWindowFocus: false,
  });
};
