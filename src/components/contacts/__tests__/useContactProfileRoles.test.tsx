/**
 * FE audit 2026-09-29, A-H1: the contact, the user list and the label list loaded in one
 * `Promise.all`, and any failure set the contact to null. `GET /api/users` needs VIEW_USERS and
 * `GET /api/labels` needs VIEW_LABELS; the built-in associate role has neither, so every
 * Customer tab and contact drawer an associate opened read "Failed to load contact." — with the
 * notes, labels and profiles the backend had returned to them thrown away.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const getByEmail = vi.fn();
const addNote = vi.fn();
const deleteNote = vi.fn();
const getAllPages = vi.fn();
const apiGet = vi.fn();
let permissions: Record<string, boolean> = {};

vi.mock('@/services/contact.service', () => ({
  contactService: { getByEmail, addNote, deleteNote },
}));
vi.mock('@/services/user.service', () => ({ userService: { getAllPages } }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: apiGet } }));
vi.mock('@/services/settings.service', () => ({ labelService: {} }));
vi.mock('@/components/messages/inboxCardHelpers', () => ({ hashNameToLabelColor: () => '#000' }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (permission: string) => permissions[permission] ?? false,
    hasAnyPermission: (list: string[]) => list.some((permission) => permissions[permission]),
    hasAllPermissions: (list: string[]) => list.every((permission) => permissions[permission]),
  }),
}));

const { useContactProfile } = await import('../useContactProfile');
const { useAuthStore } = await import('@/stores/authStore');

const profile = {
  id: 9,
  primaryEmail: 'jane@example.com',
  displayName: 'Jane',
  notes: [{ id: 1, content: 'VIP', createdAt: '2026-10-01T00:00:00Z' }],
  labels: [],
  profiles: [],
  linkedContacts: [],
};
const forbidden = () => Promise.reject(Object.assign(new Error('Forbidden'), { status: 403 }));

describe('an associate can open a contact', () => {
  beforeEach(() => {
    getByEmail.mockReset().mockResolvedValue(profile);
    getAllPages.mockReset().mockResolvedValue({ data: [{ id: 1, email: 'a@x' }] });
    apiGet.mockReset().mockResolvedValue({ data: { data: [{ id: 2, name: 'Billing' }] } });
    permissions = { view_users: true, view_labels: true };
  });

  it('the user list answering 403 leaves the contact, its notes and an empty picker', async () => {
    getAllPages.mockImplementation(forbidden);
    const { result } = renderHook(() => useContactProfile('jane@example.com'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact?.id).toBe(9);
    expect(result.current.contact?.notes).toHaveLength(1);
    expect(result.current.users).toEqual([]);
    expect(result.current.orgLabels).toEqual([{ id: 2, name: 'Billing' }]);
  });

  it('the label list answering 403 leaves the contact and the users', async () => {
    apiGet.mockImplementation(forbidden);
    const { result } = renderHook(() => useContactProfile('jane@example.com'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact?.id).toBe(9);
    expect(result.current.users).toEqual([{ id: 1, email: 'a@x' }]);
    expect(result.current.orgLabels).toEqual([]);
  });

  it('a role without VIEW_USERS / VIEW_LABELS is not asked for either list, and sees the contact', async () => {
    permissions = {};
    const { result } = renderHook(() => useContactProfile('jane@example.com'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact?.id).toBe(9);
    expect(getAllPages).not.toHaveBeenCalled();
    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current.availableLabels).toEqual([]);
  });

  it('CONTROL: the contact itself failing still reads as not loaded', async () => {
    getByEmail.mockImplementation(forbidden);
    const { result } = renderHook(() => useContactProfile('jane@example.com'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact).toBeNull();
  });

  it('CONTROL: with everything allowed and answering, all three load', async () => {
    const { result } = renderHook(() => useContactProfile('jane@example.com'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contact?.displayName).toBe('Jane');
    expect(result.current.nameInput).toBe('Jane');
    expect(result.current.users).toHaveLength(1);
    expect(result.current.orgLabels).toHaveLength(1);
  });
});

describe('a note change is announced (2026-10-17)', () => {
  beforeEach(() => {
    getByEmail.mockReset().mockResolvedValue(profile);
    permissions = {};
  });

  it('adding and deleting a note each fire the notes-changed signal the list and tab label follow', async () => {
    const { CONTACT_NOTES_CHANGED } = await import('../ContactNotesIndicator');
    const heard = vi.fn();
    window.addEventListener(CONTACT_NOTES_CHANGED, heard);
    try {
      addNote.mockResolvedValue({ id: 2, content: 'new', createdAt: '2026-10-02T00:00:00Z' });
      deleteNote.mockResolvedValue(undefined);
      const { result } = renderHook(() => useContactProfile('jane@example.com'));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(heard).not.toHaveBeenCalled();
      act(() => result.current.setNoteInput('new'));
      await act(() => result.current.handleAddNote());
      expect(heard).toHaveBeenCalledTimes(1);
      await act(() => result.current.handleDeleteNote(2));
      expect(heard).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(CONTACT_NOTES_CHANGED, heard);
    }
  });
});

describe('a note just added shows its author (2026-10-18)', () => {
  beforeEach(() => {
    getByEmail.mockReset().mockResolvedValue(profile);
    permissions = {};
  });

  const addAs = async (saved: object) => {
    addNote.mockResolvedValue(saved);
    const { result } = renderHook(() => useContactProfile('jane@example.com'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setNoteInput('new'));
    await act(() => result.current.handleAddNote());
    return result.current.contact!.notes[0];
  };

  it('the add answers with the bare row: the signed-in user is the author, not "Unknown"', async () => {
    useAuthStore.setState({ user: { firstName: 'Ada', lastName: 'Agent' } as never });
    try {
      const note = await addAs({ id: 2, content: 'new', createdAt: '2026-10-02T00:00:00Z' });
      expect(note).toMatchObject({ id: 2, authorFirstName: 'Ada', authorLastName: 'Agent' });
    } finally {
      useAuthStore.setState({ user: null });
    }
  });

  it('[control] author names the server sends win', async () => {
    useAuthStore.setState({ user: { firstName: 'Ada', lastName: 'Agent' } as never });
    try {
      const note = await addAs({
        id: 3,
        content: 'new',
        createdAt: '2026-10-02T00:00:00Z',
        authorFirstName: 'Nora',
        authorLastName: 'Notes',
      });
      expect(note).toMatchObject({ authorFirstName: 'Nora', authorLastName: 'Notes' });
    } finally {
      useAuthStore.setState({ user: null });
    }
  });
});
