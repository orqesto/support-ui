import { apiClient } from '@/lib/api-client';

/**
 * Cached server-license validation result, used by the admin UI to render an
 * expiry banner. Returned by GET /api/admin/license-status. Global-admin only.
 * 204 (no body) means license enforcement is off (dev / SMOKE_TEST=true / not
 * yet validated) — banner stays hidden in that case.
 */
export type LicenseStatus = {
  clientId: string;
  expiresAt: string;
  daysLeft: number;
  validatedAt: string;
};

const getLicenseStatus = async (): Promise<LicenseStatus | null> => {
  const response = await apiClient.get<LicenseStatus>('/api/admin/license-status', {
    // 200 → payload. 204 → enforcement off (dev / SMOKE_TEST). 404 → BE doesn't
    // have the endpoint yet (FE deployed ahead of BE). All map to null so the
    // banner stays hidden — never surface a console error for a missing banner.
    validateStatus: (status) => status === 200 || status === 204 || status === 404,
  });
  if (response.status !== 200) return null;
  return response.data;
};

export const licenseService = {
  getLicenseStatus,
};
