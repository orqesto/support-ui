import { apiClient } from '@/lib/api-client';
import type { TicketViewFilters } from '@/components/tickets/list/ticketViews';

/** A named tickets-list filter preset belonging to the signed-in user, in this workspace. */
export type RemoteTicketView = {
  id: number;
  name: string;
  filters: TicketViewFilters;
  createdAt: string;
  updatedAt: string;
};

type Envelope<T> = { success: boolean; data: T };

const BASE = '/api/tickets/saved-views';

/**
 * The tickets list's saved views, server-side — the same per-user store as the inbox's views,
 * on its own surface, so neither pill bar ever shows the other's views.
 */
export const ticketSavedViewsService = {
  list: async (): Promise<RemoteTicketView[]> => {
    const response = await apiClient.get<Envelope<RemoteTicketView[]>>(BASE);
    return response.data.data;
  },

  /** Create, or replace the one that already has this name. */
  save: async (name: string, filters: TicketViewFilters): Promise<RemoteTicketView> => {
    const response = await apiClient.post<Envelope<RemoteTicketView>>(BASE, { name, filters });
    return response.data.data;
  },

  rename: async (id: number, name: string): Promise<RemoteTicketView> => {
    const response = await apiClient.patch<Envelope<RemoteTicketView>>(`${BASE}/${id}`, { name });
    return response.data.data;
  },

  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`${BASE}/${id}`);
  },
};
