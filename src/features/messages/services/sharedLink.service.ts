import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type LocateResult =
  | { status: 'found'; organizationId: number; organizationSlug: string; publicId: string }
  | { status: 'not-a-member'; organizationSlug: string };

/**
 * Following a shared link to the workspace that owns it.
 *
 * ⛔ Deliberately NOT in `message.service`. Everything there is org-scoped — it reads within
 * the workspace you are in. This is the one call that crosses that boundary, asking WHICH
 * workspace an id belongs to, and it belongs somewhere the distinction is visible.
 */
export const sharedLinkService = {
  /**
   * Which workspace does an org-prefixed id belong to?
   *
   * ⛔ NOT a lookup. `getById` is org-scoped and 404s a code that is not this workspace's —
   * right for reading, useless for a link somebody sent you. This follows the code instead
   * of stripping it, so a shared `ORB-MKT-170` can LAND rather than 404.
   *
   * A bare `MKT-170` 404s by design: it names no workspace (public ids are unique per org
   * with a per-department counter), so there is nothing to locate.
   */
  locate: async (publicId: string) => {
    const response = await apiClient.get<ApiResponse<LocateResult>>(
      `/api/messages/locate/${encodeURIComponent(publicId)}`
    );
    return response.data;
  },
};
