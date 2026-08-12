import { apiClient } from '@/lib/api-client';

/**
 * Thin API layer for the alliance Settings surface (05-09): the alliance
 * name/slug/defaults editor plus a danger-zone detach-all. Mirrors
 * alliance-scim.service.ts — a `base(id)` helper hard-scoped by the allianceId in
 * the route param, every read unwrapping the `sendSuccess` envelope `.data.data`.
 *
 * The alliance id ALWAYS comes from the route param (never the body); a slug
 * collision surfaces as a 409 from the BE (bubbled through the api-client error).
 */

/** Alliance settings — name/slug plus a free-form `settings` defaults blob (v1). */
export type AllianceSettings = {
  id: number;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
};

/** PUT body — at least one field; the allianceId comes from the route, never the body. */
export type AllianceSettingsInput = {
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
};

/** detach-all result — how many orgs were detached, and which ids. */
export type DetachAllResult = {
  detachedCount: number;
  detachedOrgIds: number[];
};

/** delete-alliance result — the removed alliance id and the orgs it detached (they survive). */
export type DeleteAllianceResult = {
  deletedAllianceId: number;
  detachedOrgIds: number[];
};

const base = (allianceId: number): string => `/api/alliances/${allianceId}`;

export const allianceSettingsService = {
  getSettings: async (allianceId: number): Promise<AllianceSettings> => {
    const res = await apiClient.get<{ data: AllianceSettings }>(`${base(allianceId)}/settings`);
    return res.data.data;
  },

  updateSettings: async (
    allianceId: number,
    input: AllianceSettingsInput
  ): Promise<AllianceSettings> => {
    const res = await apiClient.put<{ data: AllianceSettings }>(
      `${base(allianceId)}/settings`,
      input
    );
    return res.data.data;
  },

  /** Danger zone — detach every org from this alliance (A1-guarded per org on the BE). */
  detachAllOrgs: async (allianceId: number): Promise<DetachAllResult> => {
    const res = await apiClient.post<{ data: DetachAllResult }>(
      `${base(allianceId)}/settings/detach-all`,
      {}
    );
    return res.data.data;
  },

  /**
   * Danger zone — delete the alliance entirely (DELETE /api/alliances/:id). GLOBAL-ADMIN
   * ONLY (the BE gates this on requireGlobalAdmin, not alliance_admin). Detaches all
   * workspaces first (they survive), then removes the alliance and its owned rows.
   */
  deleteAlliance: async (allianceId: number): Promise<DeleteAllianceResult> => {
    const res = await apiClient.delete<{ data: DeleteAllianceResult }>(`${base(allianceId)}`);
    return res.data.data;
  },
};
