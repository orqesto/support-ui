import { apiClient } from '@/lib/api-client';

/**
 * Console moderation of profile photos (global admin). Its own file: `platform.service.ts` is at
 * its size limit.
 */
export const platformUserPhotoService = {
  /** DELETE /api/admin/platform/users/:id/photo — reason required, platform-audited. */
  remove: async (id: number, reason: string): Promise<void> => {
    await apiClient.delete(`/api/admin/platform/users/${id}/photo`, {
      data: { reason: reason.trim() },
    });
  },
};
