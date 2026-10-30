import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type { LatestNotePreview } from '@/components/contacts/ContactNotesIndicator';
// Domain shapes are generated from the backend zod contract (../BE-service/openapi.json).
// Imported for local use (ContactListResponse) and re-exported for existing call sites.
import type {
  ContactNote,
  ContactLabel,
  LinkedContact,
  ContactProfileEntry,
  ContactStats,
  RecentMessage,
  RecentTicket,
  ContactProfile,
  ContactListItem,
} from '@/types/api';

export type {
  ContactNote,
  ContactLabel,
  LinkedContact,
  ContactProfileEntry,
  ContactStats,
  RecentMessage,
  RecentTicket,
  ContactProfile,
  ContactListItem,
};

export type ContactProfileType =
  | 'email'
  | 'telegram_username'
  | 'telegram_phone'
  | 'slack'
  | 'whatsapp_phone';

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
  /** CA-6: the records page is keyed on the contact ID in its URL, not on an email. */
  getById: async (id: number): Promise<ContactProfile> => {
    const res = await apiClient.get<ApiResponse<ContactProfile>>(`/api/contacts/${id}`);
    return res.data.data!;
  },

  getByEmail: async (email: string): Promise<ContactProfile> => {
    const res = await apiClient.get<ApiResponse<ContactProfile>>(
      `/api/contacts/by-email?email=${encodeURIComponent(email)}`
    );
    return res.data.data!;
  },

  /**
   * Note count + newest note for a customer email, without creating a contact. Version skew: a
   * backend without the route throws, and the caller shows no icon.
   */
  getNoteSummary: async (
    email: string
  ): Promise<{ count: number; latest: LatestNotePreview | null }> => {
    const res = await apiClient.get<
      ApiResponse<{ noteCount?: number; latestNote?: LatestNotePreview | null }>
    >(`/api/contacts/note-summary?email=${encodeURIComponent(email)}`);
    return { count: res.data.data?.noteCount ?? 0, latest: res.data.data?.latestNote ?? null };
  },

  update: async (id: number, patch: { displayName?: string | null; assignedUserId?: number | null }): Promise<void> => {
    await apiClient.patch(`/api/contacts/${id}`, patch);
  },

  addNote: async (id: number, content: string): Promise<ContactNote> => {
    const res = await apiClient.post<ApiResponse<ContactNote>>(`/api/contacts/${id}/notes`, { content });
    return res.data.data!;
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

  addProfile: async (
    id: number,
    profile: { type: ContactProfileType; value: string; label?: string }
  ): Promise<ContactProfileEntry> => {
    const res = await apiClient.post<ApiResponse<ContactProfileEntry>>(
      `/api/contacts/${id}/profiles`,
      profile
    );
    return res.data.data!;
  },

  deleteProfile: async (id: number, profileId: number): Promise<void> => {
    await apiClient.delete(`/api/contacts/${id}/profiles/${profileId}`);
  },
};
