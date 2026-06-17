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
    // BE returns 204 when enforcement is off — axios would treat as success
    // but no payload. We surface that as null so the banner stays hidden.
    validateStatus: (status) => status === 200 || status === 204,
  });
  if (response.status === 204) return null;
  return response.data;
};

export const licenseService = {
  getLicenseStatus,
};
