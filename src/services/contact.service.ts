import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';

export type ContactNote = {
  id: number;
  contactId: number;
  userId: number | null;
  content: string;
  createdAt: string;
  authorFirstName: string | null;
  authorLastName: string | null;
};

export type ContactLabel = {
  id: number;
  name: string;
  color: string;
};

export type LinkedContact = {
  id: number;
  primaryEmail: string;
  displayName: string | null;
};

export type ContactStats = {
  messageCount: number;
  lastMessageAt: string | null;
  isLead: boolean;
};

export type RecentMessage = {
  id: number;
  subject: string | null;
  content: string;
  status: string;
  channel: string;
  createdAt: string;
  ticketId: number | null;
};

export type RecentTicket = {
  id: number;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
};

export type ContactProfile = {
  id: number;
  organizationId: number;
  primaryEmail: string;
  displayName: string | null;
  assignedUserId: number | null;
  assignedUserFirstName: string | null;
  assignedUserLastName: string | null;
  assignedUserEmail: string | null;
  createdAt: string;
  updatedAt: string;
  notes: ContactNote[];
  labels: ContactLabel[];
  linkedContacts: LinkedContact[];
  stats: ContactStats;
  recentMessages: RecentMessage[];
  recentTickets: RecentTicket[];
};

export type ContactListItem = {
  id: number;
  primaryEmail: string;
  displayName: string | null;
  assignedUserId: number | null;
  assignedUserFirstName: string | null;
  assignedUserLastName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  isLead: boolean;
  createdAt: string;
};

export type ContactListResponse = {
  data: ContactListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

export const contactService = {
  getList: async (search?: string, page = 1, limit = 50): Promise<ContactListResponse> => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search?.trim()) params.set('search', search.trim());
    const res = await apiClient.get<ContactListResponse>(`/api/contacts?${params.toString()}`);
    return res;
  },

  getByEmail: async (email: string): Promise<ContactProfile> => {
    const res = await apiClient.get<ApiResponse<ContactProfile>>(
      `/api/contacts/by-email?email=${encodeURIComponent(email)}`
    );
    return res.data.data!;
  },

  update: async (id: number, patch: { displayName?: string | null; assignedUserId?: number | null }): Promise<void> => {
    await apiClient.patch(`/api/contacts/${id}`, patch);
  },

  addNote: async (id: number, content: string): Promise<ContactNote> => {
    const res = await apiClient.post<ApiResponse<ContactNote>>(`/api/contacts/${id}/notes`, { content });
    return res.data;
  },

  deleteNote: async (id: number, noteId: number): Promise<void> => {
    await apiClient.delete(`/api/contacts/${id}/notes/${noteId}`);
  },

  addLabel: async (id: number, labelId: number): Promise<void> => {
    await apiClient.post(`/api/contacts/${id}/labels`, { labelId });
  },

  removeLabel: async (id: number, labelId: number): Promise<void> => {
    await apiClient.delete(`/api/contacts/${id}/labels/${labelId}`);
  },

  linkContact: async (id: number, linkedContactId: number): Promise<void> => {
    await apiClient.post(`/api/contacts/${id}/links`, { linkedContactId });
  },

  unlinkContact: async (id: number, linkedId: number): Promise<void> => {
    await apiClient.delete(`/api/contacts/${id}/links/${linkedId}`);
  },
};
