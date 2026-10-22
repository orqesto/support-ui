import { apiClient } from '@/lib/api-client';

/** One of the signed-in user's recent thread searches, in this workspace. */
export type RecentSearch = { id: number; query: string; lastUsedAt: string };

type Envelope<T> = { success: boolean; data: T };

/**
 * Recent thread searches, server-side, so they follow the person to another browser.
 *
 * Only the text is stored: picking one runs the search again, so the results are current.
 */
export const recentSearchService = {
  list: async (): Promise<RecentSearch[]> => {
    const response = await apiClient.get<Envelope<RecentSearch[]>>('/api/messages/recent-searches');
    // Tolerate a missing or odd body rather than white-screening the search bar.
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  /** Remember a search, or move it to the top. The server keeps the latest few. */
  record: async (query: string): Promise<RecentSearch> => {
    const response = await apiClient.post<Envelope<RecentSearch>>('/api/messages/recent-searches', {
      query,
    });
    return response.data.data;
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/messages/recent-searches/${id}`);
  },

  clear: async (): Promise<void> => {
    await apiClient.delete('/api/messages/recent-searches');
  },
};
