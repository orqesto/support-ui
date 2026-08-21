import { apiClient } from '@/lib/api-client';
import type { FilterState } from '@/stores/messagesStore';

/** A named filter preset belonging to the signed-in user, in this workspace. */
export type RemoteSavedView = {
  id: number;
  name: string;
  filters: Partial<FilterState>;
  createdAt: string;
  updatedAt: string;
};

type Envelope<T> = { success: boolean; data: T };

/**
 * Saved views, server-side.
 *
 * They lived in localStorage, which made a view a property of the BROWSER rather than of
 * the person — it did not follow anyone to a second machine, and clearing site data took
 * it. `savedViews.ts` keeps the localStorage path as a fallback for the window where this
 * frontend is live and the endpoint is not yet.
 */
export const savedViewService = {
  list: async (): Promise<RemoteSavedView[]> => {
    const response = await apiClient.get<Envelope<RemoteSavedView[]>>('/api/messages/saved-views');
    return response.data.data;
  },

  /** Create, or replace the one that already has this name — the name is how a view is
   *  referred to, so two of them is a state the pill bar cannot express. */
  save: async (name: string, filters: Partial<FilterState>): Promise<RemoteSavedView> => {
    const response = await apiClient.post<Envelope<RemoteSavedView>>('/api/messages/saved-views', {
      name,
      filters,
    });
    return response.data.data;
  },

  rename: async (id: number, name: string): Promise<RemoteSavedView> => {
    const response = await apiClient.patch<Envelope<RemoteSavedView>>(
      `/api/messages/saved-views/${id}`,
      { name }
    );
    return response.data.data;
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/messages/saved-views/${id}`);
  },
};
