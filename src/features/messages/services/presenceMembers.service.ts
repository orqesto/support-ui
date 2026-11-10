import { isAxiosError } from 'axios';
import { apiClient } from '@/lib/api-client';

/** One workspace member, as the presence UI names them. `id` is the user id. */
export interface PresenceMember {
  id: number;
  firstName: string | null;
  lastName: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const presenceMembersService = {
  /**
   * The workspace's members for the presence names (GET /api/presence/members): readable by any
   * member, associates included. A backend without the route (403/404, an older release) or a
   * workspace whose subscription lapsed (402) gives an empty list, so the UI says "Another agent"
   * and the answer is cached like any other — no request on every mount. Any other failure throws.
   */
  list: async (): Promise<PresenceMember[]> => {
    try {
      const response = await apiClient.get<unknown>('/api/presence/members');
      // `{members}`; tolerate the `{success, data: {members}}` envelope as well.
      const body = response.data as {
        members?: unknown;
        data?: { members?: unknown };
      } | null;
      const members = body?.members ?? body?.data?.members;
      if (!Array.isArray(members)) return [];
      return members.flatMap((raw: unknown) => {
        const member = raw as { id?: unknown; firstName?: unknown; lastName?: unknown } | null;
        if (typeof member?.id !== 'number') return [];
        return [
          { id: member.id, firstName: text(member.firstName), lastName: text(member.lastName) },
        ];
      });
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 402 || status === 403 || status === 404) return [];
      throw error;
    }
  },
};
