import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

/**
 * One signed-in device.
 *
 * ⚠️ `userAgent` and `ipAddress` are SELF-REPORTED by the client that signed in. They exist so a
 * person can recognise their own devices in a list and must never be treated as identity — the
 * backend authorizes from the session id, never from these.
 */
export type ActiveSession = {
  id: number;
  familyId: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string;
  createdAt: string;
  /** The session making this request. Revoking it signs the current browser out. */
  isCurrent: boolean;
};

export const sessionsService = {
  async list(): Promise<ActiveSession[]> {
    const res = await apiClient.get<ApiResponse<ActiveSession[]>>('/api/auth/sessions');
    return res.data.data ?? [];
  },

  /** Revoke one device. The backend scopes this to the caller — an id alone proves nothing. */
  async revoke(sessionId: number): Promise<void> {
    await apiClient.delete(`/api/auth/sessions/${sessionId}`);
  },

  /**
   * Revoke every session AND bump the token version, so access tokens already in flight stop
   * verifying immediately rather than living out their remaining minutes.
   */
  async logoutEverywhere(): Promise<void> {
    await apiClient.post('/api/auth/logout-all');
  },
};
