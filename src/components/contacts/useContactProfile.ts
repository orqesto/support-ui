import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { hashNameToLabelColor } from '@/components/messages/inboxCardHelpers';
import { labelService } from '@/services/settings.service';
import type { OrgLabel, OrgUser } from '@/components/contacts/ContactProfileDetails';
import type { ApiResponse } from '@/types';
import {
  type ContactProfile,
  type ContactProfileType,
  contactService,
} from '@/services/contact.service';

/**
 * All the state + handlers for viewing and editing a single contact profile
 * (assigned manager, labels, channel profiles, linked contacts, notes, name).
 *
 * Extracted from ContactProfilePanel so the same editable contact component can
 * be rendered both in the standalone drawer and inline in the message-detail
 * CUSTOMER tab. `enabled` lets a caller (the tab) defer loading until visible.
 */
export function useContactProfile(
  email: string,
  options?: { enabled?: boolean; onChanged?: () => void }
) {
  const enabled = options?.enabled ?? true;
  // Fired after a mutation that also surfaces on the inbox/kanban cards or the
  // open thread — e.g. labels, which are rendered on cards as source:'contact'
  // via message.labels. Lets the caller refetch that list/thread so it re-renders.
  const onChanged = options?.onChanged;

  const [contact, setContact] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [orgLabels, setOrgLabels] = useState<OrgLabel[]>([]);

  // Edit state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [linkEmailInput, setLinkEmailInput] = useState('');
  const [linkingEmail, setLinkingEmail] = useState(false);
  const [profileTypeInput, setProfileTypeInput] = useState<ContactProfileType>('email');
  const [profileValueInput, setProfileValueInput] = useState('');
  const [profileLabelInput, setProfileLabelInput] = useState('');
  const [addingProfile, setAddingProfile] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [creatingLabel, setCreatingLabel] = useState(false);

  const load = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    try {
      const [profile, usersRes, labelsRes] = await Promise.all([
        contactService.getByEmail(email),
        apiClient.get<ApiResponse<OrgUser[]>>('/api/users'),
        apiClient.get<ApiResponse<OrgLabel[]>>('/api/labels'),
      ]);
      setContact(profile);
      setNameInput(profile.displayName ?? '');
      setUsers((usersRes.data.data as { users?: OrgUser[] } | null)?.users ?? []);
      setOrgLabels(labelsRes.data.data ?? []);
    } catch {
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const handleSaveName = async () => {
    if (!contact) return;
    setSavingName(true);
    try {
      await contactService.update(contact.id, { displayName: nameInput.trim() || null });
      setContact((prev) => (prev ? { ...prev, displayName: nameInput.trim() || null } : prev));
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const handleAssign = async (userId: number | null) => {
    if (!contact) return;
    await contactService.update(contact.id, { assignedUserId: userId });
    const user = users.find((usr) => usr.id === userId) ?? null;
    setContact((prev) =>
      prev
        ? {
            ...prev,
            assignedUserId: userId,
            assignedUserFirstName: user?.firstName ?? null,
            assignedUserLastName: user?.lastName ?? null,
            assignedUserEmail: user?.email ?? null,
          }
        : prev
    );
  };

  const handleAddNote = async () => {
    if (!contact || !noteInput.trim()) return;
    setAddingNote(true);
    try {
      const note = await contactService.addNote(contact.id, noteInput.trim());
      setContact((prev) => (prev ? { ...prev, notes: [note, ...prev.notes] } : prev));
      setNoteInput('');
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (!contact) return;
    await contactService.deleteNote(contact.id, noteId);
    setContact((prev) => (prev ? { ...prev, notes: prev.notes.filter((note) => note.id !== noteId) } : prev));
  };

  const handleAddLabel = async (labelId: number) => {
    if (!contact) return;
    await contactService.addLabel(contact.id, labelId);
    const label = orgLabels.find((lbl) => lbl.id === labelId);
    if (label) {
      setContact((prev) =>
        prev && !prev.labels.some((lbl) => lbl.id === labelId)
          ? { ...prev, labels: [...prev.labels, label] }
          : prev
      );
    }
    setShowLabelPicker(false);
    onChanged?.();
  };

  const handleCreateLabel = async (name: string) => {
    // Guard against a double-click creating two identical org-wide labels.
    if (!contact || !name.trim() || creatingLabel) return;
    setCreatingLabel(true);
    try {
      const created = await labelService.createLabel({
        name: name.trim(),
        color: hashNameToLabelColor(name.trim()),
      });
      setOrgLabels((prev) => (prev.some((lbl) => lbl.id === created.id) ? prev : [created, ...prev]));
      await contactService.addLabel(contact.id, created.id);
      setContact((prev) =>
        prev && !prev.labels.some((lbl) => lbl.id === created.id)
          ? { ...prev, labels: [...prev.labels, created] }
          : prev
      );
      setShowLabelPicker(false);
      onChanged?.();
    } catch {
      // leave the picker open so the user can retry
    } finally {
      setCreatingLabel(false);
    }
  };

  const handleRemoveLabel = async (labelId: number) => {
    if (!contact) return;
    await contactService.removeLabel(contact.id, labelId);
    setContact((prev) => (prev ? { ...prev, labels: prev.labels.filter((lbl) => lbl.id !== labelId) } : prev));
    onChanged?.();
  };

  const handleAddProfile = async () => {
    if (!contact || !profileValueInput.trim()) return;
    setAddingProfile(true);
    try {
      const profile = await contactService.addProfile(contact.id, {
        type: profileTypeInput,
        value: profileValueInput.trim(),
        label: profileLabelInput.trim() || undefined,
      });
      setContact((prev) =>
        prev && !prev.profiles.some((prof) => prof.id === profile.id)
          ? { ...prev, profiles: [...prev.profiles, profile] }
          : prev
      );
      setProfileValueInput('');
      setProfileLabelInput('');
      setShowProfileForm(false);
    } finally {
      setAddingProfile(false);
    }
  };

  const handleDeleteProfile = async (profileId: number) => {
    if (!contact) return;
    await contactService.deleteProfile(contact.id, profileId);
    setContact((prev) =>
      prev ? { ...prev, profiles: prev.profiles.filter((prof) => prof.id !== profileId) } : prev
    );
  };

  const handleLinkEmail = async () => {
    if (!contact || !linkEmailInput.trim()) return;
    setLinkingEmail(true);
    try {
      const linked = await contactService.getByEmail(linkEmailInput.trim().toLowerCase());
      if (linked.id === contact.id) return;
      await contactService.linkContact(contact.id, linked.id);
      setContact((prev) =>
        prev && !prev.linkedContacts.some((existing) => existing.id === linked.id)
          ? {
              ...prev,
              linkedContacts: [
                ...prev.linkedContacts,
                { id: linked.id, primaryEmail: linked.primaryEmail, displayName: linked.displayName },
              ],
            }
          : prev
      );
      setLinkEmailInput('');
    } finally {
      setLinkingEmail(false);
    }
  };

  const handleUnlink = async (linkedId: number) => {
    if (!contact) return;
    await contactService.unlinkContact(contact.id, linkedId);
    setContact((prev) =>
      prev ? { ...prev, linkedContacts: prev.linkedContacts.filter((lnk) => lnk.id !== linkedId) } : prev
    );
  };

  const availableLabels = orgLabels.filter((lbl) => !contact?.labels.some((current) => current.id === lbl.id));

  return {
    contact,
    setContact,
    loading,
    reload: load,
    users,
    orgLabels,
    availableLabels,
    // name editing
    editingName,
    setEditingName,
    nameInput,
    setNameInput,
    savingName,
    handleSaveName,
    // notes
    noteInput,
    setNoteInput,
    addingNote,
    handleAddNote,
    handleDeleteNote,
    // labels
    showLabelPicker,
    setShowLabelPicker,
    handleAddLabel,
    handleRemoveLabel,
    handleCreateLabel,
    creatingLabel,
    // assign
    handleAssign,
    // channel profiles
    profileTypeInput,
    setProfileTypeInput,
    profileValueInput,
    setProfileValueInput,
    profileLabelInput,
    setProfileLabelInput,
    addingProfile,
    showProfileForm,
    setShowProfileForm,
    handleAddProfile,
    handleDeleteProfile,
    // linked contacts
    linkEmailInput,
    setLinkEmailInput,
    linkingEmail,
    handleLinkEmail,
    handleUnlink,
  };
}
