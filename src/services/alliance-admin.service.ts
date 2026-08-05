import { apiClient } from '@/lib/api-client';

/**
 * Alliance admin console service. All calls hit `/api/alliances/*`, so the
 * api-client interceptor (D-ADM-1) attaches X-Alliance-Context and suppresses
 * X-Organization-Context automatically — this layer never sets scope headers.
 * The BE wraps payloads as { success, message, data }; we unwrap `.data.data`.
 */
export type AllianceOverview = {
  id: number;
  name: string;
  slug: string;
  counts: { orgs: number; members: number; groups: number };
  sso: { connected: boolean };
  scim: { connected: boolean };
};

export type MyAlliance = { id: number; name: string; slug: string; orgCount: number };

const BASE = '/api/alliances';

export const allianceAdminService = {
  /** Real orgs/members/groups counts + connection status for one alliance. */
  getOverview: async (allianceId: number): Promise<AllianceOverview> => {
    const res = await apiClient.get<{ data: AllianceOverview }>(`${BASE}/${allianceId}/overview`);
    return res.data.data;
  },

  /** The alliances the current user may administer (drives switcher + nav gate). */
  listMyAlliances: async (): Promise<MyAlliance[]> => {
    const res = await apiClient.get<{ data: MyAlliance[] }>(`${BASE}/mine`);
    return res.data.data;
  },
};
